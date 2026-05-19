import { ATTRS_BY_GRADE } from '../data/attributes.js';
import { AFFS, SUB_WEAK } from '../data/affinities.js';
import { ITEMS } from '../data/items.js';

export const rand = () => Math.random();
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function rollAttrCount() {
  const r = rand();
  let c = 0;
  for (const [n, p] of [[1, 0.5], [2, 0.25], [3, 0.125], [4, 0.0625], [5, 0.05125], [6, 0.01], [7, 0.00125]]) {
    c += p; if (r < c) return n;
  }
  return 1;
}

export function rollAttrGrade() {
  const r = rand();
  let c = 0;
  for (const [g, p] of [['S', 0.05], ['A', 0.10], ['B', 0.35], ['C', 0.25], ['D', 0.10], ['E', 0.10], ['F', 0.10]]) {
    c += p; if (r < c) return g;
  }
  return 'C';
}

export function pickAttrByGrade(grade, exclude = []) {
  const pool = ATTRS_BY_GRADE[grade].filter(k => !exclude.includes(k));
  return pool.length ? pick(pool) : ATTRS_BY_GRADE[grade][0];
}

export function rollCharacterAttrs() {
  const count = rollAttrCount();
  const attrs = [];
  const exclude = [];
  for (let i = 0; i < count; i++) {
    let grade = rollAttrGrade();
    if (count <= 2 && i === count - 1 && !attrs.some(a => 'SABC'.includes(a.grade))) grade = 'C';
    const key = pickAttrByGrade(grade, exclude);
    exclude.push(key);
    attrs.push({ key, grade });
  }
  return attrs;
}

export function rollAffinityCount() {
  const r = rand();
  if (r < 0.75) return 1;
  if (r < 0.85) return 2;
  if (r < 0.95) return 3;
  return 4;
}

export function rollOneAffinity(existing) {
  const avail = Object.keys(AFFS).filter(a => !existing.includes(a));
  if (!avail.length) return null;
  const lightP = avail.includes('Light') ? 0.05 : 0;
  const darkP = avail.includes('Darkness') ? 0.05 : 0;
  const others = avail.filter(a => a !== 'Light' && a !== 'Darkness');
  const otherP = others.length ? (1 - lightP - darkP) / others.length : 0;
  const r = rand();
  let c = 0;
  for (const a of avail) {
    c += a === 'Light' ? lightP : a === 'Darkness' ? darkP : otherP;
    if (r < c) return a;
  }
  return avail[avail.length - 1];
}

export function rollCharacterAffinities() {
  const count = rollAffinityCount();
  const aff = {};
  const picked = [];
  for (let i = 0; i < count; i++) {
    const a = rollOneAffinity(picked);
    if (!a) break;
    picked.push(a);
    aff[a] = { level: 1, exp: 0 };
    if (rand() < 0.15) {
      const sub = pick(AFFS[a].sub);
      aff[a].sub = sub;
      aff[a].subLevel = 1;
      aff[a].subExp = 0;
    }
  }
  return aff;
}

export function affinityMultiplier(attackerAff, defenderAffs) {
  if (!attackerAff || !defenderAffs?.length) return 1;
  if (attackerAff === 'Time' || attackerAff === 'Space') return 1.5;
  const isHigh = attackerAff === 'Light' || attackerAff === 'Darkness';
  let mult = isHigh ? 1.15 : 1.0;
  for (const def of defenderAffs) {
    const weakList = AFFS[def]?.weak || SUB_WEAK[def] || [];
    if (weakList.includes(attackerAff)) mult *= 1.5;
  }
  return mult;
}

export function weightedGrade(arr) {
  const r = rand();
  let c = 0;
  for (const [g, p] of arr) { c += p; if (r < c) return g; }
  return arr[0][0];
}

export function floorLootGrade(floor) {
  if (floor <= 10) return weightedGrade([['F', 0.6], ['E', 0.2], ['D', 0.12], ['C', 0.06], ['B', 0.015], ['A', 0.004], ['S', 0.001]]);
  if (floor <= 25) return weightedGrade([['E', 0.55], ['D', 0.2], ['C', 0.15], ['B', 0.07], ['A', 0.025], ['S', 0.005]]);
  if (floor <= 35) return weightedGrade([['D', 0.55], ['C', 0.22], ['B', 0.14], ['A', 0.07], ['S', 0.02]]);
  if (floor <= 50) return weightedGrade([['C', 0.5], ['B', 0.27], ['A', 0.17], ['S', 0.06]]);
  if (floor <= 70) return weightedGrade([['B', 0.55], ['A', 0.32], ['S', 0.13]]);
  if (floor <= 90) return weightedGrade([['A', 0.7], ['S', 0.3]]);
  return 'S';
}

export function rollItemOfGrade(grade) {
  const pool = Object.entries(ITEMS).filter(([k, v]) => v.g === grade && v.e !== 'kill');
  if (!pool.length) return null;
  return pick(pool)[0];
}

export function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}