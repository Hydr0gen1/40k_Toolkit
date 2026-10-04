import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unitWeaponChoices,
  matchPresetWeapon,
} from "../src/calculator/weapon-menu.js";
import {
  curatedUnits,
  buildUnitAttack,
} from "../src/calculator/unit-presets.js";
import {
  findLibraryUnit,
  libraryUnits,
} from "../src/calculator/unit-library.js";

test("unit menus only contain catalogue weapons for the chosen unit and phase", () => {
  for (const unit of libraryUnits)
    for (const phase of ["melee", "ranged"] as const) {
      const choices = unitWeaponChoices(unit.id, phase);
      for (const choice of choices) {
        assert.equal(
          unit.weapons[choice.index].type,
          phase === "melee" ? "Melee Weapons" : "Ranged Weapons",
        );
        assert.ok(!choice.label.startsWith("➤"));
      }
    }
  const ballistus = unitWeaponChoices("ballistus", "ranged");
  assert.ok(ballistus.some((w) => /Lascannon/.test(w.label)));
  assert.ok(ballistus.every((w) => !/Plasma|Sword|Rifle/.test(w.label)));
  assert.deepEqual(unitWeaponChoices("missing", "melee"), []);
});
test("every reviewed starting weapon selects a real unit weapon instead of Custom", () => {
  for (const unit of curatedUnits)
    for (const size of unit.sizes)
      for (const loadout of unit.loadouts)
        for (const phase of ["melee", "ranged"] as const) {
          for (const p of buildUnitAttack(unit.id, {
            size,
            loadout: loadout.id,
            phase,
          })) {
            const index = matchPresetWeapon(unit.id, phase, p.name);
            assert.notEqual(index, undefined, `${unit.label}: ${p.name}`);
            assert.ok(findLibraryUnit(unit.id)!.weapons[index!]);
          }
        }
});
test("leader and bodyguard menus remain separate", () => {
  const helbrecht = libraryUnits.find((u) =>
    /High Marshal Helbrecht/.test(u.name),
  )!;
  const swords = libraryUnits.find((u) => /Sword Brethren Squad/.test(u.name))!;
  assert.ok(
    unitWeaponChoices(helbrecht.id, "melee").every((w) =>
      /Sword of the High Marshals/.test(w.label),
    ),
  );
  assert.ok(
    !unitWeaponChoices(swords.id, "melee").some((w) =>
      /Sword of the High Marshals/.test(w.label),
    ),
  );
});
