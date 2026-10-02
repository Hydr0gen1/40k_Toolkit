# Interfaces and administration

The source of truth for input schemas is `src/model.ts` and `src/combat.ts`; MCP advertises schemas automatically. Unknown input properties in rosters and combat scenarios are rejected.

## Roster

```json
{
  "name": "Candidate A",
  "snapshotId": "COPY_FROM_GET_DATA_STATUS",
  "pointsLimit": 2000,
  "faction": "Black Templars",
  "detachments": ["EXACT_CURRENT_DETACHMENT_NAME"],
  "units": [
    {
      "id": "leader-1",
      "unit": "EXACT_UNIT_ID_FROM_GET_UNIT",
      "models": 1,
      "equipment": [{ "name": "EXACT_EQUIPMENT_NAME", "count": 1 }],
      "enhancements": [],
      "warlord": true
    }
  ],
  "mission": "Describe the mission pack",
  "terrain": "Describe the terrain format"
}
```

Unit IDs identify datasheets; selection IDs identify individual copies in the roster. For an attached character add `"attachment":{"targetId":"bodyguard-selection-id","role":"leader"}` or `"role":"support"`. For embarked units add `"transportId":"transport-selection-id"` to every component of an attached unit. `declaredPoints` is optional and checked against recalculated points. Use `composition` for named/composite pricing choices where necessary.

The roster uses a `detachments` array because the current data supports selecting multiple detachments within a DP budget. Upgrade enhancements have their own copy-count rules. Costs come from the pinned snapshot, never from a caller-supplied points table. Copies are priced in roster order; mixed-size copies with requisition thresholds are flagged for review.

`validate_list` accepts either `{roster: ...}` or `{text: ..., textContext: ...}`. `textContext` has the roster fields except units. Text parsing recognizes `Unit Name (N Points)`, Warlord, Enhancement and explicit `Models: N` lines. Weapon and model lines in army exports can be ambiguous; the parser preserves them as unresolved rather than guessing. Assistants must resubmit a confirmed structured roster.

`compare_lists` accepts `rosters` containing two or three structured rosters of the same format and snapshot. It returns validation plus factual composition metrics; the assistant supplies strategic interpretation.

## Combat

`calculate_combat` accepts the example in `examples/combat.json`. Values are declared scenario inputs, not automatically derived from a datasheet. `sourceReferences` on each weapon records provenance. Set `snapshotId` when working from stored rules.

- Attacks and damage accept integers or bounded `D3`, `D6`, `2D6`, `D6+2` expressions.
- Hit and wound rerolls are `none`, `ones`, or `failed`; modified thresholds and critical thresholds are distinct.
- Supported effect switches: lethal hits, sustained hits, devastating wounds, torrent, blast, rapid fire, melta, within-half-range, save bonus, invulnerable save, Feel No Pain, damage reduction and halving damage.
- `criticalWound` can express an anti threshold only after the assistant checks the target keyword. `woundReroll: "failed"` can express twin-linked. These labels do not automatically verify eligibility.
- Save bonus is explicit: the caller must determine whether cover or another bonus is applicable. `devastatingSpill` is explicit and defaults false; verify the applicable rules version.
- Fixed weapon order. Supply either legacy `defender` or ordered `defenderGroups` (each with a `name` and defensive characteristics). Groups allocate front to back, finishing each model. Optional `unitToughness` fixes all wound tests; otherwise the allocated model supplies Toughness. Precision, automatic attached-unit Toughness transitions, hazardous self-damage and unmodeled effects must be listed in `unsupportedAbilities`, which blocks calculation.
- `mortalWounds` accepts a number or dice and `mortalWoundsTiming` is `before` or `after` weapons. Direct mortals spill, bypass saves and normal damage reduction, and use each model's best general or `mortalFeelNoPain`. `sustainedHits` also accepts dice. Outputs include total `targetModels` and `groupCasualties`. See [calculator setup and limitations](CALCULATOR.md).
- Results include `method: "exact"`, applied scenario, expected capped damage, expected casualties, destruction probability, per-group expected casualties, damage percentiles and full damage/casualty probability distributions. Probabilities are enumerated using floating-point arithmetic without random sampling; there are no sampling confidence intervals. Legacy `seed` and `trials` inputs are accepted but ignored and omitted from results. Outcome percentiles describe dice variability, not uncertainty in rules. Large scenarios exceeding the calculation budget return an explicit error rather than a simulation fallback.

## Source updates and reviewed material

Administrative commands run in a terminal on the server, never through AI-facing MCP tools:

```sh
node dist/src/admin.js refresh
node dist/src/admin.js research
node dist/src/admin.js status
node dist/src/admin.js export /app/data/snapshot.json
node dist/src/admin.js import-snapshot /app/data/reviewed-snapshot.json
node dist/src/admin.js import-evidence /app/data/reviewed-events.json
node dist/src/admin.js validate /app/data/roster.json
```

To copy a file into the running container's persistent data directory, use `docker compose cp LOCAL_FILE toolkit:/app/data/FILE`. Prefix commands with `docker compose exec toolkit` when deployed.

Snapshots contain source hashes, URLs, versions, timestamps, points, profiles, rule references, coverage and reviewed constraints. IDs are immutable. Reviewed snapshots require a new ID. Import validates structure and source references, but the administrator is responsible for evidence accuracy. Do not set coverage to complete merely to suppress warnings. An automatic refresh creates a new partial snapshot and does not carry forward unverified manual overrides.

Reviewed equipment constraints encode required quantities and per-model/max limits; transport constraints encode capacity, required/excluded keywords and slot weights; enhancement allowlists and Warlord constraints can also be supplied. Complex conditional rules beyond these capabilities must remain coverage gaps. This is not a general BattleScribe rules interpreter.

## Event evidence

Import a JSON array of records with these fields:

- `event`, `eventDate` (`YYYY-MM-DD`), `publishedAt`, `pointsLimit` (1000 or 2000), `edition`, `rulesVersion` (for example `MFM 1.5`), `faction`.
- `placing` and/or `record`, concise factual `summary`, source `url`, `kind: "event-result"`.
- Optional `id`, `retrievedAt` and `roster` text. Nullable fields must explicitly be null. The import requires known event date, format, edition, rules version, faction and result for reviewed records.

Default identity deduplicates event/date/format/faction/placing/record across different articles. If two distinct players share those values, provide explicit stable IDs distinguishing them. Reimporting an ID replaces that evidence record. This does not alter rules snapshots.

Automatic RSS discovery creates `research-lead` records with unknown event fields. Known wrong formats or rules versions are excluded from relevant results; unknown contexts remain leads. Old matching reports are returned separately. No aggregate win rate is computed.
