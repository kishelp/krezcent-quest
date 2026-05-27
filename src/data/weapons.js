// ============================================================================
// KREZCENT QUEST — WEAPONS (Update 5)
// ============================================================================
// Every weapon has a UNIQUE mechanic (`mech`) beyond range/damage.
// main.jsx reads these fields. Schema:
//   n        display name
//   dmg      base damage
//   spd      attacks per ~600ms unit (higher = faster)
//   range    melee reach OR projectile travel distance
//   arc      melee swing arc in degrees (0 for pure ranged)
//   ranged   true = fires a projectile on attack
//   multi    extra simultaneous hits (melee) / projectiles (ranged)
//   crit     crit chance 0..1
//   stun     stun chance 0..1
//   lifesteal fraction of damage healed
//   pierce   ranged projectile passes through enemies
//   defense  fraction of incoming damage reduced while equipped
//   manaBoost affinity damage multiplier bonus
//   look     graphic key for drawWeapon() in main.jsx
//   swing    melee animation style: slash | thrust | chop | spin | poke | jab | none
//   proj     ranged projectile design: arrow | bolt | knife | stone | shuriken |
//            chakram | boomerang | dart | boulder | pellet | magic_arrow |
//            ballista_bolt | trident | wave  (null for melee)
//   mech     UNIQUE mechanic key — main.jsx switches on this
//   mechVal  numeric parameter for the mechanic
//   mdesc    short human description of the unique mechanic
//   tier     1..5 power tier (used for sorting / drop rarity)
//   price    shop cost in coins (0 = not normally sold; see shopBuy)
//   shopBuy  true = purchasable in the weapon shop
//   dropWeight relative chance to drop naturally in the dungeon (higher = more common)
//   dropMin  minimum dungeon floor before this can drop
//   style    one-line flavor for menus
// ============================================================================

