import { z } from "zod";
import { exactCombat } from "./combat-exact.js";

const Dice = z.union([
  z.number().int().min(0).max(100),
  z.string().regex(/^(?:[1-9]|10)?D(?:3|6)(?:\+[0-9]{1,2})?$/i),
]);
const Reroll = z.enum(["none", "ones", "failed"]).default("none");
export const DefenderSchema = z
      .object({
        models: z.number().int().min(1).max(100),
        wounds: z.number().int().min(1).max(100),
        toughness: z.number().int().min(1).max(30),
        save: z.number().int().min(2).max(7),
        invulnerable: z.number().int().min(2).max(7).optional(),
        mortalFeelNoPain: z.number().int().min(2).max(6).optional(),
        feelNoPain: z.number().int().min(2).max(6).optional(),
        damageReduction: z.number().int().min(0).max(5).default(0),
        halveDamage: z.boolean().default(false),
        saveBonus: z.number().int().min(0).max(2).default(0),
        woundModifier: z.number().int().min(-1).max(1).default(0),
      })
      .strict();
export const CombatSchema = z
  .object({
    snapshotId: z.string().optional(),
    label: z.string().max(200).default("Combat scenario"),
    trials: z.number().int().min(1000).max(100000).optional().describe("Deprecated; ignored by exact calculations"),
    seed: z.number().int().min(0).max(4294967295).optional().describe("Deprecated; ignored by exact calculations"),
    defender: DefenderSchema.optional(),
    defenderGroups: z.array(DefenderSchema.extend({name: z.string().max(120)})).min(1).max(20).optional(),
    unitToughness: z.number().int().min(1).max(30).optional(),
    mortalWounds: Dice.default(0),
    mortalWoundsTiming: z.enum(["before", "after"]).default("after"),
    weapons: z
      .array(
        z
          .object({
            name: z.string().max(120),
            models: z.number().int().min(1).max(100),
            attacks: Dice,
            skill: z.number().int().min(2).max(6),
            strength: z.number().int().min(1).max(40),
            ap: z.number().int().min(-6).max(0),
            damage: Dice,
            hitModifier: z.number().int().min(-1).max(1).default(0),
            woundModifier: z.number().int().min(-1).max(1).default(0),
            hitReroll: Reroll,
            woundReroll: Reroll,
            criticalHit: z.number().int().min(2).max(6).default(6),
            criticalWound: z.number().int().min(2).max(6).default(6),
            lethalHits: z.boolean().default(false),
            sustainedHits: Dice.default(0),
            devastatingWounds: z.boolean().default(false),
            devastatingSpill: z.boolean().default(false),
            torrent: z.boolean().default(false),
            blast: z.boolean().default(false),
            rapidFire: z.number().int().min(0).max(12).default(0),
            melta: z.number().int().min(0).max(10).default(0),
            withinHalfRange: z.boolean().default(false),
            unsupportedAbilities: z.array(z.string()).default([]),
            sourceReferences: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    assumptions: z.array(z.string().max(300)).max(30).default([]),
  })
  .strict();
export type Combat = z.infer<typeof CombatSchema>;
export function calculateCombat(input: unknown) {
  const parsed = CombatSchema.parse(input);
  // Old saved inputs remain readable, but trial count and seed have no effect.
  const {trials: _trials, seed: _seed, ...scenario} = parsed;
  const c = scenario as Combat;
  if (Boolean(c.defender) === Boolean(c.defenderGroups)) throw new Error("Supply either defender or defenderGroups, not both.");
  const unsupported = c.weapons.flatMap(w => w.unsupportedAbilities);
  if (unsupported.length) return {status: "incomplete" as const, unsupported, summary: "No calculation performed: model these interactions explicitly or remove them and label the result as a restricted scenario."};
  return {
    status: "calculated" as const,
    label: c.label,
    snapshotId: c.snapshotId ?? null,
    ...exactCombat(c),
    appliedScenario: scenario,
    assumptions: [
      "Defender groups allocate front to back, finishing each model before the next; fixed weapon order; damage capped at remaining target wounds.",
      c.unitToughness ? `All wound tests use declared unit Toughness ${c.unitToughness}, including after group losses.` : "Wound tests use the currently allocated model's Toughness. Set unitToughness if your unit rules require a shared value.",
      "Direct mortal wounds spill one point at a time, bypass saves and ordinary damage reduction, and use the receiving model's best eligible Feel No Pain. Devastating damage uses the selected spill setting and general Feel No Pain only; verify eligibility in your rules.",
      "Profiles and buffs are explicit scenario inputs, not independently certified rules. Cite and verify their source.",
      "No movement, engagement, targeting, range or line-of-sight simulation; declared weapons are assumed eligible.",
      "Hit/wound modifiers capped at +/-1; natural 1 fails; critical thresholds are explicit.",
      "Blast uses starting target model count. Torrent produces no critical hits. Lethal hits are not critical wounds.",
      "Damage order: halve rounding up, add active melta, subtract reduction (minimum 1 for nonzero damage), then Feel No Pain. Save bonus is explicit, not automatic cover eligibility.",
      "Only listed effects are modeled. Anti uses criticalWound after checking target keyword; twin-linked uses failed wound rerolls. Hazardous self-damage, precision and automatic attached-unit toughness transitions are unsupported.",
      ...c.assumptions,
    ],
    summary:
      "Combat odds for this declared scenario only; not a prediction of match wins.",
  };
}
