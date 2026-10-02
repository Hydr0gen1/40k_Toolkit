import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCombat } from "../src/combat.js";
const scenario = () => ({
  trials: 50000,
  seed: 42,
  defender: { models: 1, wounds: 1, toughness: 4, save: 7 },
  weapons: [
    {
      name: "Test",
      models: 1,
      attacks: 1,
      skill: 4,
      strength: 4,
      ap: 0,
      damage: 1,
    },
  ],
});
function calculated(input: unknown) {
  const r = calculateCombat(input);
  assert.equal(r.status, "calculated");
  if (r.status !== "calculated") throw new Error("No result");
  return r;
}
test("one hit and wound succeeds with exact probability 1/4", () => {
  const r = calculated(scenario());
  assert.ok(Math.abs(r.destructionProbability! - 0.25) < 0.01);
  assert.ok(Math.abs(r.expectedDamage! - 0.25) < 0.01);
});
test("deterministic exact results and zero damage", () => {
  assert.deepEqual(calculateCombat(scenario()), calculateCombat(scenario()));
  const s = scenario();
  s.weapons[0].attacks = 0;
  const r = calculated(s);
  assert.equal(r.expectedDamage, 0);
  assert.equal(r.destructionProbability, 0);
  assert.equal(r.method, "exact");
  assert.ok(!("damageMean95CI" in r));
});
test("torrent has no critical hits, lethal does not become devastating", () => {
  const s = scenario();
  const r = calculated({
    ...s,
    weapons: [
      { ...s.weapons[0], torrent: true, lethalHits: true, sustainedHits: 6 },
    ],
  });
  assert.ok(Math.abs(r.expectedDamage! - 0.5) < 0.01);
  const lethal = calculated({
    ...s,
    defender: { ...s.defender, save: 2 },
    weapons: [
      {
        ...s.weapons[0],
        criticalHit: 2,
        lethalHits: true,
        devastatingWounds: true,
      },
    ],
  });
  assert.ok(Math.abs(lethal.expectedDamage! - 5 / 36) < 0.01);
});
test("failed hit reroll yields 3/8 successful attacks", () => {
  const s = scenario();
  const r = calculated({
    ...s,
    weapons: [{ ...s.weapons[0], hitReroll: "failed" }],
  });
  assert.ok(Math.abs(r.expectedDamage! - 0.375) < 0.01);
});
test("ordinary damage does not spill to other models", () => {
  const s = scenario();
  const r = calculated({
    ...s,
    defender: { ...s.defender, models: 10 },
    weapons: [{ ...s.weapons[0], damage: 10 }],
  });
  assert.ok(r.expectedCasualties! < 0.27);
  assert.equal(r.destructionProbability, 0);
});
test("unsupported effects block output; bounded workload and strict fields", () => {
  const s = scenario();
  assert.equal(
    calculateCombat({
      ...s,
      weapons: [
        { ...s.weapons[0], unsupportedAbilities: ["precision allocation"] },
      ],
    }).status,
    "incomplete",
  );
  assert.throws(
    () =>
      calculateCombat({
        ...s,
        weapons: [{ ...s.weapons[0], models: 100, attacks: 100, damage: 100 }],
      }),
    /budget/,
  );
  assert.throws(() =>
    calculateCombat({
      ...s,
      weapons: [{ ...s.weapons[0], mysteryBuff: true }],
    }),
  );
});
test("FNP halves expected one-damage casualties", () => {
  const s = scenario();
  const r = calculated({ ...s, defender: { ...s.defender, feelNoPain: 4 } });
  assert.ok(Math.abs(r.expectedDamage! - 0.125) < 0.01);
});
