const rand = () => Math.random();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// Each monster has:
//   n: name, color, hp, dmg, spd, aff (affinity), exp
//   shape: visual style ('slime', 'bat', 'humanoid', 'wolf', 'orb', 'spider', 'wraith', 'eye', 'golem', 'imp', 'serpent', 'crab')
//   ranged: shoots projectiles instead of melee (default false)
//   wallphase: can walk through walls (default false — most cannot)
//   attack: special effect on hit { kind, ...payload }
//     kinds: 'normal', 'freeze' (slow), 'burn' (dot), 'poison' (dot), 'blind' (player can't see far),
//            'shock' (stun), 'drain' (heals self), 'knockback' (push player), 'curse' (lower mana regen)

export const MONSTER_TYPES = {
  slime:        { n: 'Slime',         color: '#8bc34a', hp: 60,  dmg: 8,  spd: 0.5, exp: 15,  shape: 'slime',    attack: { kind: 'normal' } },
  goblin:       { n: 'Goblin',        color: '#558b2f', hp: 80,  dmg: 14, spd: 0.7, aff: 'Earth', exp: 22, shape: 'humanoid', attack: { kind: 'normal' } },
  bat:          { n: 'Cave Bat',      color: '#5d4037', hp: 50,  dmg: 10, spd: 1.1, aff: 'Air', exp: 18, shape: 'bat',
                  attack: { kind: 'normal' } },
  spider:       { n: 'Web Spider',    color: '#6a1b9a', hp: 70,  dmg: 12, spd: 0.9, aff: 'Earth', exp: 25, shape: 'spider',
                  attack: { kind: 'poison', dps: 5, dur: 4 } },
  flame_imp:    { n: 'Flame Imp',     color: '#ff5722', hp: 100, dmg: 18, spd: 0.9, aff: 'Fire', ranged: true, exp: 35, shape: 'imp',
                  attack: { kind: 'burn', dps: 8, dur: 3 } },
  ice_wolf:     { n: 'Ice Wolf',      color: '#80deea', hp: 130, dmg: 22, spd: 1.0, aff: 'Ice', exp: 50, shape: 'wolf',
                  attack: { kind: 'freeze', slow: 0.55, dur: 2.5 } },
  poison_toad:  { n: 'Poison Toad',   color: '#9ccc65', hp: 110, dmg: 16, spd: 0.6, aff: 'Poison Gas', ranged: true, exp: 40, shape: 'orb',
                  attack: { kind: 'poison', dps: 9, dur: 5 } },
  golem:        { n: 'Stone Golem',   color: '#9e9e9e', hp: 250, dmg: 30, spd: 0.4, aff: 'Earth', exp: 80, shape: 'golem',
                  attack: { kind: 'knockback', force: 180 } },
  shade:        { n: 'Shade',         color: '#311b92', hp: 180, dmg: 28, spd: 1.1, aff: 'Darkness', exp: 100, shape: 'wraith',
                  attack: { kind: 'curse', manaPenalty: 0.5, dur: 4 } },
  thunder_serpent: { n: 'Thunder Serpent', color: '#fff176', hp: 200, dmg: 32, spd: 0.95, aff: 'Lightning', ranged: true, exp: 110, shape: 'serpent',
                  attack: { kind: 'shock', stun: 0.6 } },
  lava_beast:   { n: 'Lava Beast',    color: '#d84315', hp: 320, dmg: 38, spd: 0.7, aff: 'Lava', exp: 150, shape: 'golem',
                  attack: { kind: 'burn', dps: 14, dur: 4 } },
  storm_wraith: { n: 'Storm Wraith',  color: '#fff59d', hp: 280, dmg: 42, spd: 1.2, aff: 'Lightning', ranged: true, exp: 200, shape: 'wraith',
                  attack: { kind: 'shock', stun: 0.8 } },
  blood_crab:   { n: 'Blood Crab',    color: '#8b0000', hp: 350, dmg: 36, spd: 0.85, aff: 'Blood', exp: 230, shape: 'crab',
                  attack: { kind: 'drain', steal: 0.4 } },
  abyss_eye:    { n: 'Abyss Eye',     color: '#1a237e', hp: 260, dmg: 30, spd: 0.6, aff: 'Darkness', ranged: true, exp: 240, shape: 'eye',
                  attack: { kind: 'blind', dur: 3 } },
  void_walker:  { n: 'Void Walker',   color: '#673ab7', hp: 500, dmg: 55, spd: 1.0, aff: 'Space', exp: 350, shape: 'wraith',
                  attack: { kind: 'curse', manaPenalty: 0.7, dur: 5 } },
  star_seraph:  { n: 'Star Seraph',   color: '#ffeb3b', hp: 700, dmg: 65, spd: 1.1, aff: 'Light', ranged: true, exp: 500, shape: 'orb',
                  attack: { kind: 'blind', dur: 4 } },
};

