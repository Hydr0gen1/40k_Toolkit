import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryUnits } from "../src/calculator/unit-library.js";
import {
  resolveAttachedUnit,
  restoreUnbuffedProfile,
  applyLeaderEffects,
  canAttach,
  eligibleBodyguards,
} from "../src/calculator/attachments.js";
const id = (name: string) =>
  libraryUnits.find((u) => u.name.toLowerCase() === name.toLowerCase())!.id;
const helbrecht = { unitId: id("High Marshal Helbrecht"), size: 1 };
const sword = { unitId: id("Sword Brethren Squad"), size: 5 };
const profile = { attacks: 6, strength: 8, ap: -3, hitReroll: "none" as const };
test("leaders require an eligible squad unless explicitly isolated", () => {
  assert.throws(() => resolveAttachedUnit(helbrecht, {}), /bodyguard/);
  assert.throws(
    () =>
      resolveAttachedUnit(helbrecht, {
        bodyguard: { unitId: "ballistus", size: 1 },
      }),
    /can.t join/,
  );
  assert.equal(eligibleBodyguards(helbrecht.unitId).length, 6);
  assert.equal(
    resolveAttachedUnit(helbrecht, { bodyguard: sword }).members.length,
    2,
  );
  assert.equal(
    resolveAttachedUnit(sword, { leader: helbrecht }).members.length,
    2,
  );
  assert.equal(
    resolveAttachedUnit(helbrecht, { isolated: true }).members.length,
    1,
  );
  assert.throws(
    () => resolveAttachedUnit(helbrecht, { isolated: true, bodyguard: sword }),
    /character alone/i,
  );
});
test("Helbrecht buffs all attached melee profiles exactly once without changing the source", () => {
  const c = resolveAttachedUnit(helbrecht, {
    bodyguard: sword,
    support: { unitId: id("Castellan"), size: 1 },
  });
  const { profiles, effects } = applyLeaderEffects(
    [profile, { ...profile, attacks: "D6+1" }, profile],
    c,
    "melee",
  );
  assert.deepEqual(
    profiles.map((p) => p.attacks),
    [7, "D6+2", 7],
  );
  assert.ok(profiles.every((p) => p.strength === 9));
  assert.equal(profile.attacks, 6);
  assert.ok(effects.some((e) => e.includes("aren’t calculated here")));
  assert.equal(
    applyLeaderEffects([profile], c, "ranged").profiles[0].attacks,
    6,
  );
  assert.equal(
    applyLeaderEffects(
      [profile],
      resolveAttachedUnit(helbrecht, { isolated: true }),
      "melee",
    ).profiles[0].attacks,
    6,
  );
});
test("Grimaldus and conditional Castellan effects preserve stronger rerolls", () => {
  const c = resolveAttachedUnit(sword, {
    leader: { unitId: id("Chaplain Grimaldus"), size: 4 },
    support: { unitId: id("Castellan"), size: 1 },
  });
  const result = applyLeaderEffects([profile], c, "melee", {
    relic: "ap",
    supportTest: "failed",
  });
  assert.equal(result.profiles[0].hitReroll, "failed");
  assert.equal(result.profiles[0].ap, -4);
  const supportOnly = resolveAttachedUnit(sword, { support: c.support });
  assert.equal(
    applyLeaderEffects([profile], supportOnly, "melee", {
      supportTest: "passed",
    }).profiles[0].hitReroll,
    "failed",
  );
  assert.equal(
    applyLeaderEffects([profile], supportOnly, "melee", {
      supportTest: "failed",
    }).profiles[0].hitReroll,
    "ones",
  );
  assert.equal(
    applyLeaderEffects([profile], supportOnly, "melee").profiles[0].hitReroll,
    "none",
  );
});
test("community fallback eligibility matches whole squad names and respects chapter restrictions", () => {
  const gravis = id("Captain In Gravis Armour");
  assert.ok(canAttach(gravis, id("Heavy Intercessor Squad"), "leader"));
  assert.ok(!canAttach(gravis, id("Intercessor Squad"), "leader"));
  assert.ok(!canAttach(id("Adrax Agatone"), sword.unitId, "leader"));
});

test("changing attachments removes previous bonuses and retains edits and weapon counts", () => {
  const base = {
    name: "Thunder Hammer",
    models: 5,
    attacks: 3,
    strength: 8,
    ap: -2,
    hitReroll: "none" as const,
  };
  const applied = { ...base, attacks: 4, strength: 9, hitReroll: "failed" };
  const current = { ...applied, models: 2, strength: 10 };
  const restored = restoreUnbuffedProfile(current, base, applied);
  assert.deepEqual(restored, { ...base, models: 2, strength: 9 });
  const c = resolveAttachedUnit(sword, { leader: helbrecht });
  const again = applyLeaderEffects([restored as typeof base], c, "melee")
    .profiles[0];
  assert.equal(again.attacks, 4);
  assert.equal(again.strength, 10);
  assert.equal(again.models, 2);
  assert.equal(
    restoreUnbuffedProfile(applied, base, applied).hitReroll,
    "none",
  );
});
