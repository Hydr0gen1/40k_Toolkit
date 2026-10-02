import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCombat } from '../src/combat.js';
const weapon = {name:'Test', models:1, attacks:0, skill:4, strength:4, ap:0, damage:1};
const target = {name:'Trooper', models:1, wounds:1, toughness:4, save:7};
function run(extra: Record<string, unknown>) {
  const r = calculateCombat({trials:50000, defenderGroups:[target], weapons:[weapon], ...extra});
  if(r.status !== 'calculated') throw new Error('incomplete');
  return r;
}
test('direct mortals spill across mixed wounds and bypass saves and reduction', () => {
  const r = run({defenderGroups:[target,{...target,name:'Leader',wounds:2,save:2,damageReduction:5}],mortalWounds:3});
  assert.equal(r.expectedDamage,3); assert.equal(r.expectedCasualties,2);
  assert.deepEqual(r.groupCasualties.map(g => g.expectedCasualties),[1,1]);
});
test('mortal spill uses each receiving groups FNP', () => {
  const r=run({defenderGroups:[target,{...target,name:'Leader',mortalFeelNoPain:4}],mortalWounds:2});
  assert.ok(Math.abs(r.expectedCasualties! - 1.5)<0.01);
});
test('normal damage cannot spill between mixed groups', () => {
  const r=run({defenderGroups:[target,{...target,name:'Leader',wounds:3}],weapons:[{...weapon,attacks:1,damage:10}]});
  assert.equal(r.groupCasualties![1].expectedCasualties,0);
});
test('sustained one gives exact mean one third damage; dice sustained is supported', () => {
  const defenderGroups=[{...target,wounds:100}];
  const r=run({defenderGroups,weapons:[{...weapon,attacks:1,sustainedHits:1}]});
  assert.ok(Math.abs(r.expectedDamage! - 1/3)<0.01);
  const d=run({defenderGroups,weapons:[{...weapon,attacks:1,sustainedHits:'D3'}]});
  assert.ok(Math.abs(d.expectedDamage! - 5/12)<0.01);
});
test('allocation updates toughness and saves; fixed toughness is explicit', () => {
  const base={defenderGroups:[target,{...target,name:'Leader',toughness:8}],mortalWounds:1,mortalWoundsTiming:'before',weapons:[{...weapon,attacks:1}]};
  assert.ok(Math.abs(run(base).expectedDamage! - (1+1/12))<0.01);
  assert.ok(Math.abs(run({...base,unitToughness:4}).expectedDamage! - 1.25)<0.01);
  assert.ok(Math.abs(run({...base,unitToughness:4,defenderGroups:[target,{...target,name:'Leader',save:2}]}).expectedDamage! - (1+1/24))<0.01);
});
test('mixed and legacy target inputs cannot conflict', () => {
  assert.throws(() => run({defender:{models:1,wounds:1,toughness:4,save:7}}),/either/);
});