export const WEAPONS = {
  // ----- STARTERS (stats LOCKED; only graphics/animation/mechanic flavor are new) -----
  sword: {
    n: 'Sword', dmg: 25, baseDmg: 25, lvlGrowth: 1.5874, upCost: 416, dmgMax: 1600, spd: 1.0, range: 55, arc: 90,
    look: 'sword', swing: 'slash', proj: null,
    mech: 'cleave', mechVal: 0.15,
    mdesc: 'Cleave: +15% damage when 2+ enemies are in the swing.',
    tier: 1, price: 150, shopBuy: true, dropWeight: 0, dropMin: 1,
    style: 'Balanced blade. Cleaves crowds.',
  },
  knife: {
    n: 'Knife', dmg: 37.5, baseDmg: 37.5, lvlGrowth: 1.5874, upCost: 747, dmgMax: 2400, spd: 2.0, range: 35, arc: 70,
    look: 'knife', swing: 'jab', proj: null,
    mech: 'bleed', mechVal: 4,
    mdesc: 'Bleed: each hit stacks a bleed dealing 4 dmg/sec for 3s.',
    tier: 1, price: 100, shopBuy: true, dropWeight: 0, dropMin: 1,
    style: 'Fast & cheap. Stacks bleed.',
  },
  bow: {
    n: 'Bow', dmg: 7.5, baseDmg: 7.5, lvlGrowth: 1.5874, upCost: 72, dmgMax: 480, spd: 0.9, range: 350, arc: 0, ranged: true,
    look: 'bow', swing: 'none', proj: 'arrow',
    mech: 'longshot', mechVal: 0.5,
    mdesc: 'Longshot: arrows deal up to +50% damage the farther they fly.',
    tier: 1, price: 250, shopBuy: true, dropWeight: 0, dropMin: 1,
    style: 'Ranged. Rewards distance.',
  },
  spike_shield: {
    n: 'Spike Shield', dmg: 5, baseDmg: 5, lvlGrowth: 1.5874, upCost: 40, dmgMax: 320, spd: 0.7, range: 45, arc: 60, defense: 0.3,
    look: 'shield', swing: 'thrust', proj: null,
    mech: 'thorns', mechVal: 0.4,
    mdesc: 'Thorns: reflects 40% of melee damage taken back at attackers.',
    tier: 1, price: 200, shopBuy: true, dropWeight: 0, dropMin: 1,
    style: 'Defensive (-30% dmg taken). Reflects.',
  },

  // ----- EXISTING MELEE (reworked: each gets a real unique mechanic) -----
  spear: {
    n: 'Spear', dmg: 16.7, baseDmg: 16.7, lvlGrowth: 1.5874, upCost: 232, dmgMax: 1069, spd: 0.85, range: 95, arc: 45,
    look: 'spear', swing: 'thrust', proj: null,
    mech: 'knockback', mechVal: 60,
    mdesc: 'Knockback: long thrust shoves enemies 60px back.',
    tier: 2, price: 600, shopBuy: true, dropWeight: 16, dropMin: 3,
    style: 'Long thrust that pushes enemies away.',
  },
  katana: {
    n: 'Katana', dmg: 2571.5, baseDmg: 2571.5, lvlGrowth: 1.5874, upCost: 348585, dmgMax: 164576, spd: 1.25, range: 60, arc: 100, crit: 0.2,
    look: 'katana', swing: 'slash', proj: null,
    mech: 'crit_bleed', mechVal: 8,
    mdesc: 'On a crit, applies a deep bleed (8 dmg/sec for 4s).',
    tier: 2, price: 900, shopBuy: true, dropWeight: 12, dropMin: 5,
    style: 'High crit. Crits cause heavy bleed.',
  },
  knuckles: {
    n: 'Knuckles', dmg: 187.6, baseDmg: 187.6, lvlGrowth: 1.5874, upCost: 7762, dmgMax: 12006, spd: 2.4, range: 30, arc: 80,
    look: 'knuckles', swing: 'jab', proj: null,
    mech: 'combo', mechVal: 0.08,
    mdesc: 'Combo: each rapid hit in a row adds +8% damage (resets after 1.5s).',
    tier: 2, price: 700, shopBuy: true, dropWeight: 14, dropMin: 3,
    style: 'Very fast. Builds a damage combo.',
  },
  dual_swords: {
    n: 'Dual Swords', dmg: 3846.8, baseDmg: 3846.8, lvlGrowth: 1.5874, upCost: 625919, dmgMax: 246195, spd: 1.7, range: 55, arc: 100, multi: 2,
    look: 'dual', swing: 'spin', proj: null,
    mech: 'doublestrike', mechVal: 0,
    mdesc: 'Double Strike: every swing lands twice.',
    tier: 2, price: 850, shopBuy: true, dropWeight: 12, dropMin: 5,
    style: 'Two hits per swing.',
  },
  axe: {
    n: 'Axe', dmg: 83.8, baseDmg: 83.8, lvlGrowth: 1.5874, upCost: 2407, dmgMax: 5363, spd: 0.7, range: 60, arc: 110,
    look: 'axe', swing: 'chop', proj: null,
    mech: 'armor_break', mechVal: 0,
    mdesc: 'Armor Break: ignores enemy elemental resistance entirely.',
    tier: 2, price: 1100, shopBuy: true, dropWeight: 10, dropMin: 8,
    style: 'Heavy & wide. Ignores resistances.',
  },
  morning_star: {
    n: 'Morning Star', dmg: 56, baseDmg: 56, lvlGrowth: 1.5874, upCost: 1341, dmgMax: 3584, spd: 0.75, range: 65, arc: 120, stun: 0.15,
    look: 'morningstar', swing: 'spin', proj: null,
    mech: 'stun', mechVal: 1.0,
    mdesc: 'Stun: 15% chance to stun for 1s on hit.',
    tier: 2, price: 1000, shopBuy: true, dropWeight: 10, dropMin: 8,
    style: 'Heavy. May stun.',
  },
  scythe: {
    n: 'Scythe', dmg: 280.6, baseDmg: 280.6, lvlGrowth: 1.5874, upCost: 13937, dmgMax: 17958, spd: 0.85, range: 78, arc: 140, lifesteal: 0.1,
    look: 'scythe', swing: 'slash', proj: null,
    mech: 'reap', mechVal: 0.25,
    mdesc: 'Reap: +120% damage to enemies under 25% HP. Heals 10% of damage.',
    tier: 3, price: 1800, shopBuy: true, dropWeight: 7, dropMin: 12,
    style: 'Wide. Executes the weak, lifesteals.',
  },
  chain: {
    n: 'Chain', dmg: 30.6, baseDmg: 30.6, lvlGrowth: 1.5874, upCost: 557, dmgMax: 1958, spd: 1.1, range: 115, arc: 30,
    look: 'chain', swing: 'poke', proj: null,
    mech: 'pull', mechVal: 70,
    mdesc: 'Pull: yanks the struck enemy 70px toward you.',
    tier: 2, price: 750, shopBuy: true, dropWeight: 12, dropMin: 5,
    style: 'Long & narrow. Pulls enemies in.',
  },
  crossbow: {
    n: 'Crossbow', dmg: 20.5, baseDmg: 20.5, lvlGrowth: 1.5874, upCost: 310, dmgMax: 1312, spd: 0.7, range: 320, arc: 0, ranged: true, pierce: true,
    look: 'crossbow', swing: 'none', proj: 'bolt',
    mech: 'pierce_bonus', mechVal: 0.15,
    mdesc: 'Pierce: bolts pass through; +15% damage per extra enemy pierced.',
    tier: 2, price: 1200, shopBuy: true, dropWeight: 9, dropMin: 8,
    style: 'Ranged. Pierces & ramps.',
  },
  staff: {
    n: 'Staff', dmg: 13.7, baseDmg: 13.7, lvlGrowth: 1.5874, upCost: 173, dmgMax: 877, spd: 1.1, range: 60, arc: 80, manaBoost: 0.25,
    look: 'staff', swing: 'poke', proj: null,
    mech: 'spell_echo', mechVal: 0.2,
    mdesc: 'Spell Echo: +25% affinity damage, and abilities have a 20% chance to fire twice.',
    tier: 3, price: 2000, shopBuy: true, dropWeight: 7, dropMin: 12,
    style: 'Affinity dmg +25%. Echoes spells.',
  },
  whip: {
    n: 'Whip', dmg: 68.5, baseDmg: 68.5, lvlGrowth: 1.5874, upCost: 1796, dmgMax: 4384, spd: 1.3, range: 98, arc: 30,
    look: 'whip', swing: 'slash', proj: null,
    mech: 'lash', mechVal: 0,
    mdesc: 'Lash: hits every enemy along its full length in a line.',
    tier: 2, price: 800, shopBuy: true, dropWeight: 11, dropMin: 5,
    style: 'Long & fast. Hits in a line.',
  },
  war_hammer: {
    n: 'War Hammer', dmg: 102.5, baseDmg: 102.5, lvlGrowth: 1.5874, upCost: 3226, dmgMax: 6560, spd: 0.55, range: 55, arc: 100, stun: 0.25,
    look: 'hammer', swing: 'chop', proj: null,
    mech: 'quake', mechVal: 70,
    mdesc: 'Quake: each hit sends a shockwave dealing 40% damage in a 70px radius.',
    tier: 3, price: 2200, shopBuy: true, dropWeight: 6, dropMin: 15,
    style: 'Slow & brutal. Shockwave on hit.',
  },

  // ----- NEW RANGED -----
  throwing_knives: {
    n: 'Throwing Knives', dmg: 343.2, baseDmg: 343.2, lvlGrowth: 1.5874, upCost: 18675, dmgMax: 21965, spd: 1.8, range: 260, arc: 0, ranged: true, multi: 2,
    look: 'throwing_knives', swing: 'none', proj: 'knife',
    mech: 'fan3', mechVal: 0.12,
    mdesc: 'Fan: throws 3 knives in a tight spread.',
    tier: 2, price: 650, shopBuy: true, dropWeight: 12, dropMin: 4,
    style: 'Throws a fan of 3 blades.',
  },
  slingshot: {
    n: 'Slingshot', dmg: 9.1, baseDmg: 9.1, lvlGrowth: 1.5874, upCost: 96, dmgMax: 582, spd: 1.4, range: 300, arc: 0, ranged: true,
    look: 'slingshot', swing: 'none', proj: 'stone',
    mech: 'ricochet', mechVal: 2,
    mdesc: 'Ricochet: the stone bounces off walls up to 2 times.',
    tier: 1, price: 400, shopBuy: true, dropWeight: 15, dropMin: 2,
    style: 'Cheap. Stones bounce off walls.',
  },
  boomerang: {
    n: 'Boomerang', dmg: 11.2, baseDmg: 11.2, lvlGrowth: 1.5874, upCost: 129, dmgMax: 717, spd: 1.0, range: 280, arc: 0, ranged: true,
    look: 'boomerang', swing: 'none', proj: 'boomerang',
    mech: 'return', mechVal: 0,
    mdesc: 'Return: flies out and curves back, hitting enemies both ways.',
    tier: 2, price: 900, shopBuy: true, dropWeight: 10, dropMin: 6,
    style: 'Returns to you, hitting twice.',
  },
  shuriken: {
    n: 'Shuriken', dmg: 3145.2, baseDmg: 3145.2, lvlGrowth: 1.5874, upCost: 467104, dmgMax: 201293, spd: 2.2, range: 240, arc: 0, ranged: true, multi: 4,
    look: 'shuriken', swing: 'none', proj: 'shuriken',
    mech: 'spread5', mechVal: 0.35,
    mdesc: 'Spread: hurls 5 shuriken in a wide fan.',
    tier: 2, price: 1000, shopBuy: true, dropWeight: 9, dropMin: 8,
    style: 'Wide fan of spinning stars.',
  },
  chakram: {
    n: 'Chakram', dmg: 125.4, baseDmg: 125.4, lvlGrowth: 1.5874, upCost: 4323, dmgMax: 8026, spd: 1.1, range: 300, arc: 0, ranged: true, pierce: true,
    look: 'chakram', swing: 'none', proj: 'chakram',
    mech: 'orbit_return', mechVal: 0,
    mdesc: 'Orbit: spinning ring pierces all, then returns through them again.',
    tier: 3, price: 2400, shopBuy: true, dropWeight: 6, dropMin: 14,
    style: 'Piercing ring that returns.',
  },
  blow_dart: {
    n: 'Blow Dart', dmg: 6.1, baseDmg: 6.1, lvlGrowth: 1.5874, upCost: 54, dmgMax: 390, spd: 1.6, range: 320, arc: 0, ranged: true,
    look: 'blow_dart', swing: 'none', proj: 'dart',
    mech: 'poison', mechVal: 10,
    mdesc: 'Poison: tiny hit, but injects poison for 10 dmg/sec over 5s.',
    tier: 2, price: 850, shopBuy: true, dropWeight: 10, dropMin: 6,
    style: 'Weak hit, deadly poison.',
  },
  catapult: {
    n: 'Catapult', dmg: 45.8, baseDmg: 45.8, lvlGrowth: 1.5874, upCost: 1000, dmgMax: 2931, spd: 0.45, range: 300, arc: 0, ranged: true,
    look: 'catapult', swing: 'none', proj: 'boulder',
    mech: 'explosive', mechVal: 90,
    mdesc: 'Explosive: lobs a boulder that bursts for AoE damage in a 90px radius.',
    tier: 3, price: 3200, shopBuy: true, dropWeight: 5, dropMin: 18,
    style: 'Slow. Lobs an exploding boulder.',
  },
  ballista: {
    n: 'Ballista', dmg: 1405.4, baseDmg: 1405.4, lvlGrowth: 1.5874, upCost: 144875, dmgMax: 89946, spd: 0.4, range: 420, arc: 0, ranged: true, pierce: true,
    look: 'ballista', swing: 'none', proj: 'ballista_bolt',
    mech: 'piercer', mechVal: 90,
    mdesc: 'Piercer: enormous bolt pierces everything and knocks back hard.',
    tier: 4, price: 5500, shopBuy: true, dropWeight: 3, dropMin: 25,
    style: 'Massive piercing bolt + knockback.',
  },
  hand_cannon: {
    n: 'Hand Cannon', dmg: 419.8, baseDmg: 419.8, lvlGrowth: 1.5874, upCost: 25025, dmgMax: 26867, spd: 0.8, range: 160, arc: 0, ranged: true, multi: 6,
    look: 'hand_cannon', swing: 'none', proj: 'pellet',
    mech: 'shotgun', mechVal: 0.5,
    mdesc: 'Shotgun: short-range blast of 7 pellets; devastating up close.',
    tier: 3, price: 2800, shopBuy: true, dropWeight: 6, dropMin: 16,
    style: 'Close-range scatter blast.',
  },
  magic_bow: {
    n: 'Spirit Bow', dmg: 939.5, baseDmg: 939.5, lvlGrowth: 1.5874, upCost: 80684, dmgMax: 60128, spd: 1.0, range: 380, arc: 0, ranged: true,
    look: 'magic_bow', swing: 'none', proj: 'magic_arrow',
    mech: 'homing', mechVal: 0,
    mdesc: 'Homing: ethereal arrows curve toward the nearest enemy.',
    tier: 4, price: 6000, shopBuy: true, dropWeight: 3, dropMin: 28,
    style: 'Arrows seek their target.',
  },

  // ----- HYBRID / UNIQUE COMBAT -----
  trident: {
    n: 'Trident', dmg: 1149.1, baseDmg: 1149.1, lvlGrowth: 1.5874, upCost: 108116, dmgMax: 73542, spd: 0.9, range: 90, arc: 50, ranged: false,
    look: 'trident', swing: 'thrust', proj: 'trident',
    mech: 'trident', mechVal: 1.5,
    mdesc: 'Hybrid: 1st attack is a melee thrust that can FREEZE (1.5s); 2nd attack THROWS the trident as a piercing spear.',
    tier: 4, price: 7000, shopBuy: true, dropWeight: 3, dropMin: 30,
    style: 'Melee thrust (freezes) then throw.',
  },
  magic_sword: {
    n: 'Magic Sword', dmg: 153.4, baseDmg: 153.4, lvlGrowth: 1.5874, upCost: 5792, dmgMax: 9818, spd: 1.0, range: 70, arc: 90, ranged: false,
    look: 'magic_sword', swing: 'slash', proj: 'wave',
    mech: 'mpwave', mechVal: 0.2,
    mdesc: 'MP Wave: instead of a normal swing, fires a wide magic wave costing 10% MP that deals 20% of an enemy\u2019s max HP. Low on MP = fires at greatly reduced power.',
    tier: 5, price: 18000, shopBuy: true, dropWeight: 1, dropMin: 45,
    style: 'Fires % max-HP magic waves (uses MP).',
  },
  flame_blade: {
    n: 'Flame Blade', dmg: 768.1, baseDmg: 768.1, lvlGrowth: 1.5874, upCost: 60212, dmgMax: 49158, spd: 1.1, range: 60, arc: 95,
    look: 'flame_blade', swing: 'slash', proj: null,
    mech: 'burn', mechVal: 12,
    mdesc: 'Burn: hits ignite enemies for 12 dmg/sec over 4s and leave a fire trail.',
    tier: 3, price: 3000, shopBuy: true, dropWeight: 5, dropMin: 18,
    style: 'Sets enemies ablaze.',
  },
  frost_fang: {
    n: 'Frost Fang', dmg: 513.5, baseDmg: 513.5, lvlGrowth: 1.5874, upCost: 33533, dmgMax: 32864, spd: 1.15, range: 58, arc: 90,
    look: 'frost_fang', swing: 'slash', proj: null,
    mech: 'freeze', mechVal: 1.2,
    mdesc: 'Freeze: 30% chance to freeze the target solid for 1.2s.',
    tier: 3, price: 3400, shopBuy: true, dropWeight: 5, dropMin: 20,
    style: 'Chance to freeze on hit.',
  },
  thunder_spear: {
    n: 'Thunder Spear', dmg: 2102.4, baseDmg: 2102.4, lvlGrowth: 1.5874, upCost: 260138, dmgMax: 134554, spd: 0.9, range: 95, arc: 45,
    look: 'thunder_spear', swing: 'thrust', proj: null,
    mech: 'chain_lightning', mechVal: 0.5,
    mdesc: 'Chain Lightning: each hit arcs to up to 3 nearby enemies for 50% damage.',
    tier: 4, price: 8000, shopBuy: true, dropWeight: 2, dropMin: 32,
    style: 'Lightning chains between foes.',
  },
  vampire_scythe: {
    n: 'Vampire Scythe', dmg: 1719, baseDmg: 1719, lvlGrowth: 1.5874, upCost: 194133, dmgMax: 110016, spd: 0.8, range: 80, arc: 150, lifesteal: 0.35,
    look: 'vampire_scythe', swing: 'spin', proj: null,
    mech: 'vampiric', mechVal: 0.35,
    mdesc: 'Vampiric: heals you for 35% of all damage dealt.',
    tier: 4, price: 9000, shopBuy: true, dropWeight: 2, dropMin: 35,
    style: 'Massive lifesteal scythe.',
  },
  gravity_maul: {
    n: 'Gravity Maul', dmg: 229.4, baseDmg: 229.4, lvlGrowth: 1.5874, upCost: 10400, dmgMax: 14682, spd: 0.6, range: 70, arc: 120,
    look: 'gravity_maul', swing: 'chop', proj: null,
    mech: 'gravity', mechVal: 120,
    mdesc: 'Gravity: pulls all nearby enemies toward you, then slams for bonus AoE damage.',
    tier: 4, price: 10000, shopBuy: true, dropWeight: 2, dropMin: 38,
    style: 'Pulls enemies in, then slams.',
  },
  void_edge: {
    n: 'Void Edge', dmg: 4706, baseDmg: 4706, lvlGrowth: 1.5875, upCost: 838732, dmgMax: 301200, spd: 1.0, range: 62, arc: 95,
    look: 'void_edge', swing: 'slash', proj: null,
    mech: 'execute', mechVal: 0.12,
    mdesc: 'Execute: instantly kills non-boss enemies under 12% HP; killing an enemy restores 8% of your max HP.',
    tier: 5, price: 22000, shopBuy: true, dropWeight: 1, dropMin: 50,
    style: 'Executes the weak. Heals on kill.',
  },
  storm_fan: {
    n: 'Storm Fan', dmg: 628, baseDmg: 628, lvlGrowth: 1.5874, upCost: 44934, dmgMax: 40192, spd: 1.5, range: 70, arc: 360,
    look: 'storm_fan', swing: 'spin', proj: null,
    mech: 'whirl', mechVal: 0,
    mdesc: 'Whirl: every swing spins a full 360\u00b0, hitting everything around you.',
    tier: 3, price: 3600, shopBuy: true, dropWeight: 5, dropMin: 20,
    style: 'Spins to hit all directions.',
  },
};

