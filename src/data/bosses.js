// Boss roster — each entry has a distinct visual shape and clear AI pattern.
//
// Each boss has:
//   n: name
//   color: primary body color
//   aff: affinity (drives weakness math)
//   hpMult: HP scalar (boss HP = 250 * hpMult * floor scale)
//   dmgMult: damage scalar
//   shape: unique renderer key — every shape draws differently
//   aiPattern: which behavior to run (see BOSS_AI_PATTERNS)
//   ... pattern-specific tuning
//
// Shapes (rendered uniquely in main.jsx):
//   slime_king, stone_titan, hollow_queen, glacier_lord, world_tree,
//   storm_king, magma_lord, iron_giant, void_eye, krezcent,
//   sprout_avatar, cave_brute, spider_matron, ember_specter,
//   tide_serpent, frost_titan, mire_hag, blood_beast,
//   phantom_bishop, toxin_spider, inferno_wyrm, light_avatar,
//   chrono_phantom, scarab_lord, dust_djinn, wisp_swarm, fungal_horror

const PATTERNS = {
  PROJECTILE: 'projectile',
  CHARGE: 'melee_charge',
  TELEPORT: 'teleport',
  HEALER: 'healer',
  BLINDER: 'blinder',
  SUMMONER: 'summoner',
  SPREADER: 'spreader',
  SHIELDER: 'shielder',
  ORBITER: 'orbiter',     // strafes around the player at a fixed radius
  RAGER: 'rager',          // damage scales as HP drops
};

// ---------- Unique bosses for every 10th floor ----------
export const UNIQUE_BOSSES = {
  10: {
    n: 'King of Slimes', color: '#8bc34a', aff: 'Water',
    hpMult: 8, dmgMult: 2.5, shape: 'slime_king',
    aiPattern: PATTERNS.SUMMONER, summons: ['slime'], cooldown: 4.5,
    desc: 'Splits off smaller slimes every few seconds.',
  },
  20: {
    n: 'Bone Sovereign', color: '#cfc8b3', aff: 'Darkness',
    hpMult: 13, dmgMult: 3.2, shape: 'phantom_bishop',
    aiPattern: PATTERNS.PROJECTILE,
    desc: 'Ruler of the crypt. Hurls bone shards in tight volleys.',
  },
  30: {
    n: 'Hollow Empress', color: '#311b92', aff: 'Darkness',
    hpMult: 20, dmgMult: 4, shape: 'hollow_queen',
    aiPattern: PATTERNS.TELEPORT, teleportRate: 3.2,
    desc: 'Teleports through shadow. Strike between blinks.',
  },
  40: {
    n: 'World Tree Lord', color: '#388e3c', aff: 'Nature',
    hpMult: 28, dmgMult: 4.5, shape: 'world_tree',
    aiPattern: PATTERNS.HEALER, healRate: 35, healInterval: 1.5,
    desc: 'Regrows itself between strikes. Burst it down fast.',
  },
  50: {
    n: 'Glacier Sovereign', color: '#80deea', aff: 'Ice',
    hpMult: 38, dmgMult: 5, shape: 'glacier_lord',
    aiPattern: PATTERNS.SPREADER, spreadCount: 9, spreadCd: 1.9,
    desc: 'Hurls a wide spread of frost spikes that slow on hit.',
  },
  60: {
    n: 'Storm Conqueror', color: '#fff176', aff: 'Lightning',
    hpMult: 50, dmgMult: 5.5, shape: 'storm_king',
    aiPattern: PATTERNS.ORBITER, orbitRadius: 220, orbitSpeed: 1.6,
    desc: 'Circles the arena, striking with chain lightning.',
  },
  70: {
    n: 'Magma Sovereign', color: '#d84315', aff: 'Lava',
    hpMult: 65, dmgMult: 6, shape: 'magma_lord',
    aiPattern: PATTERNS.SUMMONER, summons: ['flame_imp', 'lava_beast'], cooldown: 5.5,
    desc: 'Calls flame minions to overwhelm.',
  },
  80: {
    n: 'Adamant Titan', color: '#90a4ae', aff: 'Metal',
    hpMult: 85, dmgMult: 6.5, shape: 'iron_giant',
    aiPattern: PATTERNS.SHIELDER, shieldDur: 3, shieldInterval: 8,
    desc: 'Encases itself in adamant armor — wait it out, then strike.',
  },
  90: {
    n: 'The Void Itself', color: '#4527a0', aff: 'Space',
    hpMult: 110, dmgMult: 7, shape: 'void_eye',
    aiPattern: PATTERNS.BLINDER, blindDur: 4, blindInterval: 6,
    desc: 'Steals your vision in waves of darkness.',
  },
  100: {
    n: 'The Krezcent', color: '#ff1744', aff: 'Time',
    hpMult: 200, dmgMult: 9, shape: 'krezcent',
    aiPattern: PATTERNS.RAGER, rageThreshold: 0.5, rageDmgMult: 1.8,
    desc: 'The final guardian. Bleeds it grows stronger.',
  },
};

