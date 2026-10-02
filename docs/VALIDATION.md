# Validation report

Validated on October 2, 2026, using Node 24.14.0 on Windows.

## Automated checks

`npm test` compiles TypeScript and runs **27 passing tests**, with no failures or skipped tests.

- Synthetic complete rosters at 1,000 and 2,000 points; different copy limits and tiered requisition costs; intermediate unit sizes.
- Missing rules, stale snapshots, unknown units/equipment, declared point mismatches, Warlord rules, enhancement limits, attachment cycles and transport capacity including characters.
- Conservative pasted-list parsing and comparisons that distinguish incompatible formats/snapshots.
- Seeded combat against exact 25%, 37.5% and 12.5% probability cases; rerolls, torrent, lethal/devastating interaction, damage spill, unsupported effects and workload bounds.
- Source parser drift, blocked endpoints, deduplicated research leads, article access challenges and separation of event formats/versions.
- Failed refresh preserves the active snapshot; immutable IDs; database persistence across reopening; consistent SQLite backup and reopening the backup.
- Full HTTP OAuth login with browser-bound authorization request, PKCE rejection/acceptance, code reuse rejection, resource binding, redirect-origin restrictions, refresh rotation and token-family revocation.
- Two independent official-SDK MCP clients perform discovery, data status, unit lookup, validation and comparison at both game sizes, combat calculation and evidence lookup.

`npm audit --omit=dev --audit-level=moderate` reported **zero known vulnerabilities** at the time of this check. This is a point-in-time dependency audit, not a security certification.

## Live source checks

- Direct official MFM refresh succeeded with 126 unit entries, 18 detachments and 483 searchable references.
- A sample live roster was checked at both points limits. Both returned `incomplete`, correctly retaining the known data and rules gaps; both could be compared against another candidate.
- Tournament RSS discovery returned ten articles. Their article pages returned access challenges, recorded as unverified leads without invented event results.

The sample live roster was a lookup/validation smoke test, not a competitive list recommendation.

## Not verified here

- Docker image build/start: Docker is not installed in this environment. The Dockerfile runs the same test suite during its build, but that build has not been executed here.
- Your server, domain, TLS certificate and reverse proxy.
- Your actual ChatGPT and Claude account connections. The two-client tests establish protocol behavior, not successful product-account installation.
- Full Black Templars legality, all conditional rules, current mission-pack coverage or complete tournament evidence. See `COVERAGE.md`.

## Acceptance still needed on the server

Build and start the container; verify readiness; authorize both assistants; compare the same snapshot through both; test a controlled refresh failure; restart and confirm persistence; restore a backup into a fresh volume. Review and encode missing live rules before relying on a `valid` tournament result. These steps are not marked complete by the local automated test results.


## Calculator extension

33 automated tests pass after adding the faction-neutral browser calculator, mixed target groups, dice-valued Sustained Hits and direct mortal wounds. Browser verification confirmed preset changes and a mixed one-wound/two-wound target destroyed by three direct mortals. PC server tested at port 8790. Docker remains untested on this PC (Docker unavailable). See CALCULATOR.md for setup and explicit allocation limitations.


## Exact probability engine

The browser and MCP combat tool now enumerate outcome probabilities instead of sampling random rolls. All 41 tests pass. New checks compare to analytic fractions at 1e-12 tolerance: single attacks, rerolls, FNP, correlated Sustained/Lethal Hits, independent random attacks per model, capped random damage, Devastating spill and mixed mortal defenses. All browser preset combinations conserve probability. Legacy trial/seed settings cannot affect results. The simulation selector and seed fields have been removed from the browser UI.
