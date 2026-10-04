import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CombatSchema, calculateCombat } from "../src/combat.js";
import {
  curatedUnits as units,
  buildUnitAttack,
  buildUnitTarget,
  presetSnapshot,
  presetSource,
} from "../src/calculator/unit-presets.js";

test("bundled weapon values agree with the referenced saved catalogue", () => {
  const snapshot = JSON.parse(
    readFileSync(`snapshots/${presetSnapshot}.json`, "utf8"),
  );
  const names: Record<string, string> = {
    crusaders: "Crusader Squad",
    ballistus: "Ballistus Dreadnought",
    redemptor: "Redemptor Dreadnought",
    bladeguard: "Bladeguard Veteran Squad",
    champion: "Emperor’S Champion",
  };
  for (const unit of units) {
    const catalogue = snapshot.units.find(
      (u: any) =>
        u.name.toLowerCase().replaceAll("’", "'") ===
        names[unit.id].toLowerCase().replaceAll("’", "'"),
    );
    assert.ok(catalogue, unit.label);
    for (const loadout of unit.loadouts)
      for (const phase of ["ranged", "melee"] as const) {
        for (const p of buildUnitAttack(unit.id, {
          size: unit.sizes[0],
          loadout: loadout.id,
          phase,
        })) {
          const matches = catalogue.profiles
            .filter(
              (r: any) =>
                r.type === `${phase === "ranged" ? "Ranged" : "Melee"} Weapons`,
            )
            .some((r: any) => {
              const v = r.values;
              return (
                String(p.attacks) === v.A &&
                (p.torrent ||
                  p.skill === Number((v.BS ?? v.WS).replace("+", ""))) &&
                p.strength === Number(v.S) &&
                p.ap === Number(v.AP) &&
                String(p.damage) === v.D
              );
            });
          assert.ok(
            matches,
            `${unit.label}: ${p.name} must match the pinned source`,
          );
        }
      }
  }
});

test("every supported size, loadout and phase produces schema-valid scenarios", () => {
  for (const unit of units)
    for (const size of unit.sizes)
      for (const l of unit.loadouts)
        for (const phase of ["ranged", "melee"] as const) {
          CombatSchema.parse({
            snapshotId: presetSnapshot,
            defenderGroups: buildUnitTarget(unit.id, size),
            weapons: buildUnitAttack(unit.id, { size, loadout: l.id, phase }),
          });
        }
});
test("Crusader composition preserves the Sword Brother and different saves", () => {
  for (const size of [10, 20]) {
    const a = buildUnitAttack("crusaders", {
      size,
      loadout: "chainswords",
      phase: "melee",
    });
    assert.equal(a[0].models, 1);
    assert.equal(a[1].models, size - 1);
    assert.equal(a[0].lethalHits, true);
    assert.equal(a[1].sustainedHits, 1);
    const d = buildUnitTarget("crusaders", size);
    assert.equal(
      d.reduce((s, g) => s + g.models, 0),
      size,
    );
    assert.deepEqual(
      d.map((g) => g.save),
      [4, 3],
    );
    assert.equal(d[0].models, size === 10 ? 4 : 8);
  }
});
test("Ballistus mode and conditional rerolls are exclusive and explicit", () => {
  const o = { size: 1, loadout: "frag", phase: "ranged" as const };
  const frag = buildUnitAttack("ballistus", o);
  assert.equal(frag.length, 3);
  assert.equal(frag.filter((p) => p.name.includes("missiles")).length, 1);
  assert.equal(frag[1].blast, true);
  assert.equal(frag[0].hitReroll, "none");
  const krak = buildUnitAttack("ballistus", {
    ...o,
    loadout: "krak",
    ballistusStrike: true,
    halfRange: true,
  });
  assert.equal(krak[1].strength, 10);
  assert.equal(krak[0].hitReroll, "failed");
  assert.equal(krak[2].withinHalfRange, true);
  assert.equal(
    buildUnitAttack("ballistus", {
      ...o,
      phase: "melee",
      ballistusStrike: true,
    })[0].hitReroll,
    undefined,
  );
});
test("Redemptor automatic damage reduction changes the damage calculation", () => {
  const red = buildUnitTarget("redemptor", 1);
  assert.equal(red[0].damageReduction, 1);
  const w = {
    name: "Test",
    models: 1,
    attacks: 1,
    skill: 2,
    strength: 20,
    ap: -6,
    damage: 3,
  };
  const reduced = calculateCombat({ defenderGroups: red, weapons: [w] });
  const normal = calculateCombat({
    defenderGroups: buildUnitTarget("ballistus", 1),
    weapons: [w],
  });
  assert.equal(reduced.status, "calculated");
  assert.equal(normal.status, "calculated");
  if (reduced.status === "calculated" && normal.status === "calculated")
    assert.ok(reduced.expectedDamage < normal.expectedDamage);
});
test("Champion Anti-Character and once-battle Devastating Wounds require conditions", () => {
  const o = { size: 1, loadout: "strike", phase: "melee" as const };
  assert.equal(buildUnitAttack("champion", o)[0].criticalWound, 6);
  assert.equal(
    buildUnitAttack("champion", { ...o, championMiracle: true })[0]
      .devastatingWounds,
    false,
  );
  const p = buildUnitAttack("champion", {
    ...o,
    targetCharacter: true,
    championMiracle: true,
  })[0];
  assert.equal(p.criticalWound, 5);
  assert.equal(p.devastatingWounds, true);
  assert.ok(units.find((u) => u.id === "champion")!.targetWarning);
});
test("Bladeguard offensive choice only affects melee and all attacks retain provenance", () => {
  const o = {
    size: 3,
    loadout: "swords",
    phase: "melee" as const,
    bladeguardOffence: true,
  };
  assert.equal(buildUnitAttack("bladeguard", o)[0].hitModifier, 1);
  assert.equal(
    buildUnitAttack("bladeguard", { ...o, phase: "ranged" })[0].hitModifier,
    undefined,
  );
  assert.deepEqual(buildUnitAttack("bladeguard", o)[0].sourceReferences, [
    presetSource,
  ]);
  assert.throws(() => buildUnitAttack("bladeguard", { ...o, size: 5 }));
});
