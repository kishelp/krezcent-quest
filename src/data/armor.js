// ============================================================================
// KREZCENT QUEST — ARMOR SYSTEM (Update 9)
// ============================================================================
// Armor mirrors weapons: pick a type, upgrade it 1..10 at the Blacksmith.
// Armor grants PERCENT damage reduction (capped low so the player must still
// dodge — the game is offensively strong, so armor only "helps slightly").
//
// Reduction at level L = baseReduce + (L-1) * perLevel, capped at `cap`.
//   - Lightest armor L1  ~ 3%   (barely-there)
//   - Heaviest armor L10 ~ 40%  (meaningful but never trivializing)
// Heavier armor reduces more but also slows the player slightly (moveMod),
// giving a real trade-off between mobility and protection.
//
// Fields:
//   n        display name
//   type     'light' | 'medium' | 'heavy'
//   baseReduce  L1 damage reduction (fraction)
//   perLevel    reduction added per level
//   cap         hard cap on reduction (fraction)
//   moveMod     movement multiplier while equipped (1 = no penalty)
//   color       render/UI accent
//   price       blacksmith buy price (L1)
//   upCost      cost to go L1->L2 (scales per level)
//   tier        power tier (loot gating)
//   dropWeight  relative loot weight (0 = never drops)
//   dropMin     minimum floor for it to appear in loot
// ============================================================================

export const MAX_ARMOR_LEVEL = 10;

export const ARMORS = {
  // ---------------- LIGHT (low reduction, no move penalty) ----------------
  cloth_garb: {
    n: 'Cloth Garb', type: 'light', baseReduce: 0.03, perLevel: 0.012, cap: 0.16, moveMod: 1.0,
    color: '#a1887f', price: 120, upCost: 80, tier: 1, dropWeight: 6, dropMin: 1,
    desc: 'Simple cloth. A little protection, full mobility.',
  },
  leather_vest: {
    n: 'Leather Vest', type: 'light', baseReduce: 0.05, perLevel: 0.015, cap: 0.20, moveMod: 1.0,
    color: '#8d6e63', price: 380, upCost: 220, tier: 1, dropWeight: 5, dropMin: 3,
    desc: 'Supple leather. Light and quick.',
  },
  ranger_coat: {
    n: 'Ranger\u2019s Coat', type: 'light', baseReduce: 0.07, perLevel: 0.017, cap: 0.24, moveMod: 1.02,
    color: '#558b2f', price: 1100, upCost: 600, tier: 2, dropWeight: 4, dropMin: 12,
    desc: 'Woven coat that even quickens your step a touch.',
  },
  // ---------------- MEDIUM (balanced) ----------------
  chain_mail: {
    n: 'Chain Mail', type: 'medium', baseReduce: 0.09, perLevel: 0.020, cap: 0.30, moveMod: 0.97,
    color: '#90a4ae', price: 2600, upCost: 1500, tier: 2, dropWeight: 4, dropMin: 18,
    desc: 'Interlocking rings. A solid all-rounder.',
  },
  scale_armor: {
    n: 'Scale Armor', type: 'medium', baseReduce: 0.11, perLevel: 0.022, cap: 0.33, moveMod: 0.96,
    color: '#607d8b', price: 6000, upCost: 3400, tier: 3, dropWeight: 3, dropMin: 30,
    desc: 'Overlapping scales turn aside heavier blows.',
  },
  rune_plate: {
    n: 'Rune Plate', type: 'medium', baseReduce: 0.13, perLevel: 0.024, cap: 0.36, moveMod: 0.95,
    color: '#5c6bc0', price: 14000, upCost: 8000, tier: 3, dropWeight: 2, dropMin: 45,
    desc: 'Etched with warding runes; light for its strength.',
  },
  // ---------------- HEAVY (high reduction, move penalty) ----------------
  iron_plate: {
    n: 'Iron Plate', type: 'heavy', baseReduce: 0.15, perLevel: 0.024, cap: 0.38, moveMod: 0.90,
    color: '#78909c', price: 30000, upCost: 17000, tier: 4, dropWeight: 2, dropMin: 55,
    desc: 'Full iron plate. Heavy, but it holds.',
  },
  dragon_scale: {
    n: 'Dragonscale', type: 'heavy', baseReduce: 0.17, perLevel: 0.025, cap: 0.40, moveMod: 0.91,
    color: '#c62828', price: 70000, upCost: 38000, tier: 4, dropWeight: 1, dropMin: 70,
    desc: 'Scales of a fallen wyrm. Resists even dragonfire.',
  },
  aegis_bulwark: {
    n: 'Aegis Bulwark', type: 'heavy', baseReduce: 0.18, perLevel: 0.026, cap: 0.42, moveMod: 0.89,
    color: '#ffb300', price: 160000, upCost: 90000, tier: 5, dropWeight: 1, dropMin: 85,
    desc: 'The pinnacle of defense — a wall you can wear.',
  },
};

// Damage reduction fraction for an armor at a given level.
export function armorReductionAt(key, level) {
  const a = ARMORS[key];
  if (!a) return 0;
  const lv = Math.max(1, Math.min(MAX_ARMOR_LEVEL, level || 1));
  return Math.min(a.cap, a.baseReduce + (lv - 1) * a.perLevel);
}

// Movement multiplier from equipped armor (heavy armor slows you slightly).
export function armorMoveMod(key) {
  const a = ARMORS[key];
  return a ? (a.moveMod != null ? a.moveMod : 1) : 1;
}

// Cost to upgrade from `level` to `level+1`. null if maxed.
export function armorUpgradeCost(key, level) {
  const a = ARMORS[key];
  if (!a) return null;
  const lv = level || 1;
  if (lv >= MAX_ARMOR_LEVEL) return null;
  return Math.round((a.upCost || 200) * Math.pow(1.7, lv - 1));
}

// Armor sold in the blacksmith.
export const ARMOR_SHOP = Object.keys(ARMORS).map(k => ({ key: k, price: ARMORS[k].price }));

// Armor that can drop as loot (rarely).
export const DROPPABLE_ARMORS = Object.keys(ARMORS).filter(k => (ARMORS[k].dropWeight || 0) > 0);