import { libraryData } from "./unit-library-data.js";
import type { Combat } from "../combat.js";
export const libraryUnits = libraryData.units;
export type LibraryUnit = (typeof libraryUnits)[number];
const aliases: Record<string, string> = {
  crusaders: "Crusader Squad",
  ballistus: "Ballistus Dreadnought",
  redemptor: "Redemptor Dreadnought",
  bladeguard: "Bladeguard Veteran Squad",
  champion: "Emperor’S Champion",
};
export const findLibraryUnit = (id: string) =>
  libraryUnits.find((u) => u.id === id || u.name === aliases[id]);
const packages: Record<
  string,
  {
    ranged: [string, number | "all" | "rest"][];
    melee: [string, number | "all" | "rest"][];
  }
> = {
  "intercessor squad": {
    ranged: [["Bolt Rifle", "all"]],
    melee: [["Close combat weapon", "all"]],
  },
  "assault intercessor squad": {
    ranged: [["Heavy Bolt Pistol", "all"]],
    melee: [["Astartes Chainsword", "all"]],
  },
  "assault intercessors with jump packs": {
    ranged: [["Heavy Bolt Pistol", "all"]],
    melee: [["Astartes Chainsword", "all"]],
  },
  "infernus squad": {
    ranged: [["Pyreblaster", "all"]],
    melee: [["Close combat weapon", "all"]],
  },
  "hellblaster squad": {
    ranged: [["Plasma Incinerator - Standard", "all"]],
    melee: [["Close combat weapon", "all"]],
  },
  "terminator squad": {
    ranged: [["Storm bolter", "all"]],
    melee: [
      ["Power weapon", 1],
      ["Power Fist", "rest"],
    ],
  },
  "sword brethren squad": {
    ranged: [["Heavy Bolt Pistol", "all"]],
    melee: [["Master-crafted Power Weapon", "all"]],
  },
  "high marshal helbrecht": {
    ranged: [["Ferocity", 1]],
    melee: [["Sword of the High Marshals - Strike", 1]],
  },
  marshal: {
    ranged: [["Plasma Pistol - Standard", 1]],
    melee: [["Master-crafted Power Weapon", 1]],
  },
  castellan: {
    ranged: [["Heavy Bolt Pistol", 1]],
    melee: [["Master-crafted Power Weapon", 1]],
  },
  "chaplain grimaldus": {
    ranged: [["Plasma Pistol - Standard", 1]],
    melee: [
      ["Close Combat Weapon", 3],
      ["Artificer Crozius", 1],
    ],
  },
  "land raider": {
    ranged: [
      ["Godhammer Lascannon", 2],
      ["Twin heavy bolter", 1],
    ],
    melee: [["Armoured Tracks", 1]],
  },
};
export function basicPackage(
  id: string,
  size: number,
  phase: "ranged" | "melee",
) {
  const u = findLibraryUnit(id),
    rules = u ? packages[u.name.toLowerCase()] : undefined;
  if (!u || !rules) return undefined;
  return rules[phase].map(([name, count]) => {
    const index = u.weapons.findIndex(
      (p) =>
        p.name.replace(/^➤\s*/, "").toLowerCase() === name.toLowerCase() &&
        p.type === (phase === "ranged" ? "Ranged Weapons" : "Melee Weapons"),
    );
    if (index < 0)
      throw new Error(
        `Basic weapon package missing ${name} in the pinned source.`,
      );
    return {
      index,
      models: count === "all" ? size : count === "rest" ? size - 1 : count,
    };
  });
}
export function checkWeaponModes(
  id: string,
  size: number,
  selections: { index: number; models: number }[],
): string | undefined {
  const u = findLibraryUnit(id);
  if (!u) return;
  const groups = new Map<string, { modes: Set<string>; copies: number }>();
  for (const selection of selections) {
    const p = u.weapons[selection.index];
    if (!p) continue;
    const name = p.name.replace(/^➤\s*/, "").toLowerCase(),
      parts = name.split(" - ");
    if (parts.length < 2) continue;
    const g = groups.get(parts[0]) ?? { modes: new Set<string>(), copies: 0 };
    g.modes.add(name);
    g.copies += selection.models;
    groups.set(parts[0], g);
  }
  for (const [weapon, g] of groups)
    if (g.modes.size > 1 && g.copies > size)
      return `${weapon}: alternative modes declare ${g.copies} copies for ${size} model${size === 1 ? "" : "s"}. Choose one mode per weapon copy, or split modes between different models.`;
}
const dice = (s: string): number | string =>
  /^\d+$/.test(s) ? Number(s) : s.toUpperCase().replaceAll(" ", "");
