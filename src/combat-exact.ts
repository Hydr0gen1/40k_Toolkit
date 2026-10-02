import type { Combat } from './combat.js';

// A state is actual wounds removed. Fixed allocation makes this sufficient to
// identify the current model and its remaining wounds, even with mixed groups.
type Distribution = Map<number, number>;
type Kernel = (state: number) => Distribution;
const point = (n: number): Distribution => new Map([[n, 1]]);
function add(out: Distribution, state: number, probability: number) {
  if (probability !== 0) out.set(state, (out.get(state) ?? 0) + probability);
}
export function diceDistribution(value: number | string): Distribution {
  if (typeof value === 'number') return point(value);
  const match = value.match(/^(\d*)D(3|6)(?:\+(\d+))?$/i)!;
  let out = point(Number(match[3] ?? 0));
  for (let n = 0; n < Number(match[1] || 1); n++) {
    const next: Distribution = new Map();
    for (const [sum, p] of out)
      for (let face = 1; face <= Number(match[2]); face++) add(next, sum + face, p / Number(match[2]));
    out = next;
  }
  return out;
}
const passes = (r: number, target: number, modifier: number, critical: number) =>
  r !== 1 && (r >= critical || r + modifier >= target);
function rolls(mode: 'none' | 'ones' | 'failed', target: number, modifier: number, critical: number) {
  const out: Distribution = new Map();
  for (let r = 1; r <= 6; r++) {
    if ((mode === 'ones' && r === 1) || (mode === 'failed' && !passes(r, target, modifier, critical))) {
      for (let next = 1; next <= 6; next++) add(out, next, 1 / 36);
    } else add(out, r, 1 / 6);
  }
  return out;
}
const woundTarget = (s: number, t: number) => s >= 2*t ? 2 : s > t ? 3 : s === t ? 4 : s*2 <= t ? 6 : 5;