// Floor-tier monster pools. Designed to introduce new monsters with new mechanics
// gradually so the player gets to learn each before stacking them.
export function pickMonsterType(floor) {
  if (floor <= 5)  return pick(['slime', 'goblin', 'bat']);
  if (floor <= 12) return pick(['goblin', 'bat', 'spider', 'flame_imp']);
  if (floor <= 22) return pick(['spider', 'flame_imp', 'ice_wolf', 'poison_toad']);
  if (floor <= 35) return pick(['ice_wolf', 'poison_toad', 'golem', 'thunder_serpent']);
  if (floor <= 50) return pick(['golem', 'thunder_serpent', 'shade', 'blood_crab']);
  if (floor <= 65) return pick(['shade', 'lava_beast', 'storm_wraith', 'abyss_eye']);
  if (floor <= 80) return pick(['lava_beast', 'storm_wraith', 'blood_crab', 'abyss_eye']);
  if (floor <= 95) return pick(['storm_wraith', 'abyss_eye', 'void_walker']);
  return pick(['void_walker', 'star_seraph']);
}

// Old BOSS_TYPES table retained as fallback — real boss data lives in data/bosses.js now.
// This is here so older code paths that still import bossForFloor don't break.
export const BOSS_TYPES = [
  { n: 'Sprout King',   color: '#388e3c', aff: 'Nature',     hpMult: 4,  dmgMult: 2 },
  { n: 'Cave Tyrant',   color: '#5d4037', aff: 'Earth',      hpMult: 5,  dmgMult: 2.2 },
  { n: 'Ember Lord',    color: '#ff5722', aff: 'Fire',       hpMult: 6,  dmgMult: 2.4 },
  { n: 'Tidal Empress', color: '#0277bd', aff: 'Water',      hpMult: 7,  dmgMult: 2.6 },
  { n: 'Storm Caller',  color: '#fff176', aff: 'Lightning',  hpMult: 8,  dmgMult: 2.8 },
  { n: 'Frost Warden',  color: '#80deea', aff: 'Ice',        hpMult: 9,  dmgMult: 3 },
  { n: 'Magma Titan',   color: '#d84315', aff: 'Lava',       hpMult: 10, dmgMult: 3.2 },
  { n: 'Iron Sovereign',color: '#9e9e9e', aff: 'Metal',      hpMult: 11, dmgMult: 3.4 },
  { n: 'Blood Reaver',  color: '#8b0000', aff: 'Blood',      hpMult: 12, dmgMult: 3.6 },
  { n: 'Toxin Queen',   color: '#9ccc65', aff: 'Poison Gas', hpMult: 13, dmgMult: 3.8 },
  { n: 'Shadow Prince', color: '#311b92', aff: 'Darkness',   hpMult: 15, dmgMult: 4 },
  { n: 'Light Herald',  color: '#ffeb3b', aff: 'Light',      hpMult: 17, dmgMult: 4.2 },
  { n: 'Space Devourer',color: '#673ab7', aff: 'Space',      hpMult: 20, dmgMult: 4.5 },
  { n: 'Chrono Lord',   color: '#ffd54f', aff: 'Time',       hpMult: 25, dmgMult: 5 },
  { n: 'The Krezcent',  color: '#ff1744', aff: 'Time',       hpMult: 50, dmgMult: 6 },
];

export function bossForFloor(floor) {
  return BOSS_TYPES[Math.min(Math.floor((floor - 1) / 7), BOSS_TYPES.length - 1)];
}