const n = (s: string) => Number(s.replace("+", ""));
export function libraryWeapon(
  id: string,
  index: number,
  models: number,
  options: {
    halfRange?: boolean;
    stationary?: boolean;
    targetKeywords?: string[];
  } = {},
) {
  const unit = findLibraryUnit(id),
    p = unit?.weapons[index];
  if (!p) throw new Error("Weapon profile unavailable.");
  const v = p.values as unknown as Record<string, string>,
    keywords = (v.Keywords ?? "").toLowerCase();
  const unsupported: string[] = [];
  const known =
    /^(torrent|blast|lethal hits|devastating wounds|twin-linked|assault|heavy|pistol|precision|hazardous|ignores cover|one shot|extra attacks|close-quarters|lance|rapid fire \d+|melta \d+|sustained hits (?:\d+|d3|d6)|anti-[a-z -]+ \d\+)$/;
  for (const keyword of keywords
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean))
    if (!known.test(keyword)) unsupported.push(keyword);
  if (/lance/.test(keywords))
    unsupported.push(
      "Lance: apply a declared charge condition manually; automatic eligibility is unavailable.",
    );
  let criticalWound = 6;
  for (const m of keywords.matchAll(/anti-([a-z -]+) (\d)\+/g))
    if (options.targetKeywords?.map((s) => s.toLowerCase()).includes(m[1]))
      criticalWound = Math.min(criticalWound, Number(m[2]));
  const value: Partial<Combat["weapons"][number]> & {
    name: string;
    models: number;
    attacks: number | string;
    skill: number;
    strength: number;
    ap: number;
    damage: number | string;
  } = {
    name: p.name.replace(/^➤\s*/, ""),
    models,
    attacks: dice(v.A),
    skill: /torrent/.test(keywords) ? 2 : n(v.BS ?? v.WS ?? ""),
    strength: n(v.S),
    ap: n(v.AP),
    damage: dice(v.D),
    torrent: /torrent/.test(keywords),
    blast: /blast/.test(keywords),
    lethalHits: /lethal hits/.test(keywords),
    devastatingWounds: /devastating wounds/.test(keywords),
    woundReroll: /twin-linked/.test(keywords) ? "failed" : "none",
    hitModifier: /heavy/.test(keywords) && options.stationary ? 1 : 0,
    sustainedHits: dice(
      keywords.match(/sustained hits (\d+|d3|d6)/)?.[1] ?? "0",
    ),
    rapidFire: Number(keywords.match(/rapid fire (\d+)/)?.[1] ?? 0),
    melta: Number(keywords.match(/melta (\d+)/)?.[1] ?? 0),
    withinHalfRange: options.halfRange ?? false,
    criticalWound,
    unsupportedAbilities: unsupported,
    sourceReferences: [
      `https://github.com/BSData/wh40k-11e/tree/${libraryData.catalogueCommit}`,
    ],
  };
  if (
    !Number.isFinite(value.skill) ||
    !Number.isFinite(value.strength) ||
    !Number.isFinite(value.ap) ||
    (!Number.isFinite(
      Number(v.WS?.replace("+", "") ?? v.BS?.replace("+", "")),
    ) &&
      !value.torrent)
  )
    throw new Error(
      "This weapon has unresolved characteristics. Enter a custom profile explicitly.",
    );
  return value;
}
export function targetVariants(id: string) {
  const u = findLibraryUnit(id);
  if (!u) return [];
  const seen = new Set<string>();
  return u.models.filter((p) => {
    const v = p.values as unknown as Record<string, string>;
    const key = [v.T, v.Sv, v.W, v.InSv].join("/");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function libraryTarget(
  id: string,
  size: number,
  variant = 0,
  incoming: "ranged" | "melee" = "ranged",
): NonNullable<Combat["defenderGroups"]>[number][] {
  const u = findLibraryUnit(id),
    p = targetVariants(id)[variant];
  if (!u || !p)
    throw new Error("Target characteristics are missing from the source.");
  const group = (p: (typeof u.models)[number], models: number) => {
    const v = p.values as unknown as Record<string, string>;
    return {
      name: p.name,
      models,
      wounds: n(v.W),
      toughness: n(v.T),
      save: n(v.Sv),
      invulnerable: v.InSv?.includes("*")
        ? u.conditionalInvulnerablePhase === incoming
          ? Number(v.InSv.match(/\d+/)?.[0])
          : undefined
        : v.InSv?.trim()
          ? n(v.InSv.trim())
          : undefined,
      damageReduction: 0,
      halveDamage: false,
      saveBonus: 0,
      woundModifier: 0,
    };
  };
  if (/chaplain grimaldus/i.test(u.name) && size === 4) {
    const servants = u.models.find((p) => /servitor/i.test(p.name)),
      leader = u.models.find((p) => /^Grimaldus$/i.test(p.name));
    if (servants && leader) return [group(servants, 3), group(leader, 1)];
  }
  return [group(p, size)];
}
