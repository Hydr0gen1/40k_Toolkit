import type { Snapshot, Roster, Unit } from "../src/model.js";
// Entirely synthetic units: tests must never masquerade as live 40k data.
export function fixture(): Snapshot {
  const unit = (name: string, extra: Partial<Unit> = {}): Unit => ({
    id: name,
    name,
    faction: "Black Templars",
    sourceIds: ["fixture"],
    pricing: [
      {
        range: "[1,)",
        label: "all",
        costs: [
          { models: 5, points: 100 },
          { models: 10, points: 200 },
        ],
      },
    ],
    keywords: ["Infantry"],
    aliases: [],
    profiles: [],
    equipment: ["Test sword"],
    gaps: [],
    reviewed: { equipment: [{ name: "Test sword", min: 1, maxPerModel: 1 }] },
    ...extra,
  });
  return {
    id: "test-snapshot",
    edition: "11th",
    createdAt: new Date().toISOString(),
    sources: [
      {
        id: "fixture",
        url: "https://example.com/synthetic-test",
        kind: "community",
        retrievedAt: new Date().toISOString(),
        version: "test",
        sha256: "test",
      },
    ],
    coverage: {
      status: "complete",
      gaps: [],
      rulesVersion: "test",
      notes: ["SYNTHETIC TEST ONLY"],
    },
    muster: {
      verified: true,
      sourceId: "fixture",
      limits: {
        "1000": { dp: 2, enhancements: 2, copies: 2 },
        "2000": { dp: 3, enhancements: 4, copies: 3 },
      },
    },
    detachments: [
      {
        name: "Test Detachment",
        dp: 2,
        objectives: [],
        enhancements: [
          { name: "Test Relic", points: 20 },
          { name: "Test Upgrade (Upgrade)", points: 10 },
        ],
      },
      {
        name: "Alternate",
        dp: 1,
        unique: "Group",
        objectives: [],
        enhancements: [],
      },
      {
        name: "Duplicate tag",
        dp: 1,
        unique: "Group",
        objectives: [],
        enhancements: [],
      },
    ],
    rules: [
      {
        id: "test-rule",
        name: "Test rule",
        text: "Synthetic test rule",
        sourceId: "fixture",
      },
    ],
    units: [
      unit("Test Captain", {
        keywords: ["Infantry", "Character"],
        pricing: [
          { range: "[1,)", label: "all", costs: [{ models: 1, points: 100 }] },
        ],
        leaderTo: ["Test Troops"],
        reviewed: {
          equipment: [{ name: "Test sword", min: 1, maxPerModel: 1 }],
          allowedEnhancements: ["Test Relic", "Test Upgrade (Upgrade)"],
        },
      }),
      unit("Test Troops", { keywords: ["Infantry", "Battleline"] }),
      unit("Test Veterans", {
        pricing: [
          {
            range: "[1,2]",
            label: "first two",
            costs: [{ models: 5, points: 100 }],
          },
          {
            range: "[3,)",
            label: "third+",
            costs: [{ models: 5, points: 120 }],
          },
        ],
      }),
      unit("Test Hero", {
        keywords: ["Infantry", "Character", "Epic Hero"],
        pricing: [
          { range: "[1,)", label: "all", costs: [{ models: 1, points: 100 }] },
        ],
      }),
      unit("Test Transport", {
        keywords: ["Vehicle", "Dedicated Transport"],
        pricing: [
          { range: "[1,)", label: "all", costs: [{ models: 1, points: 100 }] },
        ],
        reviewed: {
          equipment: [{ name: "Test sword", min: 0, maxPerModel: 1 }],
          transport: {
            capacity: 6,
            requiredKeyword: "Infantry",
            excludedKeywords: ["Jump Pack"],
            weights: { Terminator: 2 },
          },
        },
      }),
    ],
  };
}
export function roster(pointsLimit: 1000 | 2000 = 1000): Roster {
  return {
    name: "Synthetic army",
    snapshotId: "test-snapshot",
    pointsLimit,
    faction: "Black Templars",
    detachments: ["Test Detachment"],
    units: [
      {
        id: "captain",
        unit: "Test Captain",
        models: 1,
        equipment: [{ name: "Test sword", count: 1 }],
        enhancements: [],
        warlord: true,
      },
      {
        id: "troops",
        unit: "Test Troops",
        models: 5,
        equipment: [{ name: "Test sword", count: 5 }],
        enhancements: [],
        warlord: false,
      },
    ],
  };
}
