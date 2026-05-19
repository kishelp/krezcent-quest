export const WEAPONS = {
  sword:        { n: 'Sword',         dmg: 28, spd: 1.0,  range: 55,  arc: 90,  style: 'Balanced',                look: 'sword' },
  knife:        { n: 'Knife',         dmg: 15, spd: 2.0,  range: 35,  arc: 70,  style: 'Fast & cheap',            look: 'knife' },
  bow:          { n: 'Bow',           dmg: 22, spd: 0.9,  range: 350, arc: 0,   ranged: true, style: 'Ranged',     look: 'bow' },
  spike_shield: { n: 'Spike Shield',  dmg: 18, spd: 0.7,  range: 45,  arc: 60,  defense: 0.3, style: 'Defensive (-30% dmg taken)', look: 'shield' },
  spear:        { n: 'Spear',         dmg: 26, spd: 0.85, range: 90,  arc: 45,  style: 'Long thrust',             look: 'spear' },
  katana:       { n: 'Katana',        dmg: 32, spd: 1.25, range: 60,  arc: 100, crit: 0.2, style: 'High crit',     look: 'katana' },
  knuckles:     { n: 'Knuckles',      dmg: 14, spd: 2.4,  range: 30,  arc: 80,  style: 'Very fast',               look: 'knuckles' },
  dual_swords:  { n: 'Dual Swords',   dmg: 20, spd: 1.7,  range: 55,  arc: 100, multi: 2, style: 'Two hits per swing', look: 'dual' },
  axe:          { n: 'Axe',           dmg: 42, spd: 0.7,  range: 60,  arc: 110, style: 'Heavy, wide',             look: 'axe' },
  morning_star: { n: 'Morning Star',  dmg: 38, spd: 0.75, range: 65,  arc: 120, stun: 0.15, style: 'May stun',    look: 'morningstar' },
  scythe:       { n: 'Scythe',        dmg: 36, spd: 0.85, range: 75,  arc: 140, lifesteal: 0.1, style: 'Lifesteal 10%', look: 'scythe' },
  chain:        { n: 'Chain',         dmg: 24, spd: 1.1,  range: 110, arc: 30,  style: 'Long, narrow',            look: 'chain' },
  crossbow:     { n: 'Crossbow',      dmg: 34, spd: 0.7,  range: 320, arc: 0,   ranged: true, pierce: true, style: 'Ranged, pierces', look: 'crossbow' },
  staff:        { n: 'Staff',         dmg: 18, spd: 1.1,  range: 60,  arc: 80,  manaBoost: 0.25, style: 'Affinity dmg +25%', look: 'staff' },
  whip:         { n: 'Whip',          dmg: 22, spd: 1.3,  range: 95,  arc: 30,  style: 'Long, fast',              look: 'whip' },
  war_hammer:   { n: 'War Hammer',    dmg: 50, spd: 0.55, range: 55,  arc: 100, stun: 0.25, style: 'Heavy, may stun', look: 'hammer' },
};

export const STARTER_WEAPONS = ['sword', 'knife', 'bow', 'spike_shield'];