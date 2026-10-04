import { test } from "node:test";
import assert from "node:assert/strict";
import { CombatSchema, calculateCombat } from "../src/combat.js";
import {
  libraryUnits,
  libraryWeapon,
  libraryTarget,
  targetVariants,
  basicPackage,
  checkWeaponModes,
} from "../src/calculator/unit-library.js";
import { units } from "../src/calculator/unit-presets.js";

test("the entire non-Legends library is exposed without duplicate names or allied factions", () => {
  assert.equal(libraryUnits.length, 118);
  assert.equal(units.length, 118);
  assert.equal(
    new Set(units.map((u) => u.label.toLowerCase().replace(/[^a-z0-9]/g, "")))
      .size,
    units.length,
  );
  assert.ok(units.some((u) => u.label === "Librarian"));
  assert.ok(units.some((u) => /helbrecht/i.test(u.label)));
  assert.ok(
    units.every(
      (u) =>
        !/Legends|Crucible|Knight Castellan|Inquisitor|Assassin/.test(u.label),
    ),
  );
});
test("every imported weapon parses and either calculates exact odds or explicitly blocks unsupported effects", () => {
  for (const unit of libraryUnits)
    for (let i = 0; i < unit.weapons.length; i++) {
      const w = libraryWeapon(unit.id, i, 1);
      const scenario = {
        defender: { models: 3, wounds: 2, toughness: 4, save: 3 },
        weapons: [w],
      };
      assert.doesNotThrow(
        () => CombatSchema.parse(scenario),
        `${unit.name}: ${w.name}`,
      );
      const r = calculateCombat(scenario);
      if (w.unsupportedAbilities?.length) assert.equal(r.status, "incomplete");
      else {
        assert.equal(r.status, "calculated");
        if (r.status === "calculated")
          assert.ok(
            Math.abs(
              Object.values(r.casualtyDistribution).reduce((a, b) => a + b, 0) -
                1,
            ) < 1e-9,
          );
      }
    }
});
test("all available defensive variants validate; missing entries fail explicitly", () => {
  for (const unit of libraryUnits) {
    if (!unit.models.length) {
      assert.throws(() => libraryTarget(unit.id, unit.sizes[0]));
      continue;
    }
    for (let v = 0; v < targetVariants(unit.id).length; v++) {
      assert.doesNotThrow(
        () =>
          CombatSchema.parse({
            defenderGroups: libraryTarget(unit.id, unit.sizes[0], v),
            weapons: [
              {
                name: "Test",
                models: 1,
                attacks: 1,
                skill: 3,
                strength: 4,
                ap: 0,
                damage: 1,
              },
            ],
          }),
        unit.name,
      );
    }
  }
});
test("Grimaldus includes three one-wound Servitors and one four-wound leader", () => {
  const u = libraryUnits.find((u) => /chaplain grimaldus/i.test(u.name))!;
  assert.deepEqual(
    libraryTarget(u.id, 4).map((g) => [g.models, g.wounds]),
    [
      [3, 1],
      [1, 4],
    ],
  );
});
test("Anti and Heavy are applied only with declared keyword and stationary conditions", () => {
  const unit = libraryUnits.find((u) =>
    u.weapons.some((p) => /anti-/i.test(p.values.Keywords)),
  )!;
  const i = unit.weapons.findIndex((p) => /anti-/i.test(p.values.Keywords));
  const m = unit.weapons[i].values.Keywords.match(/Anti-([a-z -]+) (\d)\+/i)!;
  assert.equal(libraryWeapon(unit.id, i, 1).criticalWound, 6);
  assert.equal(
    libraryWeapon(unit.id, i, 1, { targetKeywords: [m[1]] }).criticalWound,
    Number(m[2]),
  );
  const heavy = libraryUnits.find((u) =>
    u.weapons.some((p) => /\bHeavy\b/i.test(p.values.Keywords)),
  )!;
  const hi = heavy.weapons.findIndex((p) =>
    /\bHeavy\b/i.test(p.values.Keywords),
  );
  assert.equal(libraryWeapon(heavy.id, hi, 1).hitModifier, 0);
  assert.equal(
    libraryWeapon(heavy.id, hi, 1, { stationary: true }).hitModifier,
    1,
  );
});
test("basic packages have correct ownership quantities and select exactly one firing mode", () => {
  for (const u of libraryUnits)
    for (const phase of ["melee", "ranged"] as const)
      for (const size of u.sizes) {
        const packageProfiles = basicPackage(u.id, size, phase);
        if (!packageProfiles) continue;
        const weapons = packageProfiles.map((p) =>
          libraryWeapon(u.id, p.index, p.models),
        );
        assert.doesNotThrow(() =>
          CombatSchema.parse({
            defender: { models: 1, wounds: 10, toughness: 8, save: 3 },
            weapons,
          }),
        );
      }
  const t = libraryUnits.find((u) => u.name === "Terminator Squad")!;
  assert.deepEqual(
    basicPackage(t.id, 5, "melee")!.map((p) => p.models),
    [1, 4],
  );
  const raider = libraryUnits.find((u) => u.name === "Land Raider")!;
  assert.deepEqual(
    basicPackage(raider.id, 1, "ranged")!.map((p) => p.models),
    [2, 1],
  );
});

test("starred invulnerable saves respect incoming attack type", () => {
  const a = libraryUnits.find((u) => u.name === "Astraeus")!,
    j = libraryUnits.find((u) => u.name === "Judiciar")!;
  assert.equal(libraryTarget(a.id, 1, 0, "ranged")[0].invulnerable, 5);
  assert.equal(libraryTarget(a.id, 1, 0, "melee")[0].invulnerable, undefined);
  assert.equal(libraryTarget(j.id, 1, 0, "ranged")[0].invulnerable, undefined);
  assert.equal(libraryTarget(j.id, 1, 0, "melee")[0].invulnerable, 4);
});
test("different models can use different modes, but one copy cannot fire two modes", () => {
  const u = libraryUnits.find((u) => u.name === "Hellblaster Squad")!;
  const standard = u.weapons.findIndex((p) =>
      /Plasma Incinerator - Standard/i.test(p.name),
    ),
    supercharge = u.weapons.findIndex((p) =>
      /Plasma Incinerator - Supercharge/i.test(p.name),
    );
  assert.equal(
    checkWeaponModes(u.id, 5, [
      { index: standard, models: 2 },
      { index: supercharge, models: 3 },
    ]),
    undefined,
  );
  assert.ok(
    checkWeaponModes(u.id, 5, [
      { index: standard, models: 3 },
      { index: supercharge, models: 3 },
    ]),
  );
  const h = libraryUnits.find((u) => /high marshal helbrecht/i.test(u.name))!;
  const sweep = h.weapons.findIndex((p) => /Sweep/.test(p.name)),
    strike = h.weapons.findIndex((p) => /Strike/.test(p.name));
  assert.ok(
    checkWeaponModes(h.id, 1, [
      { index: sweep, models: 1 },
      { index: strike, models: 1 },
    ]),
  );
});