// ---------- Regular bosses (non-10th floors) ----------
// Each one looks distinct and has a different pattern blend.
export const REGULAR_BOSSES = [
  // Tier 1 (floors 1-6)
  { n: 'Sprout King',     color: '#388e3c', aff: 'Nature',     hpMult: 4,  dmgMult: 2,    shape: 'sprout_avatar',  aiPattern: PATTERNS.PROJECTILE, desc: 'Lobs vine-seeds at intruders.' },
  // Tier 2
  { n: 'Cave Brute',      color: '#5d4037', aff: 'Earth',      hpMult: 5,  dmgMult: 2.2,  shape: 'cave_brute',     aiPattern: PATTERNS.CHARGE, chargeSpeed: 5, desc: 'Charges across the room — sidestep his slam.' },
  // Tier 3
  { n: 'Spider Matron',   color: '#6a1b9a', aff: 'Earth',      hpMult: 6,  dmgMult: 2.3,  shape: 'spider_matron',  aiPattern: PATTERNS.SUMMONER, summons: ['spider'], cooldown: 4, desc: 'Calls baby spiders to swarm you.' },
  // Tier 4
  { n: 'Ember Specter',   color: '#ff5722', aff: 'Fire',       hpMult: 7,  dmgMult: 2.5,  shape: 'ember_specter',  aiPattern: PATTERNS.SPREADER, spreadCount: 5, spreadCd: 2.4, desc: 'Fan of fireballs in a wide arc.' },
  // Tier 5
  { n: 'Tide Serpent',    color: '#0277bd', aff: 'Water',      hpMult: 8,  dmgMult: 2.7,  shape: 'tide_serpent',   aiPattern: PATTERNS.PROJECTILE, desc: 'Pressure jets fired at high speed.' },
  // Tier 6
  { n: 'Storm Caller',    color: '#fff176', aff: 'Lightning',  hpMult: 9,  dmgMult: 2.9,  shape: 'storm_king',     aiPattern: PATTERNS.SPREADER, spreadCount: 7, spreadCd: 2.0, desc: 'Spreads chain lightning in arcs.' },
  // Tier 7
  { n: 'Frost Titan',     color: '#80deea', aff: 'Ice',        hpMult: 10, dmgMult: 3.1,  shape: 'frost_titan',    aiPattern: PATTERNS.PROJECTILE, desc: 'Hurls shards that slow on impact.' },
  // Tier 8
  { n: 'Mire Hag',        color: '#9ccc65', aff: 'Poison Gas', hpMult: 11, dmgMult: 3.2,  shape: 'mire_hag',       aiPattern: PATTERNS.HEALER, healRate: 18, healInterval: 2.0, desc: 'Regenerates through toxic mist.' },
  // Tier 9
  { n: 'Inferno Wyrm',    color: '#bf360c', aff: 'Lava',       hpMult: 12, dmgMult: 3.4,  shape: 'inferno_wyrm',   aiPattern: PATTERNS.CHARGE, chargeSpeed: 4.5, desc: 'Earth-shaking charges that scorch the floor.' },
  // Tier 10
  { n: 'Iron Sentinel',   color: '#9e9e9e', aff: 'Metal',      hpMult: 13, dmgMult: 3.5,  shape: 'iron_giant',     aiPattern: PATTERNS.SHIELDER, shieldDur: 2.5, shieldInterval: 9, desc: 'Forges armor mid-fight.' },
  // Tier 11
  { n: 'Blood Beast',     color: '#8b0000', aff: 'Blood',      hpMult: 14, dmgMult: 3.7,  shape: 'blood_beast',    aiPattern: PATTERNS.RAGER, rageThreshold: 0.4, rageDmgMult: 1.5, desc: 'Grows more dangerous as its HP falls.' },
  // Tier 12
  { n: 'Phantom Bishop',  color: '#7e57c2', aff: 'Darkness',   hpMult: 15, dmgMult: 3.9,  shape: 'phantom_bishop', aiPattern: PATTERNS.TELEPORT, teleportRate: 4.0, desc: 'Flickers between shadows.' },
  // Tier 13
  { n: 'Toxin Matron',    color: '#9ccc65', aff: 'Poison Gas', hpMult: 16, dmgMult: 4.0,  shape: 'toxin_spider',   aiPattern: PATTERNS.SPREADER, spreadCount: 8, spreadCd: 2.0, desc: 'Spews toxic clouds in rings.' },
  // Tier 14
  { n: 'Shadow Reaver',   color: '#311b92', aff: 'Darkness',   hpMult: 17, dmgMult: 4.2,  shape: 'hollow_queen',   aiPattern: PATTERNS.BLINDER, blindDur: 3, blindInterval: 7, desc: 'Strikes from the dark — literally.' },
  // Tier 15
  { n: 'Light Avatar',    color: '#ffeb3b', aff: 'Light',      hpMult: 18, dmgMult: 4.4,  shape: 'light_avatar',   aiPattern: PATTERNS.BLINDER, blindDur: 3.5, blindInterval: 6.5, desc: 'Holy light burns the eye.' },
  // Tier 16
  { n: 'Scarab Lord',     color: '#b8860b', aff: 'Earth',      hpMult: 19, dmgMult: 4.5,  shape: 'scarab_lord',    aiPattern: PATTERNS.CHARGE, chargeSpeed: 5.5, desc: 'A massive armored scarab. Charges relentlessly.' },
  // Tier 17
  { n: 'Dust Djinn',      color: '#f9a825', aff: 'Air',        hpMult: 20, dmgMult: 4.7,  shape: 'dust_djinn',     aiPattern: PATTERNS.ORBITER, orbitRadius: 180, orbitSpeed: 1.4, desc: 'Floats in circles, raining sandblast.' },
  // Tier 18
  { n: 'Wisp Swarm',      color: '#b39ddb', aff: 'Air',        hpMult: 21, dmgMult: 4.8,  shape: 'wisp_swarm',     aiPattern: PATTERNS.SPREADER, spreadCount: 11, spreadCd: 1.6, desc: 'A roiling cloud of light wisps.' },
  // Tier 19
  { n: 'Fungal Horror',   color: '#9ccc65', aff: 'Nature',     hpMult: 22, dmgMult: 5.0,  shape: 'fungal_horror',  aiPattern: PATTERNS.SUMMONER, summons: ['poison_toad', 'spider'], cooldown: 5.0, desc: 'A walking colony. Spawns minor horrors.' },
  // Tier 20
  { n: 'Chrono Phantom',  color: '#ffd54f', aff: 'Time',       hpMult: 25, dmgMult: 5.2,  shape: 'chrono_phantom', aiPattern: PATTERNS.TELEPORT, teleportRate: 2.6, desc: 'Bends time. The fight feels longer than it is.' },
];

import { floorBoss as _floorBoss } from './floors.js';

export function bossForFloor(floor) {
  return _floorBoss(floor);
}

export const BOSS_AI_PATTERNS = PATTERNS;