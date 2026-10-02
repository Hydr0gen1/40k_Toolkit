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

The full toolkit also serves `/calculator/` behind your existing proxy. This static calculator page is public; `/mcp` remains authenticated. Inputs are calculated locally, not sent to an analysis API. The calculator stores nothing automatically; **Save result** downloads inputs, results and assumptions as JSON. Existing toolkit backups cover its database, not downloaded calculator results.

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
