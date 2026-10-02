import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCombat } from '../src/combat.js';
import { diceDistribution } from '../src/combat-exact.js';
import { attacks, targets } from '../src/calculator/presets.js';
const weapon = {name:'Test',models:1,attacks:1,skill:4,strength:4,ap:0,damage:1};
const defender = {models:1,wounds:1,toughness:4,save:7};
const close = (actual:number, expected:number) => assert.ok(Math.abs(actual-expected)<1e-12, `${actual} != ${expected}`);
function run(overrides:Record<string,unknown> = {}) {
  const r=calculateCombat({defender,weapons:[weapon],...overrides});
  if(r.status !== 'calculated') throw new Error(r.summary);
  close(Object.values(r.casualtyDistribution).reduce((a,b)=>a+b,0),1);
  close(Object.values(r.damageDistribution).reduce((a,b)=>a+b,0),1);
  return r;
}
test('exact single attack, rerolls and FNP match fractions at numerical precision',()=> {
  close(run().destructionProbability,1/4);
  close(run({weapons:[{...weapon,hitReroll:'failed'}]}).expectedDamage,3/8);
  close(run({defender:{...defender,feelNoPain:4}}).expectedDamage,1/8);
});
test('sustained hits retain the shared critical-hit event, including lethal originals',()=> {
  const plain=run({defender:{...defender,models:2},weapons:[{...weapon,sustainedHits:1}]});
  close(plain.casualtyDistribution['0'],17/24);
  close(plain.casualtyDistribution['1'],1/4);
  close(plain.casualtyDistribution['2'],1/24);
  const lethal=run({defender:{...defender,models:2},weapons:[{...weapon,sustainedHits:1,lethalHits:true}]});
  close(lethal.casualtyDistribution['0'],2/3);
  close(lethal.casualtyDistribution['1'],1/4);
  close(lethal.casualtyDistribution['2'],1/12);
});
test('random attacks are independently distributed for each attacking model',()=> {
  close(run({weapons:[{...weapon,models:2,attacks:'D3',torrent:true}]}).destructionProbability,1-(7/24)**2);
  const dice=diceDistribution('2D3+1');
  assert.deepEqual([...dice.keys()],[3,4,5,6,7]);
  close(dice.get(5)!,1/3);
});
test('random damage caps at remaining wounds rather than averaging damage first',()=> {
  const r=run({defender:{...defender,wounds:2},weapons:[{...weapon,torrent:true,damage:'D3'}]});
  close(r.expectedDamage,5/6); close(r.destructionProbability,1/3);
});
test('devastating bypasses saves but only spills when requested',()=> {
  const setup={defender:{...defender,models:2,save:2},weapons:[{...weapon,torrent:true,criticalWound:2,devastatingWounds:true,damage:3}]};
  close(run(setup).expectedCasualties,5/6);
  close(run({...setup,weapons:[{...setup.weapons[0],devastatingSpill:true}]}).destructionProbability,5/6);
});
test('mixed mortal defenses and sequence produce exact joint outcomes',()=> {
  const r=run({defender:undefined,defenderGroups:[{...defender,name:'First'},{...defender,name:'Second',mortalFeelNoPain:4}],mortalWounds:2,weapons:[{...weapon,attacks:0}]});
  close(r.destructionProbability,1/2); close(r.expectedDamage,1.5);
  close(r.groupCasualties[0].expectedCasualties,1); close(r.groupCasualties[1].expectedCasualties,1/2);
});
test('legacy sampling settings cannot change or appear in exact outputs',()=> {
  assert.deepEqual(run({trials:1000,seed:1}),run({trials:100000,seed:999}));
  assert.ok(!('trials' in run().appliedScenario));
  assert.ok(!('seed' in run()));
});
test('all browser presets calculate normalized distributions',()=> {
  for(const attack of attacks) for(const target of targets)
    run({weapons:[attack.values],defender:target.values});
});
