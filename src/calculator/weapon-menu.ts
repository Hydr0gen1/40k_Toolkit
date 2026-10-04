import { findLibraryUnit } from "./unit-library.js";
export function unitWeaponChoices(id: string, phase: "melee" | "ranged") {
  return (findLibraryUnit(id)?.weapons ?? []).flatMap((w, index) =>
    w.type === (phase === "melee" ? "Melee Weapons" : "Ranged Weapons")
      ? [{ index, label: w.name.replace(/^➤\s*/, "") }]
      : [],
  );
}
function normalized(name: string) {
  return name
    .toLowerCase()
    .replace(/^➤\s*/, "")
    .replace(/[^a-z0-9]/g, "");
}
export function matchPresetWeapon(
  id: string,
  phase: "melee" | "ranged",
  name: string,
) {
  // Curated packages name model groups and use plurals; the catalogue names
  // individual weapons. These aliases are specific to those reviewed packages.
  const part = name.split("—").map((s) => s.trim());
  let weapon =
    part.length > 1 && !/black sword|missiles|incinerator/i.test(part[0])
      ? part.at(-1)!
      : name;
  weapon = weapon.replace(/—/g, "-").replace(/supercharged/i, "supercharge");
  const aliases: Record<string, string> = {
    "bolt rifles": "Bolt Rifle",
    "heavy bolt pistols": "Heavy Bolt Pistol",
    "bolt pistols": "Bolt Pistol",
    firearms: "Neophyte Firearm",
    chainswords: "Astartes Chainsword",
    "close combat weapons": "Close combat weapon",
    "master-crafted power weapons": "Master-crafted power weapon",
  };
  weapon = aliases[weapon.toLowerCase()] ?? weapon;
  weapon = weapon.replace(/Ballistus missiles/i, "Ballistus Missile Launcher");
  return unitWeaponChoices(id, phase).find(
    (w) => normalized(w.label) === normalized(weapon),
  )?.index;
}
