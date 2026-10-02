import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { fixture } from "./fixtures.js";
import { refresh } from "../src/sources.js";
import { searchEvidence } from "../src/evidence.js";
import type { Evidence } from "../src/model.js";
test("failed refresh preserves active snapshot; IDs immutable", async () => {
  const store = new Store(":memory:");
  const s = fixture();
  store.activate(s);
  await assert.rejects(
    refresh(store, async () => {
      throw new Error("Offline");
    }),
  );
  assert.equal(store.active()!.id, s.id);
  assert.equal((store.refreshHistory()[0] as any).ok, 0);
  assert.throws(() => store.activate({ ...s, edition: "10th" } as any));
  assert.throws(
    () => store.activate({ ...s, createdAt: new Date(0).toISOString() }),
    /immutable/,
  );
  store.close();
});
test("SQLite restart and backup restore preserve data", () => {
  const dir = mkdtempSync(join(tmpdir(), "bt-test-"));
  try {
    let s = new Store(join(dir, "test.sqlite"));
    s.activate(fixture());
    s.backup(join(dir, "backup.sqlite"));
    s.close();
    s = new Store(join(dir, "test.sqlite"));
    assert.equal(s.active()!.id, "test-snapshot");
    s.close();
    const restored = new Store(join(dir, "backup.sqlite"));
    assert.equal(restored.active()!.id, "test-snapshot");
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("evidence separates points formats, unknowns, stale and mismatched rules", () => {
  const base: Evidence = {
    id: "a",
    event: "Example event",
    eventDate: "2026-09-15",
    publishedAt: "2026-09-16",
    pointsLimit: 2000,
    edition: "11th",
    rulesVersion: "MFM 1.5",
    faction: "Black Templars",
    placing: 1,
    record: "5-0",
    summary: "Synthetic",
    url: "https://example.com",
    retrievedAt: new Date().toISOString(),
    kind: "event-result",
  };
  const list = [
    base,
    { ...base, id: "b", pointsLimit: 1000 as const },
    { ...base, id: "c", eventDate: "2025-01-01" },
    { ...base, id: "d", pointsLimit: null },
    { ...base, id: "e", rulesVersion: "old" },
  ];
  const r = searchEvidence(
    list,
    { pointsLimit: 2000, edition: "11th", rulesVersion: "MFM 1.5" },
    Date.parse("2026-10-01"),
  );
  assert.equal(r.matchingResults.length, 1);
  assert.equal(r.historicalResults.length, 1);
  assert.equal(r.unverifiedResearchLeads.length, 1);
});
