import { z } from "zod";
import { Unit as PointsUnit, Detachment } from "./vendor/mfm/model.js";

export const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const SourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  kind: z.enum(["official", "community"]),
  retrievedAt: z.string().datetime(),
  version: z.string(),
  sha256: z.string(),
  notes: z.string().optional(),
});
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
  sourceId: z.string(),
  unitId: z.string().optional(),
});
export const UnitSchema = PointsUnit.extend({
  id: z.string(),
  faction: z.string(),
  sourceIds: z.array(z.string()),
  keywords: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  profiles: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        values: z.record(z.string()),
      }),
    )
    .default([]),
  equipment: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  // Reviewed constraints are supplied only by an administrator, never by a roster.
  reviewed: z
    .object({
      equipment: z
        .array(
          z.object({
            name: z.string(),
            min: z.number().int().nonnegative(),
            maxPerModel: z.number().nonnegative(),
            max: z.number().int().nonnegative().optional(),
          }),
        )
        .optional(),
      forbidden: z.boolean().optional(),
      mustBeWarlord: z.boolean().optional(),
      cannotBeWarlord: z.boolean().optional(),
      transport: z
        .object({
          capacity: z.number().int().positive(),
          requiredKeyword: z.string(),
          excludedKeywords: z.array(z.string()),
          weights: z.record(z.number().int().positive()),
        })
        .optional(),
      allowedEnhancements: z.array(z.string()).optional(),
    })
    .optional(),
});
export const SnapshotSchema = z.object({
  id: z.string(),
  edition: z.literal("11th"),
  createdAt: z.string().datetime(),
  sources: z.array(SourceSchema),
  units: z.array(UnitSchema),
  detachments: z.array(Detachment),
  rules: z.array(RuleSchema),
  coverage: z.object({
    status: z.enum(["complete", "partial"]),
    gaps: z.array(z.string()),
    rulesVersion: z.string(),
    notes: z.array(z.string()),
  }),
  muster: z.object({
    verified: z.boolean(),
    sourceId: z.string(),
    limits: z.object({
      "1000": z.object({
        dp: z.number(),
        enhancements: z.number(),
        copies: z.number(),
      }),
      "2000": z.object({
        dp: z.number(),
        enhancements: z.number(),
        copies: z.number(),
      }),
    }),
  }),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type Source = z.infer<typeof SourceSchema>;
export const SelectionSchema = z
  .object({
    id: z.string().min(1).max(80),
    unit: z.string().min(1).max(160),
    models: z.number().int().min(1).max(100),
    composition: z.string().optional(),
    equipment: z
      .array(
        z.object({
          name: z.string().min(1),
          count: z.number().int().min(1).max(200),
        }),
      )
      .optional(),
    enhancements: z.array(z.string()).max(3).default([]),
    attachment: z
      .object({ targetId: z.string(), role: z.enum(["leader", "support"]) })
      .optional(),
    transportId: z.string().optional(),
    warlord: z.boolean().default(false),
    declaredPoints: z.number().int().nonnegative().optional(),
  })
  .strict();
export const RosterSchema = z
  .object({
    name: z.string().max(160).default("Army"),
    snapshotId: z.string().min(1),
    pointsLimit: z.union([z.literal(1000), z.literal(2000)]),
    faction: z.literal("Black Templars").default("Black Templars"),
    detachments: z.array(z.string()).min(1).max(4),
    units: z.array(SelectionSchema).min(1).max(100),
    mission: z.string().optional(),
    terrain: z.string().optional(),
  })
  .strict();
export type Roster = z.infer<typeof RosterSchema>;
export const EvidenceSchema = z.object({
  id: z.string(),
  event: z.string(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  publishedAt: z.string().nullable(),
  pointsLimit: z.union([z.literal(1000), z.literal(2000)]).nullable(),
  edition: z.string().nullable(),
  rulesVersion: z.string().nullable(),
  faction: z.string().nullable(),
  placing: z.number().int().positive().nullable(),
  record: z.string().nullable(),
  summary: z.string().max(1400),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
  kind: z.enum(["event-result", "research-lead"]),
  roster: z.string().max(20000).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
