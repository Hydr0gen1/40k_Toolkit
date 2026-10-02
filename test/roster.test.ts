import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, roster } from "./fixtures.js";
import {
  validateRoster,
  parseRosterText,
  compareRosters,
} from "../src/roster.js";
test("legal synthetic rosters at both supported sizes", () => {
  for (const size of [1000, 2000] as const) {
    const v = validateRoster(fixture(), roster(size));
    assert.equal(v.status, "valid");
    assert.equal(v.totalPoints, 200);
  }
});
test("invalid copy limit varies with format and tiered costs apply", () => {
  const s = fixture(),
    r = roster(2000);
  r.units.push(
    ...[1, 2, 3].map((i) => ({
      id: "v" + i,
      unit: "Test Veterans",
      models: 5,
      equipment: [{ name: "Test sword", count: 5 }],
      enhancements: [],
      warlord: false,
    })),
  );
  assert.equal(validateRoster(s, r).totalPoints, 520);
  assert.equal(validateRoster(s, r).status, "valid");
  r.pointsLimit = 1000;
  assert.ok(validateRoster(s, r).findings.some((f) => f.code === "COPY_LIMIT"));
});
test("intermediate model sizes pay next bracket", () => {
  const r = roster();
  r.units[1].models = 6;
  r.units[1].equipment![0].count = 6;
  assert.equal(validateRoster(fixture(), r).totalPoints, 300);
});
test("unknown rules and stale snapshots never pass", () => {
  const s = fixture();
  s.coverage.gaps = ["Missing rules"];
  assert.equal(validateRoster(s, roster()).status, "incomplete");
  s.coverage.gaps = [];
  assert.equal(
    validateRoster(s, roster(), Date.now() + 3 * 86400000).status,
    "incomplete",
  );
});
test("unresolved unit and gear produce partial points", () => {
  const r = roster();
  r.units[1].unit = "Imaginary";
  assert.equal(validateRoster(fixture(), r).totalPoints, null);
  r.units[1].unit = "Test Troops";
  r.units[1].equipment = [{ name: "Made up", count: 1 }];
  assert.equal(validateRoster(fixture(), r).totalPoints, null);
});
test("outdated declared points are rejected", () => {
  const r = roster();
  r.units[0].declaredPoints = 99;
  assert.ok(
    validateRoster(fixture(), r).findings.some(
      (f) => f.code === "DECLARED_POINTS",
    ),
  );
});
test("attachments and transports count joined characters", () => {
  const r = roster();
  r.units[0].attachment = { targetId: "troops", role: "leader" };
  for (const u of r.units) u.transportId = "bus";
  r.units.push({
    id: "bus",
    unit: "Test Transport",
    models: 1,
    equipment: [],
    enhancements: [],
    warlord: false,
  });
  assert.equal(validateRoster(fixture(), r).status, "valid");
  r.units[1].models = 6;
  r.units[1].equipment![0].count = 6;
  assert.ok(
    validateRoster(fixture(), r).findings.some(
      (f) => f.code === "TRANSPORT_CAPACITY",
    ),
  );
});
test("cycles, duplicate IDs, missing warlord, forbidden faction and illegal gear", () => {
  const s = fixture(),
    r = roster();
  r.units[0].attachment = { targetId: "troops", role: "leader" };
  r.units[1].attachment = { targetId: "captain", role: "leader" };
  r.units[0].warlord = false;
  r.units[1].equipment![0].count = 6;
  s.units[1].reviewed!.forbidden = true;
  const codes = validateRoster(s, r).findings.map((f) => f.code);
  for (const c of [
    "ATTACHMENT_TARGET",
    "WARLORD_COUNT",
    "EQUIPMENT_LIMIT",
    "FACTION",
  ])
    assert.ok(codes.includes(c));
});
test("detachments and enhancement uniqueness", () => {
  const r = roster();
  r.detachments = ["Alternate", "Duplicate tag"];
  assert.ok(
    validateRoster(fixture(), r).findings.some((f) => f.code === "UNIQUE_TAG"),
  );
  r.detachments = ["Test Detachment"];
  r.units[1].enhancements = ["Test Relic"];
  assert.ok(
    validateRoster(fixture(), r).findings.some(
      (f) => f.code === "ENHANCEMENT_BEARER",
    ),
  );
});
test("combined attached units cannot hold two enhancements", () => {
  const s = fixture(),
    r = roster();
  s.units[1].reviewed!.allowedEnhancements = ["Test Upgrade (Upgrade)"];
  r.units[0].enhancements = ["Test Relic"];
  r.units[0].attachment = { targetId: "troops", role: "leader" };
  r.units[1].enhancements = ["Test Upgrade (Upgrade)"];
  assert.ok(
    validateRoster(s, r).findings.some(
      (f) => f.code === "ATTACHED_ENHANCEMENTS",
    ),
  );
});
test("pasted text preserves ambiguous lines and never assumes models", () => {
  const { units, ...context } = roster();
  const p = parseRosterText(
    fixture(),
    "Test Captain (100 Points)\n• Warlord\n• 1x Test sword\nunknown line",
    context,
  );
  assert.equal(p.rosterDraft.units[0].models, 0);
  assert.equal(p.unresolvedLines.length, 2);
  assert.equal(p.status, "incomplete");
});
test("comparisons reject mixed formats and snapshots", () => {
  const a = roster(),
    b = roster(2000);
  assert.equal(compareRosters(fixture(), [a, b]).comparable, false);
  b.pointsLimit = 1000;
  b.snapshotId = "other";
  assert.equal(compareRosters(fixture(), [a, b]).comparable, false);
});