export function exactCombat(c: Combat) {
  const groups = c.defenderGroups ?? [{...c.defender!, name: 'Target'}];
  const models = groups.flatMap((d, group) => Array.from({length: d.models}, () => ({...d, group})));
  const total = models.reduce((sum, d) => sum + d.wounds, 0);
  const start: number[] = [], end: number[] = [], modelAt: number[] = [];
  if (total > 10000) throw new Error('Scenario exceeds the exact calculation budget. Reduce target models or wounds.');
  let offset = 0;
  models.forEach((d, i) => {
    start[i] = offset; end[i] = offset + d.wounds;
    for (let j = 0; j < d.wounds; j++) modelAt[offset++] = i;
  });
  modelAt[total] = models.length;
  let operations = 0;
  const tick = () => {
    if (++operations > 5_000_000) throw new Error('Scenario exceeds the exact calculation budget. Reduce weapon profiles, attacks or target size. No simulated or approximate result was substituted.');
  };
  function mix(out: Distribution, input: Distribution, weight: number) {
    if (weight === 0) return;
    for (const [s, p] of input) { tick(); add(out, s, p * weight); }
  }
  function advance(input: Distribution, kernel: Kernel) {
    const out: Distribution = new Map();
    for (const [s, p] of input) { tick(); mix(out, kernel(s), p); }
    return out;
  }
  function repeat(input: Distribution, kernel: Kernel, counts: Distribution) {
    const out: Distribution = new Map();
    const max = Math.max(...counts.keys());
    let current = input;
    for (let n = 0; n <= max; n++) {
      mix(out, current, counts.get(n) ?? 0);
      if (n !== max) current = advance(current, kernel);
    }
    return out;
  }
  const damageCache = new Map<string, Distribution>();
  function damage(state: number, amount: number, spill: boolean, mortal: boolean): Distribution {
    if (state === total || amount === 0) return point(state);
    const key = `${state}/${amount}/${spill}/${mortal}`;
    const cached = damageCache.get(key); if (cached) return cached;
    const limit = spill ? total : end[modelAt[state]];
    let current = point(state);
    for (let n = 0; n < amount; n++) {
      const next: Distribution = new Map();
      for (const [s, p] of current) {
        tick();
        if (s === limit) { add(next, s, p); continue; }
        const d = models[modelAt[s]];
        const fnp = mortal ? Math.min(d.feelNoPain ?? 7, d.mortalFeelNoPain ?? 7) : d.feelNoPain ?? 7;
        const lossChance = (fnp - 1) / 6;
        add(next, s + 1, p * lossChance); add(next, s, p * (1 - lossChance));
      }
      current = next;
    }
    damageCache.set(key, current); return current;
  }
  const attacks = c.weapons.map(w => {
    const bonus = (w.blast ? Math.floor(models.length / 5) : 0) + (w.withinHalfRange ? w.rapidFire : 0);
    return new Map([...diceDistribution(w.attacks)].map(([n, p]) => [n + bonus, p]));
  });
  if (attacks.reduce((n, dist, i) => n + Math.max(...dist.keys()) * c.weapons[i].models, 0) > 5000)
    throw new Error('Scenario exceeds the exact calculation budget of 5,000 possible attacks. Reduce attacks or models.');
  const mortals = diceDistribution(c.mortalWounds);
  const mortalKernel: Kernel = s => {
    const out: Distribution = new Map();
    for (const [n, p] of mortals) mix(out, damage(s, n, true, true), p);
    return out;
  };
  let states = point(0);
  if (c.mortalWoundsTiming === 'before') states = advance(states, mortalKernel);
  c.weapons.forEach((w, weaponIndex) => {
    const damageDice = diceDistribution(w.damage), sustained = diceDistribution(w.sustainedHits);
    const hitRolls = rolls(w.hitReroll, w.skill, w.hitModifier, w.criticalHit);
    const hitCache = new Map<string, Distribution>(), attackCache = new Map<number, Distribution>();
    function hit(state: number, lethal: boolean): Distribution {
      if (state === total) return point(state);
      const key = `${state}/${lethal}`;
      const cached = hitCache.get(key); if (cached) return cached;
      const d = models[modelAt[state]], out: Distribution = new Map();
      const threshold = woundTarget(w.strength, c.unitToughness ?? d.toughness);
      const modifier = Math.max(-1, Math.min(1, w.woundModifier + d.woundModifier));
      const woundRolls = lethal ? point(0) : rolls(w.woundReroll, threshold, modifier, w.criticalWound);
      for (const [r, p] of woundRolls) {
        if (!lethal && !passes(r, threshold, modifier, w.criticalWound)) { add(out, state, p); continue; }
        const devastating = !lethal && w.devastatingWounds && r >= w.criticalWound;
        const saveTarget = Math.min(Math.max(2, d.save - w.ap - d.saveBonus), d.invulnerable ?? 7);
        const unsaved = devastating ? 1 : (saveTarget - 1) / 6;
        add(out, state, p * (1 - unsaved));
        for (const [rolled, chance] of damageDice) {
          const amount = rolled === 0 ? 0 : Math.max(1, (d.halveDamage ? Math.ceil(rolled / 2) : rolled) + (w.withinHalfRange ? w.melta : 0) - d.damageReduction);
          mix(out, damage(state, amount, devastating && w.devastatingSpill, false), p * unsaved * chance);
        }
      }
      hitCache.set(key, out); return out;
    }
    const normalHit: Kernel = s => hit(s, false);
    const attack: Kernel = state => {
      if (state === total) return point(state);
      const cached = attackCache.get(state); if (cached) return cached;
      if (w.torrent) return hit(state, false);
      const out: Distribution = new Map();
      for (const [r, p] of hitRolls) {
        if (!passes(r, w.skill, w.hitModifier, w.criticalHit)) { add(out, state, p); continue; }
        const critical = r >= w.criticalHit;
        const first = hit(state, critical && w.lethalHits);
        mix(out, critical ? repeat(first, normalHit, sustained) : first, p);
      }
      attackCache.set(state, out); return out;
    };
    for (let m = 0; m < w.models; m++) states = repeat(states, attack, attacks[weaponIndex]);
    // Damage kernels can be shared within a profile; release them between profiles.
    damageCache.clear();
  });
  if (c.mortalWoundsTiming === 'after') states = advance(states, mortalKernel);
  const mass = [...states.values()].reduce((a, b) => a + b, 0);
  if (!Number.isFinite(mass) || Math.abs(mass - 1) > 1e-8) throw new Error('Probability calculation failed its numerical consistency check.');
  const distribution = [...states].sort((a,b) => a[0] - b[0]).map(([s,p]) => [s,p/mass] as const);
  const casualties: Distribution = new Map();
  let expectedDamage = 0, expectedCasualties = 0;
  const groupCasualties = groups.map(d => ({name:d.name, expectedCasualties:0}));
  const groupStarts = groups.map((_, i) => groups.slice(0,i).reduce((n,d) => n+d.models,0));
  for (const [s,p] of distribution) {
    const killed = modelAt[s];
    expectedDamage += s*p; expectedCasualties += killed*p; add(casualties, killed, p);
    groups.forEach((d,i) => {groupCasualties[i].expectedCasualties += Math.max(0, Math.min(d.models, killed-groupStarts[i]))*p;});
  }
  function quantile(q: number) {
    let cumulative = 0;
    for (const [s,p] of distribution) { cumulative += p; if (cumulative >= q) return s; }
    return total;
  }
  return {
    method: 'exact' as const,
    precision: 'Enumerated probabilities with floating-point arithmetic; no random sampling.',
    targetModels: models.length, expectedDamage, expectedCasualties, groupCasualties,
    destructionProbability: Math.min(1, Math.max(0, (states.get(total) ?? 0) / mass)),
    damagePercentiles: {p10:quantile(0.1), median:quantile(0.5), p90:quantile(0.9)},
    damageDistribution: Object.fromEntries(distribution),
    casualtyDistribution: Object.fromEntries(casualties),
  };
}
