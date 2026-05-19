// Boss roster. Two sets:
//   UNIQUE_BOSSES — fixed entries for every 10th floor (1 boss per arena floor)
//   REGULAR_BOSSES — pool that fills floors that aren't multiples of 10
//
// Each boss has an `aiPattern` that determines combat behavior. Patterns:
//   'projectile'     — fires shots at distance, melee if close
//   'melee_charge'   — sprints at the player, slams on contact
//   'teleport'       — periodically blinks behind/around the player
//   'healer'         — regenerates HP slowly, summons minions when low HP
//   'blinder'        — casts blinding pulses that obscure vision briefly
//   'summoner'       — spawns minions periodically
//   'spreader'       — fires multiple projectiles in fan/circle patterns
//   'shielder'       — periodically becomes invulnerable, must wait it out
//
// shape decides drawing in render code: 'titan', 'wraith', 'sphere', 'beast',
// 'serpent', 'avatar', 'spider_queen', 'eye_lord', 'specter', 'leviathan'.

const PATTERNS = {
  PROJECTILE: 'projectile',
  CHARGE: 'melee_charge',
  TELEPORT: 'teleport',
  HEALER: 'healer',
  BLINDER: 'blinder',
  SUMMONER: 'summoner',
  SPREADER: 'spreader',
  SHIELDER: 'shielder',
};

export const UNIQUE_BOSSES = {
  10:  { n: 'King of Slimes',      color: '#8bc34a', aff: 'Water',     hpMult: 8,   dmgMult: 2.5,  shape: 'sphere',       aiPattern: PATTERNS.SUMMONER,  summons: ['slime'],            cooldown: 5.0,
         desc: 'Spawns smaller slimes when struck.' },
  20:  { n: 'Cave Tyrant Reborn',  color: '#5d4037', aff: 'Earth',     hpMult: 13,  dmgMult: 3.2,  shape: 'titan',        aiPattern: PATTERNS.CHARGE,    chargeSpeed: 6,
         desc: 'Charges across the room. Sidestep to avoid being trampled.' },
  30:  { n: 'Hollow Empress',      color: '#311b92', aff: 'Darkness',  hpMult: 20,  dmgMult: 4,    shape: 'specter',      aiPattern: PATTERNS.TELEPORT,  teleportRate: 3.5,
         desc: 'Teleports across the chamber. Strike fast between blinks.' },
  40:  { n: 'Glacier Sovereign',   color: '#80deea', aff: 'Ice',       hpMult: 28,  dmgMult: 4.5,  shape: 'titan',        aiPattern: PATTERNS.SPREADER,  spreadCount: 7, spreadCd: 2.0,
         desc: 'Hurls a wide spread of frost spikes.' },
  50:  { n: 'World Tree Lord',     color: '#388e3c', aff: 'Nature',    hpMult: 38,  dmgMult: 5,    shape: 'avatar',       aiPattern: PATTERNS.HEALER,    healRate: 30, healInterval: 1.5,
         desc: 'Heals itself between strikes. Hit it hard and fast.' },
  60:  { n: 'Storm Conqueror',     color: '#fff176', aff: 'Lightning', hpMult: 50,  dmgMult: 5.5,  shape: 'specter',      aiPattern: PATTERNS.SPREADER,  spreadCount: 9, spreadCd: 1.8,
         desc: 'Crackles with chain lightning in every direction.' },
  70:  { n: 'Magma Sovereign',     color: '#d84315', aff: 'Lava',      hpMult: 65,  dmgMult: 6,    shape: 'titan',        aiPattern: PATTERNS.SUMMONER,  summons: ['flame_imp', 'lava_beast'], cooldown: 6.0,
         desc: 'Calls flame imps and lava beasts to overwhelm you.' },
  80:  { n: 'Adamant Titan',       color: '#90a4ae', aff: 'Metal',     hpMult: 85,  dmgMult: 6.5,  shape: 'titan',        aiPattern: PATTERNS.SHIELDER,  shieldDur: 3.0, shieldInterval: 8.0,
         desc: 'Periodically encases itself in adamant armor.' },
  90:  { n: 'The Void Itself',     color: '#4527a0', aff: 'Space',     hpMult: 110, dmgMult: 7,    shape: 'eye_lord',     aiPattern: PATTERNS.BLINDER,   blindDur: 4.0, blindInterval: 6.0,
         desc: 'Steals your vision in waves of darkness.' },
  100: { n: 'The Krezcent',        color: '#ff1744', aff: 'Time',      hpMult: 200, dmgMult: 9,    shape: 'leviathan',    aiPattern: PATTERNS.SPREADER,  spreadCount: 14, spreadCd: 1.4,
         desc: 'The final guardian. Time itself bends to its will.' },
};

