// Three new shop systems:
// - MYSTERY_BOXES: spinning loot boxes with grade-weighted rewards
// - ATTRIBUTE_TRAINER: pay coins to learn a new attribute (up to 10 total)
// - WEAPON_SHOP: list of weapons you can buy outright at the blacksmith

import { WEAPONS } from './weapons.js';

// ---------- MYSTERY BOXES ----------
// 5 tiers, escalating price and reward grade weight.
// Each box rolls (1) an item grade by weight, then a random item of that grade
// is granted (see helpers.js -> rollItemOfGrade).
// Higher tiers can ALSO drop weapons from a per-tier weapon pool.
//
// Weight tables: probability sums to 1.
export const MYSTERY_BOXES = {
  wooden: {
    n: 'Wooden Box',
    desc: 'Bronze-tier loot. A budget gamble for early adventurers.',
    price: 5000,
    color: '#8d6e63',
    itemGrades: [
      ['F', 0.30], ['E', 0.30], ['D', 0.20], ['C', 0.15], ['B', 0.05],
    ],
    weaponPool: [],   // no weapons in this tier
    weaponChance: 0,
  },
  iron: {
    n: 'Iron Box',
    desc: 'Mid-game loot. Reliable potions and occasional treasures.',
    price: 15000,
    color: '#9e9e9e',
    itemGrades: [
      ['E', 0.20], ['D', 0.30], ['C', 0.30], ['B', 0.15], ['A', 0.05],
    ],
    weaponPool: ['knife', 'spear', 'whip', 'knuckles'],
    weaponChance: 0.05,
  },
  silver: {
    n: 'Silver Box',
    desc: 'High-tier consumables and a chance at mid-grade weapons.',
    price: 50000,
    color: '#bdbdbd',
    itemGrades: [
      ['D', 0.20], ['C', 0.30], ['B', 0.30], ['A', 0.15], ['S', 0.05],
    ],
    weaponPool: ['katana', 'axe', 'chain', 'dual_swords', 'morning_star'],
    weaponChance: 0.10,
  },
  gold: {
    n: 'Gold Box',
    desc: 'Endgame loot. Heavy chance at A and S items.',
    price: 150000,
    color: '#fbc02d',
    itemGrades: [
      ['C', 0.15], ['B', 0.30], ['A', 0.40], ['S', 0.15],
    ],
    weaponPool: ['katana', 'scythe', 'crossbow', 'staff', 'morning_star'],
    weaponChance: 0.18,
  },
  celestial: {
    n: 'Celestial Box',
    desc: 'For champions. S-tier items and rare weapons guaranteed often.',
    price: 500000,
    color: '#ce93d8',
    itemGrades: [
      ['A', 0.40], ['S', 0.60],
    ],
    weaponPool: ['war_hammer', 'scythe', 'crossbow', 'staff', 'katana'],
    weaponChance: 0.30,
  },
};

export function rollMysteryBoxGrade(box) {
  const r = Math.random();
  let c = 0;
  for (const [g, p] of box.itemGrades) { c += p; if (r < c) return g; }
  return box.itemGrades[box.itemGrades.length - 1][0];
}

export function rollMysteryBoxWeapon(box) {
  if (!box.weaponPool.length) return null;
  if (Math.random() > box.weaponChance) return null;
  return box.weaponPool[Math.floor(Math.random() * box.weaponPool.length)];
}

// ---------- ATTRIBUTE TRAINER ----------
// Pay coins for a random attribute of a chosen grade. Stops at 10 total attributes.
// Prices climb with grade — buying an S attribute should be a major investment.
export const ATTRIBUTE_TRAINER = {
  F: { price: 500,    label: 'F-grade Training' },
  E: { price: 2000,   label: 'E-grade Training' },
  D: { price: 8000,   label: 'D-grade Training' },
  C: { price: 25000,  label: 'C-grade Training' },
  B: { price: 75000,  label: 'B-grade Training' },
  A: { price: 200000, label: 'A-grade Training' },
  S: { price: 750000, label: 'S-grade Training' },
};

// ---------- WEAPON SHOP (BLACKSMITH) ----------
// Every weapon flagged `shopBuy` is stocked here, priced from its own `price`
// field and sorted by tier then price (cheapest first).
export const WEAPON_SHOP = Object.keys(WEAPONS)
  .filter(k => WEAPONS[k].shopBuy)
  .sort((a, b) => (WEAPONS[a].tier - WEAPONS[b].tier) || (WEAPONS[a].price - WEAPONS[b].price))
  .map(k => ({ key: k, price: WEAPONS[k].price }));

// Returns true if the weapon key is a real entry in WEAPONS.
export function isValidWeaponKey(k) { return !!WEAPONS[k]; }