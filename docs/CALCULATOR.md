# Mathhammer calculator on your PC

The faction-neutral calculator is included in this toolkit. It needs no AI subscription, API key, account, database or rules download. Calculations happen in your browser using the same combat engine as the MCP tool.

## Start on Windows

Install Node.js 24 LTS, extract the toolkit, and open a terminal in its folder. Run:

```powershell
npm ci
npm run calculator
```

Open http://127.0.0.1:8790/calculator/ in your browser. Keep the terminal running; Ctrl+C stops it. Later launches only need `npm run calculator`. The build is automatic. Dependencies need internet on initial installation; the calculator has no external runtime requests.

## Docker or the full toolkit

With Docker installed, run `docker compose -f compose.calculator.yaml up -d --build` and use the same address. This standalone mode needs no `.env`. It binds only to your PC. Stop with `docker compose -f compose.calculator.yaml down`.

The full toolkit also serves `/calculator/` behind your existing proxy. This static calculator page is public; `/mcp` remains authenticated. Inputs are calculated locally, not sent to an analysis API. The calculator stores nothing automatically; **Download result** downloads inputs, results and assumptions as JSON. Existing toolkit backups cover its database, not downloaded calculator results.

## Mixed units and abilities

- Add a named weapon profile for each distinct weapon or attacking model type, such as four troopers and one sergeant. Attacks are per model. For multiple weapons on one model, add each weapon with its eligible model count.
- Add defensive model groups for different wounds, Toughness, saves and Feel No Pain. Damage allocates top to bottom, finishing a model before moving on. **Move up** changes weapon or target order.
- Wound tests can use the allocated model's Toughness or a fixed unit Toughness. Check attached-unit rules yourself: the fixed value stays fixed after bodyguards die. Automatic transitions and Precision targeting are unsupported.
- Sustained Hits accepts a number or dice, including D3. Lethal Hits, Devastating Wounds, Torrent, Blast, rerolls, critical thresholds, Rapid Fire and Melta are editable per profile. Anti and Twin-linked can be represented by the eligible critical-wound threshold and failed-wound rerolls.
- Direct mortal wounds accept a number or dice, applied before or after all weapons. They spill across models, ignore saves and ordinary damage reduction, and use the receiving model's eligible Feel No Pain. Enter resolved mortal wounds, not an unmodeled ability's trigger probability.
- Ordinary damage does not spill. Devastating damage has an explicit spill option and uses general Feel No Pain; verify your rules before selecting it. Mortal-only Feel No Pain applies to the direct mortal pool.

Presets are generic examples, not verified current unit datasheets. All model counts start at full wounds. No movement, targeting legality, weapon eligibility, Hazardous self-damage or full-game prediction is inferred. Results show direct probabilities and expected values, with damage capped at the target's remaining wounds. No simulation count or seed is needed. The engine tracks the full outcome distribution, including correlated Sustained Hits, random attacks/damage and per-model allocation. Arithmetic uses floating-point numbers, so displayed values are rounded. Very large inputs may exceed the exact calculation budget and return an error; no approximate result is silently substituted.

## Verification

Run `npm test`. Tests include exact single-attack expectations, rerolls, Sustained Hits, mixed target wounds/saves/Toughness, mortal spill and per-model Feel No Pain. Docker instructions are supplied but Docker was unavailable on the development PC for a startup check.

## Guided real unit presets

Choose an **Attacker** and **Target** at the top. Unit size, phase, and starting
loadout choices fill the weapon and defence cards below. Add eligible leaders
or support characters to the base unit. Each card shows its key stats; open
**Edit stats** or its abilities panel to change the details. **Reset weapons**
and **Reset target** restore the selected profiles. Custom stats and example
targets remain available.

Setup and combat controls use matching columns on a wide screen and stack on
smaller screens. Direct mortal wounds and longer rule notes are expandable.
No additional setup is needed for this layout.

Included: Crusader Squad (10/20), Ballistus Dreadnought, Redemptor Dreadnought,
Bladeguard Veterans (3/6), and Emperor's Champion. Crusaders create separate
Neophyte and Initiate/Sword Brother defensive groups. Missile and sword modes
are mutually exclusive. Conditional Ballistus rerolls, Bladeguard offensive
stance, Champion Anti-Character / once-battle Devastating Wounds, Heavy and
Rapid Fire require explicit selections. All selected weapons are assumed in
range and eligible; this does not validate a roster or targeting legality.

**Data status:** presets are pinned to toolkit snapshot
`11e-2026-10-02-ed0bb9d42646` and community catalogue commit
`cc1830fbfead059f8059ed6c7f8e73cd4c390908`, retrieved 2 October 2026. The Marine
catalogues are awaiting the incoming codex update. The displayed status and saved
result identify this limitation; future official preview profiles are not silently
mixed into this snapshot. Toolkit refresh does not automatically change these
bundled browser presets. When updating, review `src/calculator/unit-presets.ts`
against the new snapshot, including unit abilities and equipment restrictions,
update its provenance and the page notice, then run tests and rebuild. No additional
installation or paid service is needed.

Champion attacks are available. Champion target calculations are blocked because
the saved Armour of Faith damage-cancellation rule is unsupported. Precision
allocation and Hazardous self-damage are excluded from the explicitly limited
attack scenarios. Bladeguard defensive stance is not automatic; its omission is
shown beside the unit and in assumptions. The flamer loadout rejects target save
bonuses because weapon-specific Ignores Cover cannot be represented in a combined
attack. Optional special weapons, pistol swaps, the Redemptor Icarus pod, leader
buffs and damaged vehicle penalties require custom inputs. Presets model the
listed basic packages, not every possible build.