export const REGULAR_BOSSES = [
  { n: 'Sprout King',     color: '#388e3c', aff: 'Nature',     hpMult: 4,  dmgMult: 2,    shape: 'avatar',       aiPattern: PATTERNS.PROJECTILE, desc: 'Lobs vine seeds at intruders.' },
  { n: 'Cave Tyrant',     color: '#5d4037', aff: 'Earth',      hpMult: 5,  dmgMult: 2.2,  shape: 'titan',        aiPattern: PATTERNS.CHARGE,     chargeSpeed: 5, desc: 'Brute force, with charging slams.' },
  { n: 'Spider Matron',   color: '#6a1b9a', aff: 'Earth',      hpMult: 6,  dmgMult: 2.3,  shape: 'spider_queen', aiPattern: PATTERNS.SUMMONER,   summons: ['spider'], cooldown: 4.5, desc: 'Calls baby spiders to swarm.' },
  { n: 'Ember Lord',      color: '#ff5722', aff: 'Fire',       hpMult: 6,  dmgMult: 2.4,  shape: 'specter',      aiPattern: PATTERNS.SPREADER,   spreadCount: 5, spreadCd: 2.4, desc: 'Sprays fireballs in a fan.' },
  { n: 'Tidal Empress',   color: '#0277bd', aff: 'Water',      hpMult: 7,  dmgMult: 2.6,  shape: 'serpent',      aiPattern: PATTERNS.PROJECTILE, desc: 'Hurls high-speed water bolts.' },
  { n: 'Storm Caller',    color: '#fff176', aff: 'Lightning',  hpMult: 8,  dmgMult: 2.8,  shape: 'specter',      aiPattern: PATTERNS.SPREADER,   spreadCount: 6, spreadCd: 2.2, desc: 'Spreads chain lightning in circles.' },
  { n: 'Frost Warden',    color: '#80deea', aff: 'Ice',        hpMult: 9,  dmgMult: 3,    shape: 'titan',        aiPattern: PATTERNS.PROJECTILE, desc: 'Throws shards that slow on hit.' },
  { n: 'Mire Hag',        color: '#9ccc65', aff: 'Poison Gas', hpMult: 10, dmgMult: 3.1,  shape: 'wraith',       aiPattern: PATTERNS.HEALER,     healRate: 15, healInterval: 2.0, desc: 'Regenerates through toxic mist.' },
  { n: 'Magma Titan',     color: '#d84315', aff: 'Lava',       hpMult: 10, dmgMult: 3.2,  shape: 'titan',        aiPattern: PATTERNS.CHARGE,     chargeSpeed: 4.5, desc: 'Earthshaker charges that scorch the floor.' },
  { n: 'Iron Sovereign',  color: '#9e9e9e', aff: 'Metal',      hpMult: 11, dmgMult: 3.4,  shape: 'titan',        aiPattern: PATTERNS.SHIELDER,   shieldDur: 2.5, shieldInterval: 9.0, desc: 'Forges armor mid-fight.' },
  { n: 'Blood Reaver',    color: '#8b0000', aff: 'Blood',      hpMult: 12, dmgMult: 3.6,  shape: 'beast',        aiPattern: PATTERNS.HEALER,     healRate: 25, healInterval: 1.6, desc: 'Drains health into its own.' },
  { n: 'Phantom Bishop',  color: '#7e57c2', aff: 'Darkness',   hpMult: 13, dmgMult: 3.7,  shape: 'wraith',       aiPattern: PATTERNS.TELEPORT,   teleportRate: 4.5, desc: 'Flickers between shadows.' },
  { n: 'Toxin Queen',     color: '#9ccc65', aff: 'Poison Gas', hpMult: 13, dmgMult: 3.8,  shape: 'spider_queen', aiPattern: PATTERNS.SPREADER,   spreadCount: 8, spreadCd: 2.0, desc: 'Spews toxic clouds in rings.' },
  { n: 'Shadow Prince',   color: '#311b92', aff: 'Darkness',   hpMult: 15, dmgMult: 4,    shape: 'specter',      aiPattern: PATTERNS.BLINDER,    blindDur: 3.0, blindInterval: 7.0, desc: 'Strikes from the dark — literally.' },
  { n: 'Inferno Wyrm',    color: '#ff5722', aff: 'Lava',       hpMult: 16, dmgMult: 4.1,  shape: 'serpent',      aiPattern: PATTERNS.PROJECTILE, desc: 'Breathes flame in long bursts.' },
  { n: 'Light Herald',    color: '#ffeb3b', aff: 'Light',      hpMult: 17, dmgMult: 4.2,  shape: 'avatar',       aiPattern: PATTERNS.BLINDER,    blindDur: 3.5, blindInterval: 6.5, desc: 'Holy light burns the eye.' },
  { n: 'Frost Lord',      color: '#80deea', aff: 'Ice',        hpMult: 18, dmgMult: 4.3,  shape: 'titan',        aiPattern: PATTERNS.SPREADER,   spreadCount: 7, spreadCd: 1.9, desc: 'Sends out radial blasts of frost.' },
  { n: 'Space Devourer',  color: '#673ab7', aff: 'Space',      hpMult: 20, dmgMult: 4.5,  shape: 'eye_lord',     aiPattern: PATTERNS.TELEPORT,   teleportRate: 2.8, desc: 'Folds space to strike from anywhere.' },
  { n: 'Chrono Lord',     color: '#ffd54f', aff: 'Time',       hpMult: 25, dmgMult: 5,    shape: 'wraith',       aiPattern: PATTERNS.TELEPORT,   teleportRate: 2.5, desc: 'Bends time. The fight feels longer than it is.' },
];

export function bossForFloor(floor) {
  // Every 10th floor — unique boss
  if (floor % 10 === 0 && UNIQUE_BOSSES[floor]) return { ...UNIQUE_BOSSES[floor], unique: true };
  // Otherwise pick from regular bosses, scaling by tier so harder floors get scarier names
  const tier = Math.min(REGULAR_BOSSES.length - 1, Math.floor((floor - 1) / 6));
  return { ...REGULAR_BOSSES[tier], unique: false };
}

export const BOSS_AI_PATTERNS = PATTERNS;