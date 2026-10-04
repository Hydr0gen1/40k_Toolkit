import { libraryUnits, libraryTarget, basicPackage } from "./unit-library.js";
import type { Combat } from "../combat.js";

type Weapon = Partial<Combat["weapons"][number]> &
  Pick<
    Combat["weapons"][number],
    "name" | "models" | "attacks" | "skill" | "strength" | "ap" | "damage"
  >;
type Group = Partial<NonNullable<Combat["defenderGroups"]>[number]> & {
  name: string;
  models: number;
  wounds: number;
  toughness: number;
  save: number;
};
type Choice = { id: string; label: string };
export type UnitPreset = {
  id: string;
  label: string;
  sizes: number[];
  loadouts: Choice[];
  note: string;
  targetWarning?: string;
  imported?: boolean;
};
export const presetSnapshot = "11e-2026-10-02-ed0bb9d42646";
export const presetSource =
  "https://github.com/BSData/wh40k-11e/tree/cc1830fbfead059f8059ed6c7f8e73cd4c390908";
export const presetNotice =
  "BSData stats saved 2 October 2026. Space Marine updates are pending; these presets may be out of date and haven’t been fully checked against the current official rules.";
export const curatedUnits: UnitPreset[] = [
  {
    id: "crusaders",
    label: "Crusader Squad",
    sizes: [10, 20],
    loadouts: [
      { id: "chainswords", label: "Chainswords + Sword Brother" },
      { id: "rifles", label: "Bolt rifles + Neophyte firearms (shooting)" },
    ],
    note: "10 models: 1 Sword Brother, 5 Initiates, 4 Neophytes. 20 models: 1 / 11 / 8. Add special weapons yourself. Neophytes take damage first by default.",
  },
  {
    id: "ballistus",
    label: "Ballistus Dreadnought",
    sizes: [1],
    loadouts: [
      { id: "krak", label: "Lascannon + krak missiles + storm bolter" },
      { id: "frag", label: "Lascannon + frag missiles + storm bolter" },
    ],
    note: "Use krak against tough targets or frag against squads. Choose one missile mode. Ballistus Strike rerolls hits only if the target is not below half-strength.",
  },
  {
    id: "redemptor",
    label: "Redemptor Dreadnought",
    sizes: [1],
    loadouts: [
      { id: "plasma", label: "Plasma (standard) + onslaught + storm bolter" },
      {
        id: "supercharge",
        label: "Plasma (supercharged) + onslaught + storm bolter",
      },
      { id: "gatling", label: "Heavy onslaught + onslaught + storm bolter" },
      { id: "flamer", label: "Plasma (standard) + heavy flamer + fragstorm" },
    ],
    note: "The Icarus pod isn’t included. Duty Eternal reduces incoming damage by 1. Supercharged plasma includes damage to the target, but not Hazardous damage to the Redemptor.",
  },
  {
    id: "bladeguard",
    label: "Bladeguard Veteran Squad",
    sizes: [3, 6],
    loadouts: [
      {
        id: "swords",
        label: "Master-crafted power weapons / heavy bolt pistols",
      },
    ],
    note: "All models start with the standard weapons. Edit the Sergeant’s pistol if needed. The offensive stance adds 1 to melee hit rolls; the defensive stance isn’t included.",
  },
  {
    id: "champion",
    label: "Emperor’s Champion",
    sizes: [1],
    loadouts: [
      { id: "strike", label: "Black Sword — strike" },
      { id: "sweep", label: "Black Sword — sweep" },
    ],
    note: "Use strike against tough models or sweep against light infantry. Tick Target is a Character to use Anti-Character 5+. Precision isn’t included. The upcoming codex has different stats from this preset.",
    targetWarning:
      "The saved Armour of Faith rule cancels one failed save’s damage per phase. We can’t calculate that yet, so the Champion isn’t available as a preset target. Custom stats can be used if you leave that rule out.",
  },
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const units: UnitPreset[] = [
  ...curatedUnits,
  ...libraryUnits
    .filter((u) => !curatedUnits.some((c) => norm(c.label) === norm(u.name)))
    .map((u) => ({
      id: u.id,
      label: u.name,
      sizes: u.sizes,
      loadouts: basicPackage(u.id, u.sizes[0], "ranged")
        ? [
            {
              id: "basic",
              label: "Standard weapons (no upgrades)",
            },
            { id: "choose", label: "Choose weapons yourself" },
          ]
        : [{ id: "choose", label: "Choose weapons yourself" }],
      imported: true,
      note: `${u.origin}. ${u.btEligible ? "Listed for Black Templars in this source." : "Current matched-play and Black Templars eligibility haven’t been checked."} Check Unit rules for effects you may need to add yourself. Weapon choices aren’t checked for legality.${u.sizeUnverified ? " Model count needs checking; edit it if needed." : ""}${u.models.length ? "" : " Defensive stats missing."}${u.weapons.length ? "" : " Weapon stats missing."}`,
    })),
].sort((a, b) => a.label.localeCompare(b.label));

const w = (
  name: string,
  models: number,
  attacks: number | string,
  skill: number,
  strength: number,
  ap: number,
  damage: number | string,
  extra: Partial<Weapon> = {},
): Weapon => ({ name, models, attacks, skill, strength, ap, damage, ...extra });
export type PresetOptions = {
  size: number;
  loadout: string;
  phase: "melee" | "ranged";
  halfRange?: boolean;
  ballistusStrike?: boolean;
  bladeguardOffence?: boolean;
  targetCharacter?: boolean;
  championMiracle?: boolean;
  stationary?: boolean;
};
export function buildUnitAttack(id: string, o: PresetOptions): Weapon[] {
  const unit = units.find((u) => u.id === id);
  if (
    !unit ||
    !unit.sizes.includes(o.size) ||
    !unit.loadouts.some((l) => l.id === o.loadout)
  )
    throw new Error("Choose a supported unit size and loadout.");
  if (unit.imported) return [];
  let a: Weapon[] = [];
  if (id === "crusaders") {
    const neophytes = o.size === 10 ? 4 : 8,
      initiates = o.size - neophytes - 1;
    if (o.phase === "ranged")
      a = [
        w("Sword Brother — heavy bolt pistol", 1, 1, 3, 4, -1, 1),
        w("Initiates — bolt rifles", initiates, 2, 3, 4, -1, 1, {
          hitModifier: o.stationary ? 1 : 0,
        }),
        w("Neophytes — firearms", neophytes, 2, 3, 4, 0, 1),
      ];
    else
      a = [
        w("Sword Brother — master-crafted power weapon", 1, 3, 2, 5, -2, 2, {
          lethalHits: true,
        }),
        w(
          o.loadout === "rifles"
            ? "Initiates & Neophytes — close combat weapons"
            : "Initiates & Neophytes — chainswords",
          o.size - 1,
          o.loadout === "rifles" ? 3 : 4,
          3,
          4,
          o.loadout === "rifles" ? 0 : -1,
          1,
          { sustainedHits: o.loadout === "rifles" ? 0 : 1 },
        ),
      ];
    if (o.phase === "ranged" && o.loadout === "chainswords")
      a = [
        w(
          "Sword Brother & Initiates — heavy bolt pistols",
          initiates + 1,
          1,
          3,
          4,
          -1,
          1,
        ),
        w("Neophytes — bolt pistols", neophytes, 1, 3, 4, 0, 1),
      ];
  }
  if (id === "ballistus")
    a =
      o.phase === "melee"
        ? [w("Armoured feet", 1, 5, 3, 7, 0, 1)]
        : [
            w("Ballistus lascannon", 1, 2, 3, 12, -3, "D6+1"),
            o.loadout === "frag"
              ? w("Ballistus missiles — frag", 1, "2D6", 3, 5, 0, 1, {
                  blast: true,
                })
              : w("Ballistus missiles — krak", 1, 2, 3, 10, -2, "D6"),
            w("Twin storm bolter", 1, 2, 3, 4, 0, 1, {
              rapidFire: 2,
              woundReroll: "failed",
              withinHalfRange: o.halfRange,
            }),
          ].map((p) => ({
            ...p,
            hitReroll: o.ballistusStrike ? "failed" : "none",
          }));
  if (id === "redemptor")
    a =
      o.phase === "melee"
        ? [w("Redemptor fist", 1, 5, 3, 12, -2, 3)]
        : [
            o.loadout === "gatling"
              ? w("Heavy onslaught gatling cannon", 1, 12, 3, 6, 0, 1, {
                  devastatingWounds: true,
                })
              : w(
                  "Macro plasma incinerator — " +
                    (o.loadout === "supercharge" ? "supercharged" : "standard"),
                  1,
                  "D6+1",
                  3,
                  o.loadout === "supercharge" ? 9 : 8,
                  o.loadout === "supercharge" ? -4 : -3,
                  o.loadout === "supercharge" ? 3 : 2,
                  { blast: true },
                ),
            o.loadout === "flamer"
              ? w("Heavy flamer", 1, "D6", 3, 5, -1, 1, { torrent: true })
              : w("Onslaught gatling cannon", 1, 8, 3, 5, 0, 1, {
                  devastatingWounds: true,
                }),
            o.loadout === "flamer"
              ? w("Twin fragstorm grenade launcher", 1, "D6", 3, 4, 0, 1, {
                  blast: true,
                  woundReroll: "failed",
                })
              : w("Twin storm bolter", 1, 2, 3, 4, 0, 1, {
                  rapidFire: 2,
                  woundReroll: "failed",
                  withinHalfRange: o.halfRange,
                }),
          ];
  if (id === "bladeguard")
    a =
      o.phase === "melee"
        ? [
            w("Master-crafted power weapons", o.size, 4, 3, 5, -2, 2, {
              hitModifier: o.bladeguardOffence ? 1 : 0,
            }),
          ]
        : [w("Heavy bolt pistols", o.size, 1, 3, 4, -1, 1)];
  if (id === "champion")
    a =
      o.phase === "ranged"
        ? [w("Bolt pistol", 1, 1, 2, 4, 0, 1)]
        : [
            o.loadout === "strike"
              ? w("Black Sword — strike", 1, 6, 2, 8, -3, 3, {
                  criticalWound: o.targetCharacter ? 5 : 6,
                  devastatingWounds: Boolean(
                    o.championMiracle && o.targetCharacter,
                  ),
                })
              : w("Black Sword — sweep", 1, 10, 2, 6, -2, 1, {
                  devastatingWounds: Boolean(
                    o.championMiracle && o.targetCharacter,
                  ),
                }),
          ];
  return a.map((p) => ({ ...p, sourceReferences: [presetSource] }));
}
export function buildUnitTarget(id: string, size: number): Group[] {
  const unit = units.find((u) => u.id === id);
  if (!unit || !unit.sizes.includes(size))
    throw new Error("Choose a supported target unit size.");
  if (unit.imported) return libraryTarget(id, size);
  if (id === "crusaders") {
    const n = size === 10 ? 4 : 8;
    return [
      { name: "Neophytes", models: n, wounds: 2, toughness: 4, save: 4 },
      {
        name: "Initiates & Sword Brother",
        models: size - n,
        wounds: 2,
        toughness: 4,
        save: 3,
      },
    ];
  }
  if (id === "ballistus" || id === "redemptor")
    return [
      {
        name: unit.label,
        models: 1,
        wounds: 12,
        toughness: 10,
        save: 2,
        damageReduction: id === "redemptor" ? 1 : 0,
      },
    ];
  if (id === "bladeguard")
    return [
      {
        name: unit.label,
        models: size,
        wounds: 3,
        toughness: 4,
        save: 3,
        invulnerable: 4,
      },
    ];
  return [
    {
      name: unit.label,
      models: 1,
      wounds: 5,
      toughness: 4,
      save: 2,
      invulnerable: 4,
    },
  ];
}