### Expanded Black Templars / Codex library

The browser now indexes 118 non-Legends entries from the saved Black Templars
snapshot and the pinned Space Marines / Codex chapter catalogues. Search by unit name above each
selector. See [the coverage report](UNIT-PRESET-COVERAGE.md) for every entry and
known gaps. The four unresolved entries are Captain on Bike, Eradicator Squad
with Melta Rifles, Invader ATVs, and Drop Pod (weapon profiles only). Similar names
in the community catalogue remain separate rather than being silently merged
into a different current datasheet.

The original five presets keep their guided loadouts. Basic starting packages
are also supplied for Intercessors, Assault Intercessors (including Jump Packs),
Infernus, Hellblasters, Terminators, Sword Brethren, Helbrecht, Marshal, Castellan,
Grimaldus and the Land Raider. These packages exclude optional upgrades and
unit buffs. Other entries use **Choose weapons yourself**: choose a phase,
select a weapon or mode, enter its model/weapon-copy count, and add it. Supported
weapon keywords are filled automatically. Declaring more copies across alternative modes than the unit has models
blocks the calculation; different models may choose different modes. Anti checks the declared target keywords; Heavy checks
stationary status; Rapid Fire and Melta check half range. Unsupported keywords
block the odds instead of disappearing.

Imported targets show available defensive model variants. Grimaldus uses three
Servitors followed by his own profile. Other mixed units require explicit group
quantities. Starred invulnerable saves for Astraeus and Judiciar use the declared
incoming attack type. Unit ability names appear under **Unit rules**;
their effects are not generally inferred. Imported target calculations require an
explicit restricted baseline selection, and that exclusion is recorded in the
results. Range, loadout legality, full roster legality, ownership of optional
weapons, Hazardous self-damage and Precision allocation are not validated by
mathhammer. Additional Codex units outside the official Black Templars pool have
unverified current matched-play / Templars eligibility labels.

To rebuild the bundled library, obtain `Imperium - Space Marines.json` at the
pinned commit and run:

```powershell
node scripts/import-mathhammer-library.mjs "path/to/Imperium - Space Marines.json" "path/to/Imperium - Black Templars.json" "path/to/Imperium - Ultramarines.json" "path/to/Imperium - Imperial Fists.json" "path/to/Imperium - Iron Hands.json" "path/to/Imperium - Raven Guard.json" "path/to/Imperium - Salamanders.json" "path/to/Imperium - White Scars.json"
npm test
```

The importer generates `src/calculator/unit-library-data.ts` and the coverage
report. It does not run from AI-facing tools or fetch sources on browser startup.
When moving to a new rules revision, update the importer snapshot, commit,
provenance, reviewed packages and tests together, then rebuild. No extra setup
is required to use the expanded library on the PC or through Docker.


### Attached squads and leaders

Searching shows separate match buttons; the unit dropdown always keeps the full
118-entry library. Clear search or select a match to return to the normal picker.

For an attack, choose the base squad or standalone model first. Characters with
saved attachment lists appear under **Add leader** or **Add support**, rather
than in the base-unit picker. Pick a character to add their weapons and supported
bonuses. Choose **No leader / remove** or **No support / remove** to take them out.
The target picker also supports attached units. Eligibility comes from saved
official attachment lists where available, with community profiles as a fallback;
this does not certify full army legality or all character-stacking exceptions.

Weapons from each selected member are included. Reviewed starting packages load
automatically; other members require a declared weapon and manual review of
equipment/counts. Missing member weapons block the result. Targets put bodyguards
before characters and preserve each group's wounds and saves. Precision allocation
is excluded. Review Toughness rules for mixed-Toughness bodyguards; the current
engine uses the allocated group's Toughness unless an explicit fixed value is chosen.

Applied saved effects: Helbrecht adds 1 melee Attack and Strength to the attached
unit; Grimaldus grants failed melee hit rerolls and offers declared AP/Toughness
relic choices; Castellan rerolls require a declared Leadership-test result.
Servitor-dependent effects assume a surviving Servitor throughout the scenario.
Helbrecht's High Marshal mortal roll is excluded; use a separately resolved
direct-mortal pool. Other unit abilities remain explicit omissions. These are
conditional exact odds, not a full fight sequence or full-game prediction.

No additional PC or Docker setup is needed. Rebuild using the existing setup
instructions and reload `/calculator/` to load the new controls.


### Weapon dropdowns

With a named attacking unit, each weapon entry lists only that unit's weapons
for the selected shooting or melee phase. The starting loadout selects its actual
weapon names. In an attached squad, bodyguard and character entries each use
their own weapon lists. Switching a weapon loads its stats and applies the
selected conditions and supported leader bonuses once. Editing stats keeps the
weapon selected; reset the unit to restore its starting loadout.

Choose **Custom stats / example targets** as the attacking unit to use generic
weapon presets or enter unrestricted custom values. Weapon dropdowns do not
validate equipment ownership or an army's complete loadout legality.


### Streamlined attack setup

1. Choose the base unit or standalone model, its size, and shooting or melee.
2. Use **Add leader** or **Add support** if needed.
3. Set weapons and counts in the weapon rows. **Add a weapon for** chooses which
   member gets an extra row.
4. Choose the target and calculate.

The separate library weapon picker and repeated name fields have been removed.
Starting loadouts, bonuses and longer rules notes are expandable. Changing
characters keeps existing weapon choices, counts and numeric stat edits. Saved
bonuses are removed before the new character effects are applied, so they do not
stack with themselves. Units without a reviewed loadout start with one weapon
copy and show a reminder to complete the rest. No extra setup is required.
