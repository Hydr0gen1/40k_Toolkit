import { findLibraryUnit, libraryUnits } from "./unit-library.js";
import type { Combat } from "../combat.js";
export type Member = { unitId: string; size: number; loadout?: string };
// Recover the displayed weapon's base stats before changing its attachments.
// Numeric edits are kept while removing the bonus already shown in the form.
export function restoreUnbuffedProfile(
  current: Record<string, unknown>,
  base: Record<string, unknown>,
  applied: Record<string, unknown>,
) {
  const out = { ...base };
  for (const [key, value] of Object.entries(current)) {
    if (value === applied[key]) continue;
    if (
      typeof value === "number" &&
      typeof base[key] === "number" &&
      typeof applied[key] === "number"
    )
      out[key] = value - (applied[key] - base[key]);
    else out[key] = value;
  }
  return out;
}
export type AttachmentConfig = {
  bodyguard?: Member;
  leader?: Member;
  support?: Member;
  isolated?: boolean;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function attachmentRole(id: string): "leader" | "support" | undefined {
  const u = findLibraryUnit(id);
  return u?.supportTo.length
    ? "support"
    : u?.leaderTo.length
      ? "leader"
      : undefined;
}
export function canAttach(
  characterId: string,
  bodyguardId: string,
  role: "leader" | "support",
) {
  const c = findLibraryUnit(characterId),
    b = findLibraryUnit(bodyguardId);
  if (!c || !b) return false;
  const allowed = role === "leader" ? c.leaderTo : c.supportTo;
  if (!allowed.some((n) => norm(n) === norm(b.name))) return false;
  const generic = (o: string) =>
    ["Space Marines", "Codex Space Marines"].includes(o);
  return generic(c.origin) || generic(b.origin) || c.origin === b.origin;
}
export function eligibleBodyguards(id: string) {
  const role = attachmentRole(id);
  return role ? libraryUnits.filter((b) => canAttach(id, b.id, role)) : [];
}
export function eligibleCharacters(
  bodyguardId: string,
  role: "leader" | "support",
) {
  return libraryUnits.filter((c) => canAttach(c.id, bodyguardId, role));
}
export function resolveAttachedUnit(main: Member, config: AttachmentConfig) {
  const role = attachmentRole(main.unitId);
  if (config.isolated) {
    if (config.bodyguard || config.leader || config.support)
      throw new Error(
        "A character alone can’t also have a squad or another attached character.",
      );
    return {
      bodyguard: undefined,
      leader: undefined,
      support: undefined,
      members: [main],
      isolated: true,
    };
  }
  const bodyguard = role ? config.bodyguard : main;
  if (role && !bodyguard)
    throw new Error("Choose a bodyguard squad, or tick Character alone.");
  const leader = role === "leader" ? main : config.leader,
    support = role === "support" ? main : config.support;
  if (bodyguard && attachmentRole(bodyguard.unitId))
    throw new Error("Choose a squad as the bodyguard.");
  for (const [r, c] of [
    ["leader", leader],
    ["support", support],
  ] as const)
    if (c && bodyguard && !canAttach(c.unitId, bodyguard.unitId, r))
      throw new Error(
        `This ${r} can’t join this squad according to the saved rules.`,
      );
  const members = [bodyguard, leader, support].filter((x): x is Member =>
    Boolean(x),
  );
  if (
    new Set(members.map((m) => findLibraryUnit(m.unitId)?.id ?? m.unitId))
      .size !== members.length
  )
    throw new Error("A unit cannot be attached to itself or selected twice.");
  return { bodyguard, leader, support, members, isolated: false };
}
function addAttacks(value: number | string, bonus: number): number | string {
  if (typeof value === "number") return value + bonus;
  const [dice, n] = value.split("+");
  return dice + "+" + (Number(n ?? 0) + bonus);
}
export function applyLeaderEffects<
  T extends Partial<Combat["weapons"][number]> & {
    attacks: number | string;
    strength: number;
  },
>(
  profiles: T[],
  composition: ReturnType<typeof resolveAttachedUnit>,
  phase: "melee" | "ranged",
  options: {
    supportTest?: "none" | "passed" | "failed";
    relic?: "none" | "ap" | "toughness" | "movement";
  } = {},
) {
  const effects: string[] = [];
  let out = profiles.map((p) => ({ ...p }));
  if (!composition.bodyguard || phase !== "melee")
    return { profiles: out, effects };
  const name = composition.leader
    ? findLibraryUnit(composition.leader.unitId)?.name.toLowerCase()
    : "";
  if (name === "high marshal helbrecht") {
    out = out.map((p) => ({
      ...p,
      attacks: addAttacks(p.attacks, 1),
      strength: p.strength + 1,
    }));
    effects.push(
      "Helbrecht’s Crusade of Wrath: +1 melee Attack and Strength for the whole unit. Add High Marshal’s mortal wounds below; they aren’t calculated here.",
    );
  }
  if (name === "chaplain grimaldus") {
    out = out.map((p) => ({ ...p, hitReroll: "failed" }));
    effects.push(
      "Grimaldus’s Litanies of the Devout: reroll failed melee hits for the whole unit.",
    );
    if (options.relic === "ap") {
      out = out.map((p) => ({ ...p, ap: Math.max(-6, (p.ap ?? 0) - 1) }));
      effects.push(
        "Grimaldus’s Temple Relic: improve melee AP by 1. Assumes a Servitor survives for the whole attack.",
      );
    }
  }
  if (
    composition.support &&
    findLibraryUnit(composition.support.unitId)?.name.toLowerCase() ===
      "castellan" &&
    options.supportTest &&
    options.supportTest !== "none"
  ) {
    const reroll = options.supportTest === "passed" ? "failed" : "ones";
    out = out.map((p) => ({
      ...p,
      hitReroll: p.hitReroll === "failed" ? "failed" : reroll,
    }));
    effects.push(
      `Castellan: Leadership test ${options.supportTest}: reroll ${reroll === "failed" ? "failed melee hits" : "melee hit rolls of 1"}. The result assumes the test ${options.supportTest}; it doesn’t calculate the test’s odds.`,
    );
  }
  return { profiles: out, effects };
}