export const STARTER_WEAPONS = ['sword', 'knife', 'bow', 'spike_shield'];

// Convenience: every weapon key sorted by tier then price (used by shop UI).
export const WEAPON_KEYS_BY_TIER = Object.keys(WEAPONS).sort(
  (a, b) => (WEAPONS[a].tier - WEAPONS[b].tier) || (WEAPONS[a].price - WEAPONS[b].price)
);

// Pool of weapons eligible to drop in the dungeon (dropWeight > 0).
// main.jsx uses dropWeight (relative) + dropMin (min floor) to roll drops.
export const DROPPABLE_WEAPONS = Object.keys(WEAPONS).filter(k => WEAPONS[k].dropWeight > 0);
// ============================================================================
// WEAPON UPGRADE SYSTEM (Update 8)
// Every weapon levels 1..10. Damage at level L = baseDmg * lvlGrowth^(L-1).
// At L10 a weapon is 64x its L1 damage. Weapons are individually balanced so
// the weakest at L1 (5 dmg) takes ~200 hits to fell the floor-1 boss, and the
// strongest at L10 (~301k dmg) fells the floor-100 boss in ~5 hits.
// ============================================================================
export const MAX_WEAPON_LEVEL = 10;

export function weaponDamageAt(key, level) {
  const wp = WEAPONS[key];
  if (!wp) return 0;
  const lv = Math.max(1, Math.min(MAX_WEAPON_LEVEL, level || 1));
  const base = wp.baseDmg != null ? wp.baseDmg : wp.dmg;
  const growth = wp.lvlGrowth || 1.5874;
  return base * Math.pow(growth, lv - 1);
}

// Cost in coins to go from `level` to `level+1`. Returns null if already max.
export function weaponUpgradeCost(key, level) {
  const wp = WEAPONS[key];
  if (!wp) return null;
  const lv = level || 1;
  if (lv >= MAX_WEAPON_LEVEL) return null;
  const costBase = wp.upCost || 100;
  // Each successive level costs ~1.7x more than the last.
  return Math.round(costBase * Math.pow(1.7, lv - 1));
}

// Total coins to take a weapon from its current level to max (for UI display).
export function weaponMaxOutCost(key, level) {
  let total = 0;
  for (let l = level || 1; l < MAX_WEAPON_LEVEL; l++) total += weaponUpgradeCost(key, l) || 0;
  return total;
}