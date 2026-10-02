# Black Templars AI Toolkit

A personal, self-hosted MCP service for ChatGPT and Claude. It supplies sourced unit references, list checks, combat probabilities and tournament research without calling a paid AI API.

**Current status:** the service and automated tests work locally. Live data imports successfully, but rule coverage is **partial**. Community Space Marine data reports pending updates. Real lists therefore receive `incomplete` unless definite errors make them `invalid`. This is not yet a comprehensive tournament legality certifier. Docker execution and connections from your actual ChatGPT/Claude accounts must be verified on your server.

Start with [Deployment](docs/DEPLOYMENT.md), then use [Assistant instructions](docs/ASSISTANT-INSTRUCTIONS.md). See the [coverage report](docs/COVERAGE.md) and [validation report](docs/VALIDATION.md) for what is verified and what remains.

The [October 2 live snapshot](snapshots/11e-2026-10-02-ed0bb9d42646.json) is included for import. See the [coverage report](docs/COVERAGE.md#october-2-live-refresh) for activation instructions and remaining gaps.

## Browser calculator

For the faction-neutral Mathhammer calculator, run `npm ci` then `npm run calculator` and open http://127.0.0.1:8790/calculator/. No account or API key needed. See [PC and Docker setup](docs/CALCULATOR.md) for mixed units, weapon abilities and limitations.

## What is included

- Seven MCP tools: data status, rules search, unit lookup, list validation, list comparison, combat calculation and tournament evidence search.
- Official MFM points, requisition tiers, paid equipment, detachments and attachment lists. Pinned community datasheets supplement official values.
- Current-edition 1,000- and 2,000-point roster formats with multiple detachments. Intermediate unit sizes pay the next points bracket.
- Direct combat probability calculations with exact outcome distributions and explicit effects; unsupported interactions block calculation.
- Daily refresh, immutable SQLite snapshots, failure retention, OAuth with PKCE, Docker Compose and administrative backup/import commands.
- Public tournament article discovery. Reviewed event records are kept separate from leads with unknown rules or format. Automatic extraction is conservative; blocked pages remain visible gaps.

## Local development

Requires Node 24.14 or newer. No API key is needed.

```sh
npm ci
npm test
npm run admin -- init
```

Edit `.env`: for local development use `PUBLIC_URL=http://localhost:8787`, `TRUST_PROXY=false`. Set `AUTO_REFRESH=false` if testing offline. The generated owner password is in `secrets/owner-password.txt`; move it to your password manager and delete that file.

```sh
node --env-file=.env dist/src/admin.js refresh
node --env-file=.env dist/src/admin.js research
node --env-file=.env dist/src/main.js
```

The normal MCP route requires OAuth even on localhost. The integration tests exercise the full login and token flow; there is intentionally no authentication bypass.

## Inputs and outputs

The [interface guide](docs/INTERFACES.md) explains the roster format and effect fields. Examples in `examples/` are templates, not recommended legal armies. Replace the snapshot ID using `get_data_status` and retrieve current units before constructing lists.

List results distinguish:

- `valid`: all encoded checks passed with complete reviewed coverage.
- `invalid`: at least one definite violation was found; unknowns may also exist.
- `incomplete`: inputs or rules are missing, conflicted, stale or unreviewed.

`knownPoints` is a subtotal when any cost is unresolved; `totalPoints` is then null. Every result belongs to a specific snapshot. Historical snapshots remain available but must not be passed off as current.

## Project layout

`src/` contains the service, source adapters, validator, probability engine and admin commands. `test/` contains synthetic rules tests and a full OAuth/MCP integration test. `docs/` contains operation and assistant guides. `src/vendor/mfm/` contains the attributed MIT-licensed MFM parser.

Warhammer content belongs to its respective owners. This is an unofficial personal tool. The distribution contains no bundled commercial codex or copied tournament articles; it fetches public references at runtime. See [third-party notices](THIRD-PARTY-NOTICES.md).
