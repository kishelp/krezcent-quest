// ============================================================================
// KREZCENT QUEST — ARMOR SYSTEM (rebuilt for Update 15)
// ============================================================================
// Armor grants PERCENT damage reduction (still capped) plus, for the newer
// pieces, UNIQUE PASSIVE EFFECTS that trigger from gameplay (Bloodforge,
// Phoenixbone, Stormbound, etc — see `effect` field). Update 15 also rebalanced
// the rarity curve: best armors are MUCH rarer, common armors more common, and
// every piece had its damage reduction buffed across the board.
//
// Reduction at level L = baseReduce + (L-1) * perLevel, capped at `cap`.
//   - Lightest armor L1  ~ 5%   (slight)
//   - Heaviest armor L10 ~ 60%  (transformative late-game)
// Heavier armor reduces more but slows the player (moveMod), giving a real
// trade-off between mobility and protection.
//
// Fields:
//   n           display name
//   type        'light' | 'medium' | 'heavy'
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
//   effect      passive effect key (handled in main.jsx). null = none
//   desc        short flavor + mechanical description
// ============================================================================

export const MAX_ARMOR_LEVEL = 10;

export const ARMORS = {
  // ============================================================================
  // LIGHT (mobility-focused, no/low move penalty) — COMMON DROPS
  // ============================================================================
  cloth_garb: {
    n: 'Cloth Garb', type: 'light',
    baseReduce: 0.05, perLevel: 0.018, cap: 0.22, moveMod: 1.0,
    color: '#a1887f', price: 180, upCost: 110, tier: 1, dropWeight: 12, dropMin: 1,
    effect: null,
    desc: 'Simple cloth. A little protection, full mobility.',
  },
  leather_vest: {
    n: 'Leather Vest', type: 'light',
    baseReduce: 0.08, perLevel: 0.022, cap: 0.28, moveMod: 1.0,
    color: '#8d6e63', price: 520, upCost: 280, tier: 1, dropWeight: 10, dropMin: 3,
    effect: null,
    desc: 'Supple leather. Light and quick.',
  },
  ranger_coat: {
    n: 'Ranger\u2019s Coat', type: 'light',
    baseReduce: 0.10, perLevel: 0.024, cap: 0.32, moveMod: 1.02,
    color: '#558b2f', price: 1500, upCost: 800, tier: 2, dropWeight: 8, dropMin: 12,
    effect: null,
    desc: 'Woven coat that even quickens your step a touch.',
  },
  thornroot_carapace: {
    // 5. Thornroot Carapace — retaliates with thorns when struck.
    n: 'Thornroot Carapace', type: 'light',
    baseReduce: 0.12, perLevel: 0.025, cap: 0.36, moveMod: 1.0,
    color: '#6d4c41', price: 4200, upCost: 2200, tier: 3, dropWeight: 5, dropMin: 22,
    effect: 'thornroot',
    desc: 'Grown from magical roots. When struck, launches enchanted thorns at attackers.',
  },
  phaseweave: {
    // 1. Phaseweave Armor — chance to phase through hits.
    n: 'Phaseweave Armor', type: 'light',
    baseReduce: 0.14, perLevel: 0.026, cap: 0.40, moveMod: 1.05,
    color: '#7e57c2', price: 14000, upCost: 7800, tier: 4, dropWeight: 3, dropMin: 38,
    effect: 'phaseweave',
    desc: 'Unstable dimensional threads. Attacks occasionally pass harmlessly through (15% phase chance).',
  },
  gravity_ward: {
    // 13. Gravity Ward Armor — slows nearby enemies.
    n: 'Gravity Ward Armor', type: 'light',
    baseReduce: 0.16, perLevel: 0.028, cap: 0.44, moveMod: 1.04,
    color: '#311b92', price: 28000, upCost: 15000, tier: 4, dropWeight: 2, dropMin: 52,
    effect: 'gravity_ward',
    desc: 'Bends gravity. Slows nearby enemies and reduces heavy attack damage by 20%.',
  },
  celestial_mantle: {
    // 11. Celestial Mantle — orbiting fragments intercept projectiles.
    n: 'Celestial Mantle', type: 'light',
    baseReduce: 0.18, perLevel: 0.030, cap: 0.48, moveMod: 1.06,
    color: '#80deea', price: 65000, upCost: 35000, tier: 5, dropWeight: 1, dropMin: 70,
    effect: 'celestial_mantle',
    desc: 'Star fragments orbit you, intercepting projectiles. They can be flung as attacks.',
  },

  // ============================================================================
  // MEDIUM (balanced reduction, small move penalty)
  // ============================================================================
  chain_mail: {
    n: 'Chain Mail', type: 'medium',
    baseReduce: 0.13, perLevel: 0.028, cap: 0.40, moveMod: 0.97,
    color: '#90a4ae', price: 3600, upCost: 2000, tier: 2, dropWeight: 6, dropMin: 18,
    effect: null,
    desc: 'Interlocking rings. A solid all-rounder.',
  },
  scale_armor: {
    n: 'Scale Armor', type: 'medium',
    baseReduce: 0.16, perLevel: 0.030, cap: 0.44, moveMod: 0.96,
    color: '#607d8b', price: 8800, upCost: 4800, tier: 3, dropWeight: 5, dropMin: 30,
    effect: null,
    desc: 'Overlapping scales turn aside heavier blows.',
  },
  echosteel: {
    // 3. Echosteel Armor — stores damage, releases as shockwave.
    n: 'Echosteel Armor', type: 'medium',
    baseReduce: 0.18, perLevel: 0.031, cap: 0.46, moveMod: 0.96,
    color: '#b0bec5', price: 18000, upCost: 9500, tier: 3, dropWeight: 4, dropMin: 35,
    effect: 'echosteel',
    desc: 'Records damage you take. Every 200 damage absorbed, releases a shockwave.',
  },
  rune_plate: {
    n: 'Rune Plate', type: 'medium',
    baseReduce: 0.20, perLevel: 0.032, cap: 0.48, moveMod: 0.95,
    color: '#5c6bc0', price: 22000, upCost: 12000, tier: 3, dropWeight: 4, dropMin: 45,
    effect: null,
    desc: 'Etched with warding runes; light for its strength.',
  },
  solar_prism: {
    // 4. Solar Prism Mail — heals + blinds enemies.
    n: 'Solar Prism Mail', type: 'medium',
    baseReduce: 0.22, perLevel: 0.033, cap: 0.50, moveMod: 0.96,
    color: '#fdd835', price: 36000, upCost: 18500, tier: 4, dropWeight: 3, dropMin: 50,
    effect: 'solar_prism',
    desc: 'Absorbs light. When fully charged, incoming hits heal 20% and blind nearby enemies.',
  },
  stormbound: {
    // 8. Stormbound Harness — chain lightning while moving.
    n: 'Stormbound Harness', type: 'medium',
    baseReduce: 0.23, perLevel: 0.033, cap: 0.52, moveMod: 0.97,
    color: '#fff176', price: 48000, upCost: 26000, tier: 4, dropWeight: 3, dropMin: 56,
    effect: 'stormbound',
    desc: 'Generates electrical charge as you move. Discharges chain lightning when full.',
  },
  mirrorglass: {
    // 9. Mirrorglass Armor — reflects spells back.
    n: 'Mirrorglass Armor', type: 'medium',
    baseReduce: 0.24, perLevel: 0.034, cap: 0.53, moveMod: 0.97,
    color: '#80deea', price: 70000, upCost: 38000, tier: 4, dropWeight: 2, dropMin: 62,
    effect: 'mirrorglass',
    desc: 'Crystal shell. 35% chance to reflect magical projectiles back at their caster.',
  },
  frostheart: {
    // 10. Frostheart Plate — freezing nova at full charge.
    n: 'Frostheart Plate', type: 'medium',
    baseReduce: 0.25, perLevel: 0.034, cap: 0.55, moveMod: 0.95,
    color: '#80deea', price: 95000, upCost: 50000, tier: 5, dropWeight: 2, dropMin: 70,
    effect: 'frostheart',
    desc: 'Frozen core stores damage. Releases freezing explosion every 300 damage absorbed.',
  },
  runesmith_exo: {
    // 14. Runesmith Exoskeleton — adapts to enemies (small permanent stat gains).
    n: 'Runesmith Exoskeleton', type: 'medium',
    baseReduce: 0.27, perLevel: 0.035, cap: 0.58, moveMod: 0.97,
    color: '#5c6bc0', price: 140000, upCost: 72000, tier: 5, dropWeight: 1, dropMin: 78,
    effect: 'runesmith',
    desc: 'Empty rune sockets fill from enemies. +0.5% damage per 25 enemies defeated (caps 25%).',
  },

  // ============================================================================
  // HEAVY (high reduction, real move penalty) — RAREST DROPS
  // ============================================================================
  iron_plate: {
    n: 'Iron Plate', type: 'heavy',
    baseReduce: 0.20, perLevel: 0.030, cap: 0.50, moveMod: 0.90,
    color: '#78909c', price: 42000, upCost: 22000, tier: 4, dropWeight: 4, dropMin: 35,
    effect: null,
    desc: 'Full iron plate. Heavy, but it holds.',
  },
  bloodforge: {
    // 2. Bloodforge Plate — stronger as HP drops.
    n: 'Bloodforge Plate', type: 'heavy',
    baseReduce: 0.22, perLevel: 0.032, cap: 0.52, moveMod: 0.90,
    color: '#b71c1c', price: 65000, upCost: 34000, tier: 4, dropWeight: 3, dropMin: 45,
    effect: 'bloodforge',
    desc: 'Feeds on pain. +1% damage and reduction per 5% missing HP (caps at +20% each).',
  },
  dragon_scale: {
    n: 'Dragonscale', type: 'heavy',
    baseReduce: 0.24, perLevel: 0.033, cap: 0.56, moveMod: 0.91,
    color: '#c62828', price: 92000, upCost: 48000, tier: 4, dropWeight: 3, dropMin: 55,
    effect: null,
    desc: 'Scales of a fallen wyrm. Resists even dragonfire.',
  },
  abyssal_shell: {
    // 7. Abyssal Shell — tougher as HP drops.
    n: 'Abyssal Shell', type: 'heavy',
    baseReduce: 0.26, perLevel: 0.034, cap: 0.58, moveMod: 0.89,
    color: '#1a237e', price: 130000, upCost: 68000, tier: 5, dropWeight: 2, dropMin: 65,
    effect: 'abyssal',
    desc: 'Void-forged shell. Below 30% HP, reduction surges to maximum (+25% bonus).',
  },
  parasite_husk: {
    // 12. Parasite Husk — kills grant temporary buffs.
    n: 'Parasite Husk', type: 'heavy',
    baseReduce: 0.28, perLevel: 0.034, cap: 0.60, moveMod: 0.90,
    color: '#388e3c', price: 175000, upCost: 90000, tier: 5, dropWeight: 2, dropMin: 72,
    effect: 'parasite',
    desc: 'Absorbs essence. Each kill: +2% damage and speed for 6s (stacks up to 10).',
  },
  aegis_bulwark: {
    n: 'Aegis Bulwark', type: 'heavy',
    baseReduce: 0.30, perLevel: 0.035, cap: 0.62, moveMod: 0.88,
    color: '#ffb300', price: 220000, upCost: 120000, tier: 5, dropWeight: 1, dropMin: 80,
    effect: null,
    desc: 'A wall you can wear. The pinnacle of mundane defense.',
  },
  chronolock: {
    // 6. Chronolock Armor — revives you to a recent state on fatal damage.
    n: 'Chronolock Armor', type: 'heavy',
    baseReduce: 0.32, perLevel: 0.036, cap: 0.64, moveMod: 0.92,
    color: '#fdd835', price: 320000, upCost: 165000, tier: 6, dropWeight: 1, dropMin: 85,
    effect: 'chronolock',
    desc: 'Records your state every 4s. On fatal damage, rewinds time and restores you (cd 120s).',
  },
  phoenixbone: {
    // 15. Phoenixbone Armor — one revive per floor + fire nova.
    n: 'Phoenixbone Armor', type: 'heavy',
    baseReduce: 0.34, perLevel: 0.037, cap: 0.66, moveMod: 0.90,
    color: '#ff7043', price: 480000, upCost: 250000, tier: 6, dropWeight: 1, dropMin: 92,
    effect: 'phoenixbone',
    desc: 'When defeated, erupts in flame damaging foes and reviving you with full HP (once per floor).',
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

// Armor that can drop as loot.
export const DROPPABLE_ARMORS = Object.keys(ARMORS).filter(k => (ARMORS[k].dropWeight || 0) > 0);

// Convenience: does an armor have a unique passive effect?
export function armorEffect(key) {
  const a = ARMORS[key];
  return a ? (a.effect || null) : null;
}