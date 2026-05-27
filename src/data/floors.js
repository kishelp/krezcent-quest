// ============================================================================
// KREZCENT QUEST — 100 UNIQUE DUNGEON FLOORS (Update 7: Dungeon Overhaul)
// ============================================================================
// Each floor entry:
//   n        : floor name (shown on entry + HUD)
//   palette  : { wall, floor, accent, bg }  — unique per floor
//   gen      : layout generator key — one of:
//              maze, crypt, cave, hall, arena, river, magma, storm, garden, gauntlet
//   monsters : flavor monster-type list this floor draws from (engine types)
//   effect   : environmental effect key (see ENV EFFECTS below). null = none.
//   boss     : { n, aff, color, shape, hpMult, dmgMult, desc, script }
//
// ENV EFFECTS (handled in main.jsx applyFloorEffect):
//   haze       — periodic accuracy/aim wobble
//   slippery   — reduced movement control (ice sliding)
//   spores     — periodic poison tick when moving through
//   blizzard   — periodic slow + light damage
//   lavaburn   — standing on lava tiles burns (engine default for magma gen)
//   darkness   — vision tightened (small fog)
//   confusion  — brief random input scramble
//   radiation  — slow stacking damage over time
//   gravity    — periodic pull toward a point
//   sinking     — standing still too long damages (quicksand)
//   silence    — abilities cost more / disabled briefly
//   none
//
// BOSS SCRIPT — a hand-authored move-list run by runBossScript() in main.jsx.
// Format: { phases:[{ until: hpFrac, moves:[ MOVE, ... ] }], move-cadence handled
// by interpreter }.  Each MOVE is [type, params].  MOVE TYPES the interpreter
// supports (each reuses the player/effect rendering engine):
//   ['bolt', {dmg?,spd?,aff?}]            single tracking projectile
//   ['spread', {n,dmg?,arc?}]             fan of projectiles
//   ['ring', {n,dmg?}]                    projectiles in all directions
//   ['beam', {dmg?,width?}]               instant line beam toward player
//   ['nova', {r,dmg?,delay?}]             expanding shockwave at boss
//   ['slam', {r,dmg?,range?}]             telegraphed slam at player's spot
//   ['cone', {dmg?,arc?,range?}]          cone blast toward player
//   ['chain', {dmg?,hops?}]               chain lightning to nearby
//   ['field', {r,dmg?,life?}]             lingering damage field at player
//   ['dash', {dmg?,dist?}]                lunge toward player (melee hit)
//   ['charge', {dmg?,spd?}]               wind-up then charge across room
//   ['summon', {types,count}]             spawn minions
//   ['heal', {amt}]                       self-heal
//   ['shield', {dur}]                     temporary invulnerable guard
//   ['teleport', {}]                      blink near the player
//   ['blink_strike', {dmg?}]              teleport behind + melee
//   ['blind', {dur,r}]                    darkness pulse blinds
//   ['pillars', {n,dmg?}]                 fixed hazard pillars erupt
//   ['weapon', {style,dmg?}]              swing a weapon arc (slash/thrust/spin)
//   ['mirror', {}]                        copy the player's last ability
//   ['enrage', {dmgMult,spdMult}]         permanent buff (phase trigger)
//   ['waves', {n,dmg?}]                   sequential nova waves outward
//   ['volley', {n,dmg?}]                  rapid aimed shots
//   ['quake', {dmg?,r}]                   screen-shake AoE + stun
//   ['summon_hazard', {tile}]            convert nearby tiles to hazard
// Interpreter cycles the active phase's moves with pacing scaled by floor.
// ============================================================================

// Small helpers to keep entries terse.
const P = (wall, floor, accent, bg) => ({ wall, floor, accent, bg });

export const FLOORS = [
  // ===================== TIER 1 — Floors 1-10 (Elemental/Environmental) =====================
  { n: 'The Ember Catacombs', palette: P('#5a2417','#2a0f08','#b8431f','#160500'), gen: 'cave', monsters: ['flame_imp','bat'], effect: 'haze',
    boss: { n: 'The Cinder Sovereign', aff: 'Fire', color: '#ff5722', shape: 'ember_specter', hpMult: 4, dmgMult: 2,
      desc: 'A molten knight shifting between solid and liquid, raising fire pillars.',
      script: { phases: [
        { until: 0.5, moves: [['spread',{n:5,arc:0.8}],['pillars',{n:4}],['bolt',{}]] },
        { until: 0, moves: [['enrage',{dmgMult:1.4,spdMult:1.2}],['waves',{n:3}],['pillars',{n:6}],['nova',{r:130}]] },
      ] } } },

  { n: 'Frostbite Gallery', palette: P('#3d6b86','#16323f','#7fd4e6','#06141c'), gen: 'hall', monsters: ['ice_wolf','shade'], effect: 'slippery',
    boss: { n: 'Queen Cryostasia', aff: 'Ice', color: '#80deea', shape: 'frost_titan', hpMult: 4.5, dmgMult: 2.1,
      desc: 'An ice banshee who shatters her sculptures to heal and summons blizzards.',
      script: { phases: [
        { until: 0.45, moves: [['spread',{n:7,arc:1.0}],['heal',{amt:60}],['bolt',{}]] },
        { until: 0, moves: [['blizzard_call',{}],['ring',{n:10}],['heal',{amt:40}],['slam',{r:90}]] },
      ] } } },

  { n: 'The Storm Spire', palette: P('#2b2f7a','#12153f','#5b6bd6','#070920'), gen: 'arena', monsters: ['thunder_serpent','storm_wraith'], effect: 'none',
    boss: { n: 'Tempest Warden', aff: 'Lightning', color: '#fff176', shape: 'storm_king', hpMult: 5, dmgMult: 2.2,
      desc: 'A storm elemental who hurls wind to shove you off-balance and calls lightning.',
      script: { phases: [
        { until: 0.5, moves: [['chain',{hops:3}],['bolt',{spd:340}],['quake',{r:120}]] },
        { until: 0, moves: [['chain',{hops:5}],['ring',{n:8}],['enrage',{dmgMult:1.3,spdMult:1.3}]] },
      ] } } },

  { n: 'Verdant Maw', palette: P('#2e6b2a','#13380f','#62b23a','#06180a'), gen: 'garden', monsters: ['poison_toad','spider'], effect: 'spores',
    boss: { n: 'The Rootmind Hydra', aff: 'Nature', color: '#388e3c', shape: 'fungal_horror', hpMult: 5.5, dmgMult: 2.3,
      desc: 'Three toxic plant heads sharing one body, each spewing a different poison.',
      script: { phases: [
        { until: 0.6, moves: [['field',{r:70}],['spread',{n:5}],['summon',{types:['poison_toad'],count:2}]] },
        { until: 0, moves: [['field',{r:90}],['cone',{}],['ring',{n:9}],['heal',{amt:30}]] },
      ] } } },

  { n: 'The Crystal Labyrinth', palette: P('#5e60a8','#222452','#a9abe8','#0d0e26'), gen: 'maze', monsters: ['golem','shade'], effect: 'darkness',
    boss: { n: 'Shard Emperor', aff: 'Light', color: '#b39ddb', shape: 'light_avatar', hpMult: 6, dmgMult: 2.4,
      desc: 'A crystalline titan who clones himself from reflections and refracts blinding light.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['summon',{types:['golem'],count:1}],['spread',{n:5}]] },
        { until: 0, moves: [['beam',{width:40}],['blind',{dur:2,r:200}],['summon',{types:['golem'],count:2}]] },
      ] } } },

  { n: 'The Sand Clock Hall', palette: P('#8a6b2f','#3d2c0f','#d6b25b','#1c1305'), gen: 'hall', monsters: ['scarab_lord','golem'], effect: 'sinking',
    boss: { n: 'Chrono-Scarab Monarch', aff: 'Time', color: '#ffd54f', shape: 'scarab_lord', hpMult: 6.5, dmgMult: 2.5,
      desc: 'Manipulates time to rewind its own wounds. Burst it between rewinds.',
      script: { phases: [
        { until: 0.5, moves: [['charge',{spd:5}],['heal',{amt:80}],['spread',{n:6}]] },
        { until: 0, moves: [['heal',{amt:50}],['quake',{r:130}],['volley',{n:5}]] },
      ] } } },

  { n: 'Abyssal Reef', palette: P('#0f4a6b','#062330','#1f86b8','#02121b'), gen: 'river', monsters: ['blood_crab','thunder_serpent'], effect: 'darkness',
    boss: { n: 'Leviathan of the Drowned', aff: 'Water', color: '#0277bd', shape: 'tide_serpent', hpMult: 7, dmgMult: 2.6,
      desc: 'A massive eel that coils the arena and drags you into whirlpools.',
      script: { phases: [
        { until: 0.5, moves: [['bolt',{spd:380}],['field',{r:80}],['cone',{}]] },
        { until: 0, moves: [['waves',{n:4}],['field',{r:100}],['dash',{}]] },
      ] } } },

  { n: 'The Volatile Greenhouse', palette: P('#3e7d3a','#173d14','#86d65b','#08180a'), gen: 'garden', monsters: ['poison_toad','flame_imp'], effect: 'spores',
    boss: { n: 'The Alchemother', aff: 'Poison Gas', color: '#9ccc65', shape: 'mire_hag', hpMult: 7.5, dmgMult: 2.7,
      desc: 'A plant-beast that mixes volatile chemicals mid-fight to swap its attacks.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:75}],['nova',{r:110}],['spread',{n:5}]] },
        { until: 0, moves: [['field',{r:95}],['ring',{n:10}],['cone',{}],['heal',{amt:30}]] },
      ] } } },

  { n: 'The Obsidian Forge', palette: P('#4a2410','#220f06','#c2531c','#100400'), gen: 'gauntlet', monsters: ['golem','lava_beast'], effect: 'lavaburn',
    boss: { n: 'The Iron Tyrant', aff: 'Metal', color: '#90a4ae', shape: 'iron_giant', hpMult: 8, dmgMult: 2.8,
      desc: 'A giant mech suit piloted by a dwarf ghost — shields, then slams.',
      script: { phases: [
        { until: 0.5, moves: [['shield',{dur:2.5}],['slam',{r:100}],['charge',{spd:5}]] },
        { until: 0, moves: [['shield',{dur:2}],['quake',{r:140}],['volley',{n:6}],['enrage',{dmgMult:1.3,spdMult:1.1}]] },
      ] } } },

  { n: 'The Tempest Orchard', palette: P('#3a5d7a','#16293a','#6fb0d6','#071420'), gen: 'arena', monsters: ['storm_wraith','bat'], effect: 'none',
    boss: { n: 'Aeralune', aff: 'Air', color: '#b39ddb', shape: 'dust_djinn', hpMult: 9, dmgMult: 3,
      desc: 'A winged dryad who reshapes floating terrain and rides the wind.',
      script: { phases: [
        { until: 0.5, moves: [['orbit_strafe',{}],['spread',{n:7}],['quake',{r:120}]] },
        { until: 0, moves: [['ring',{n:12}],['teleport',{}],['cone',{}],['enrage',{dmgMult:1.3,spdMult:1.4}]] },
      ] } } },

  // ===================== TIER 2 — Floors 11-20 (Dark / Occult / Horror) =====================
  { n: 'The Whispering Library', palette: P('#4a3b2a','#241c12','#8a6f45','#120c06'), gen: 'maze', monsters: ['shade','bat'], effect: 'confusion',
    boss: { n: 'Archivist Null', aff: 'Darkness', color: '#7e57c2', shape: 'phantom_bishop', hpMult: 10, dmgMult: 3.1,
      desc: 'A faceless librarian who rewrites reality between volleys.',
      script: { phases: [
        { until: 0.5, moves: [['volley',{n:5}],['teleport',{}],['beam',{}]] },
        { until: 0, moves: [['mirror',{}],['ring',{n:10}],['blind',{dur:2,r:180}],['teleport',{}]] },
      ] } } },

  { n: 'The Marionette Theater', palette: P('#5d2a3a','#2a1018','#a8506a','#160508'), gen: 'hall', monsters: ['shade','goblin'], effect: 'confusion',
    boss: { n: 'The Puppetmaster', aff: 'Darkness', color: '#ad1457', shape: 'hollow_queen', hpMult: 11, dmgMult: 3.2,
      desc: 'A many-armed figure who seizes your strings and yanks you about.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['shade'],count:2}],['spread',{n:6}],['dash',{}]] },
        { until: 0, moves: [['quake',{r:130}],['summon',{types:['shade'],count:3}],['ring',{n:9}]] },
      ] } } },

  { n: 'The Blood Chapel', palette: P('#5a1418','#2a0608','#b8202a','#140203'), gen: 'crypt', monsters: ['blood_crab','shade'], effect: 'none',
    boss: { n: 'Cardinal Hemorrhage', aff: 'Blood', color: '#8b0000', shape: 'blood_beast', hpMult: 12, dmgMult: 3.4,
      desc: 'A vampire priest who drains life through the chapel floor.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:80}],['heal',{amt:70}],['bolt',{}]] },
        { until: 0, moves: [['field',{r:110}],['heal',{amt:60}],['waves',{n:3}],['dash',{}]] },
      ] } } },

  { n: 'The Shadow Nursery', palette: P('#2a2540','#12101f','#4a4070','#070512'), gen: 'crypt', monsters: ['shade','bat'], effect: 'darkness',
    boss: { n: 'Mother Umbra', aff: 'Darkness', color: '#311b92', shape: 'hollow_queen', hpMult: 13, dmgMult: 3.5,
      desc: 'A shadow entity that grows stronger the darker the room becomes.',
      script: { phases: [
        { until: 0.5, moves: [['blind',{dur:2,r:200}],['summon',{types:['shade'],count:2}],['bolt',{}]] },
        { until: 0, moves: [['blind',{dur:3,r:240}],['enrage',{dmgMult:1.5,spdMult:1.2}],['ring',{n:10}]] },
      ] } } },

  { n: 'The Bone Orchard', palette: P('#5a5040','#2a2418','#8a8068','#141206'), gen: 'garden', monsters: ['shade','spider'], effect: 'none',
    boss: { n: 'The Ossuary King', aff: 'Darkness', color: '#cfc8b3', shape: 'phantom_bishop', hpMult: 14, dmgMult: 3.6,
      desc: 'A skeletal giant who rebuilds himself from the orchard of bones.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:5}],['spread',{n:7}],['heal',{amt:50}]] },
        { until: 0, moves: [['pillars',{n:8}],['quake',{r:140}],['heal',{amt:40}],['ring',{n:10}]] },
      ] } } },

  { n: 'The Silent Morgue', palette: P('#3a4a4a','#16201f','#6a8482','#070f0e'), gen: 'gauntlet', monsters: ['shade','golem'], effect: 'silence',
    boss: { n: 'The Surgeon', aff: 'Metal', color: '#b0bec5', shape: 'iron_giant', hpMult: 15, dmgMult: 3.7,
      desc: 'A stitched abomination wielding bone saws — and a silence aura.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'spin'}],['dash',{}],['volley',{n:4}]] },
        { until: 0, moves: [['weapon',{style:'spin'}],['charge',{spd:5.5}],['quake',{r:120}]] },
      ] } } },

  { n: 'The Mirror Crypt', palette: P('#3a3a5a','#16162a','#6a6aa8','#070712'), gen: 'maze', monsters: ['shade','golem'], effect: 'none',
    boss: { n: 'The Mirrorbound', aff: 'Arcane', color: '#90caf9', shape: 'void_eye', hpMult: 16, dmgMult: 3.8,
      desc: 'A shifting entity that copies the abilities you just used.',
      script: { phases: [
        { until: 0.5, moves: [['mirror',{}],['mirror',{}],['teleport',{}]] },
        { until: 0, moves: [['mirror',{}],['ring',{n:9}],['mirror',{}],['nova',{r:120}]] },
      ] } } },

  { n: 'The Candle Maze', palette: P('#5a4220','#2a1e0c','#c28a3a','#140c04'), gen: 'maze', monsters: ['flame_imp','shade'], effect: 'darkness',
    boss: { n: 'The Wax Prophet', aff: 'Fire', color: '#ffb74d', shape: 'ember_specter', hpMult: 17, dmgMult: 3.9,
      desc: 'A figure that melts and reforms, relighting the maze in fire.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:80}],['spread',{n:6}],['teleport',{}]] },
        { until: 0, moves: [['waves',{n:4}],['pillars',{n:6}],['field',{r:100}]] },
      ] } } },

  { n: 'The Grinning Carnival', palette: P('#6a2a5a','#2a1024','#c24aa8','#140510'), gen: 'arena', monsters: ['goblin','bat'], effect: 'confusion',
    boss: { n: 'Ringmaster Glee', aff: 'Arcane', color: '#e040fb', shape: 'dust_djinn', hpMult: 18, dmgMult: 4.0,
      desc: 'Juggles explosive orbs and teleports through the hallucinations.',
      script: { phases: [
        { until: 0.5, moves: [['ring',{n:8}],['teleport',{}],['nova',{r:110}]] },
        { until: 0, moves: [['ring',{n:12}],['teleport',{}],['volley',{n:6}],['nova',{r:130}]] },
      ] } } },

  { n: 'The Lamenting Catacombs', palette: P('#3a3548','#16131f','#605878','#070512'), gen: 'crypt', monsters: ['shade','blood_crab'], effect: 'silence',
    boss: { n: 'The Mourner', aff: 'Water', color: '#90a4d8', shape: 'hollow_queen', hpMult: 19, dmgMult: 4.1,
      desc: 'A ghostly widow whose wails distort the screen and lower defense.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:3}],['blind',{dur:2,r:200}],['bolt',{}]] },
        { until: 0, moves: [['waves',{n:5}],['quake',{r:150}],['ring',{n:10}]] },
      ] } } },

  // ===================== TIER 3 — Floors 21-30 (Technological / Sci-Fi) =====================
  { n: 'The Neon Grid', palette: P('#0a3a4a','#04181f','#1fd6e6','#020c10'), gen: 'maze', monsters: ['golem','storm_wraith'], effect: 'none',
    boss: { n: 'The Overclocked Sentinel', aff: 'Lightning', color: '#18ffff', shape: 'iron_giant', hpMult: 20, dmgMult: 4.2,
      desc: 'A robot that speeds itself up every phase.',
      script: { phases: [
        { until: 0.6, moves: [['volley',{n:4}],['dash',{}],['beam',{}]] },
        { until: 0.3, moves: [['enrage',{dmgMult:1.2,spdMult:1.3}],['volley',{n:6}],['chain',{hops:3}]] },
        { until: 0, moves: [['enrage',{dmgMult:1.2,spdMult:1.3}],['beam',{width:36}],['ring',{n:10}]] },
      ] } } },

  { n: 'The Reactor Core', palette: P('#4a4a10','#1f1f06','#d6d61f','#0c0c02'), gen: 'arena', monsters: ['lava_beast','golem'], effect: 'radiation',
    boss: { n: 'Core Guardian', aff: 'Fire', color: '#ffee58', shape: 'magma_lord', hpMult: 21, dmgMult: 4.3,
      desc: 'A mech that overloads the reactor to unleash shockwaves.',
      script: { phases: [
        { until: 0.5, moves: [['nova',{r:130}],['waves',{n:3}],['slam',{r:100}]] },
        { until: 0, moves: [['waves',{n:5}],['nova',{r:160}],['pillars',{n:6}]] },
      ] } } },

  { n: 'The Hologram Museum', palette: P('#2a1f5a','#100a2a','#5a40c2','#06041a'), gen: 'hall', monsters: ['shade','void_walker'], effect: 'confusion',
    boss: { n: 'Curator.exe', aff: 'Arcane', color: '#7c4dff', shape: 'void_eye', hpMult: 22, dmgMult: 4.4,
      desc: 'A glitching AI that rewrites the arena and your last move.',
      script: { phases: [
        { until: 0.5, moves: [['mirror',{}],['teleport',{}],['spread',{n:6}]] },
        { until: 0, moves: [['mirror',{}],['ring',{n:11}],['beam',{}],['teleport',{}]] },
      ] } } },

  { n: 'The Scrap Heap', palette: P('#4a3a2a','#1f1710','#8a6a45','#0c0905'), gen: 'gauntlet', monsters: ['golem','goblin'], effect: 'gravity',
    boss: { n: 'The Junk Titan', aff: 'Metal', color: '#a1887f', shape: 'iron_giant', hpMult: 23, dmgMult: 4.5,
      desc: 'A robot that drags you in with magnets and rebuilds from scrap.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['slam',{r:100}],['heal',{amt:60}]] },
        { until: 0, moves: [['pull_grav',{}],['quake',{r:150}],['heal',{amt:50}],['volley',{n:6}]] },
      ] } } },

  { n: 'The Quantum Lab', palette: P('#1f4a4a','#0a1f1f','#3ad6c2','#041010'), gen: 'maze', monsters: ['void_walker','shade'], effect: 'none',
    boss: { n: 'Dr. Paradox', aff: 'Space', color: '#1de9b6', shape: 'void_eye', hpMult: 24, dmgMult: 4.6,
      desc: 'A scientist who splits into multiple timelines and teleports.',
      script: { phases: [
        { until: 0.5, moves: [['teleport',{}],['blink_strike',{}],['spread',{n:6}]] },
        { until: 0, moves: [['teleport',{}],['ring',{n:10}],['blink_strike',{}],['nova',{r:120}]] },
      ] } } },

  { n: 'The Drone Hangar', palette: P('#2a3a4a','#10171f','#4a6a8a','#06090c'), gen: 'arena', monsters: ['storm_wraith','golem'], effect: 'none',
    boss: { n: 'Skybreaker Unit', aff: 'Lightning', color: '#40c4ff', shape: 'storm_king', hpMult: 25, dmgMult: 4.7,
      desc: 'A flying mech that target-locks then unleashes missile barrages.',
      script: { phases: [
        { until: 0.5, moves: [['volley',{n:6}],['orbit_strafe',{}],['beam',{}]] },
        { until: 0, moves: [['volley',{n:9}],['ring',{n:12}],['slam',{r:110}]] },
      ] } } },

  { n: 'The Cyber Sewers', palette: P('#1f4a2a','#0a1f10','#3ad65a','#04100a'), gen: 'river', monsters: ['poison_toad','blood_crab'], effect: 'radiation',
    boss: { n: 'The Sludge Sovereign', aff: 'Poison Gas', color: '#76ff03', shape: 'mire_hag', hpMult: 26, dmgMult: 4.8,
      desc: 'A corrupting blob that floods the tunnels with toxic sludge.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:90}],['summon',{types:['poison_toad'],count:2}],['nova',{r:120}]] },
        { until: 0, moves: [['field',{r:120}],['waves',{n:4}],['ring',{n:10}]] },
      ] } } },

  { n: 'The Gravity Chamber', palette: P('#2a1f4a','#100a1f','#5a4ad6','#06041a'), gen: 'arena', monsters: ['void_walker','storm_wraith'], effect: 'gravity',
    boss: { n: 'The Graviton', aff: 'Space', color: '#7c4dff', shape: 'void_eye', hpMult: 28, dmgMult: 4.9,
      desc: 'A humanoid singularity that flips gravity and crushes inward.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['ring',{n:10}],['beam',{}]] },
        { until: 0, moves: [['pull_grav',{}],['nova',{r:160}],['ring',{n:14}],['quake',{r:150}]] },
      ] } } },

  { n: 'The Nanite Hive', palette: P('#3a3a3a','#161616','#7a9a7a','#070707'), gen: 'gauntlet', monsters: ['golem','spider'], effect: 'none',
    boss: { n: 'Hive Prime', aff: 'Metal', color: '#b0bec5', shape: 'iron_giant', hpMult: 30, dmgMult: 5.0,
      desc: 'A shifting mass of nanites that adapts and forms weapons.',
      script: { phases: [
        { until: 0.5, moves: [['shield',{dur:2}],['weapon',{style:'thrust'}],['summon',{types:['spider'],count:2}]] },
        { until: 0, moves: [['shield',{dur:2}],['weapon',{style:'spin'}],['volley',{n:7}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  { n: 'The Abandoned Spaceport', palette: P('#1f2a4a','#0a101f','#3a5ad6','#04061a'), gen: 'hall', monsters: ['void_walker','goblin'], effect: 'gravity',
    boss: { n: 'Captain Voidjaw', aff: 'Space', color: '#536dfe', shape: 'void_eye', hpMult: 32, dmgMult: 5.2,
      desc: 'A pirate wielding a black-hole cannon that pulls you to your doom.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['beam',{width:36}],['volley',{n:5}]] },
        { until: 0, moves: [['pull_grav',{}],['beam',{width:48}],['nova',{r:150}],['ring',{n:12}]] },
      ] } } },

  // ===================== TIER 4 — Floors 31-40 (Puzzle / Mind-Bending) =====================
  { n: 'The Rotating Cube', palette: P('#3a3a6a','#16162a','#6a6ad6','#070712'), gen: 'maze', monsters: ['golem','shade'], effect: 'confusion',
    boss: { n: 'The Architect', aff: 'Arcane', color: '#82b1ff', shape: 'void_eye', hpMult: 34, dmgMult: 5.3,
      desc: 'Rotates the arena like a Rubik\u2019s cube to trap you in its volleys.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:6}],['ring',{n:10}],['teleport',{}]] },
        { until: 0, moves: [['pillars',{n:9}],['ring',{n:14}],['quake',{r:150}]] },
      ] } } },

  { n: 'The Memory Garden', palette: P('#3a5a4a','#16241f','#6ad6a8','#071210'), gen: 'garden', monsters: ['shade','poison_toad'], effect: 'silence',
    boss: { n: 'Mnemosyne Bloom', aff: 'Nature', color: '#69f0ae', shape: 'world_tree', hpMult: 36, dmgMult: 5.4,
      desc: 'A flower goddess who rewrites your stats and reclaims memories.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:90}],['heal',{amt:70}],['spread',{n:7}]] },
        { until: 0, moves: [['field',{r:120}],['heal',{amt:60}],['ring',{n:12}],['blind',{dur:2,r:200}]] },
      ] } } },

  { n: 'The Escher Stairwell', palette: P('#4a3a5a','#1f1624','#8a6ad6','#0c0712'), gen: 'gauntlet', monsters: ['void_walker','shade'], effect: 'gravity',
    boss: { n: 'The Paradox Knight', aff: 'Space', color: '#b388ff', shape: 'void_eye', hpMult: 38, dmgMult: 5.5,
      desc: 'Teleports through impossible angles to strike from nowhere.',
      script: { phases: [
        { until: 0.5, moves: [['blink_strike',{}],['teleport',{}],['weapon',{style:'thrust'}]] },
        { until: 0, moves: [['blink_strike',{}],['ring',{n:10}],['blink_strike',{}],['nova',{r:130}]] },
      ] } } },

  { n: 'The Color Trial', palette: P('#5a2a5a','#241024','#d64ad6','#100410'), gen: 'hall', monsters: ['flame_imp','ice_wolf'], effect: 'confusion',
    boss: { n: 'Spectrum Lord', aff: 'Light', color: '#ff4081', shape: 'light_avatar', hpMult: 40, dmgMult: 5.6,
      desc: 'Shifts color to change which attacks it is weak to.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['spread',{n:7}],['nova',{r:120}]] },
        { until: 0, moves: [['beam',{width:40}],['ring',{n:12}],['waves',{n:3}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  { n: 'The Sound Maze', palette: P('#2a2a3a','#101019','#4a4a6a','#06060c'), gen: 'maze', monsters: ['shade','bat'], effect: 'darkness',
    boss: { n: 'The Conductor', aff: 'Air', color: '#80d8ff', shape: 'dust_djinn', hpMult: 42, dmgMult: 5.7,
      desc: 'Uses sonic waves to disorient and shove you through the dark.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:4}],['quake',{r:130}],['blind',{dur:2,r:200}]] },
        { until: 0, moves: [['waves',{n:6}],['ring',{n:12}],['quake',{r:160}]] },
      ] } } },

  { n: 'The Puzzle Forge', palette: P('#4a3a1f','#1f170a','#8a6a3a','#0c0905'), gen: 'gauntlet', monsters: ['golem','flame_imp'], effect: 'none',
    boss: { n: 'Master Mechanist', aff: 'Metal', color: '#ffab40', shape: 'iron_giant', hpMult: 44, dmgMult: 5.8,
      desc: 'Triggers trap mechanisms mid-fight if you mistime your strikes.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:6}],['weapon',{style:'spin'}],['slam',{r:100}]] },
        { until: 0, moves: [['pillars',{n:9}],['quake',{r:150}],['volley',{n:7}]] },
      ] } } },

  { n: 'The Illusion Ballroom', palette: P('#3a2a5a','#161024','#6a4ad6','#070412'), gen: 'hall', monsters: ['shade','void_walker'], effect: 'confusion',
    boss: { n: 'Masquerade Phantom', aff: 'Darkness', color: '#b388ff', shape: 'phantom_bishop', hpMult: 46, dmgMult: 5.9,
      desc: 'Hides among illusions, striking from the false copies.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['shade'],count:3}],['teleport',{}],['spread',{n:6}]] },
        { until: 0, moves: [['summon',{types:['shade'],count:3}],['ring',{n:11}],['blink_strike',{}]] },
      ] } } },

  { n: 'The Rune Vault', palette: P('#2a3a5a','#101624','#4a6ad6','#060712'), gen: 'crypt', monsters: ['golem','shade'], effect: 'silence',
    boss: { n: 'Runelord Arkan', aff: 'Arcane', color: '#536dfe', shape: 'void_eye', hpMult: 48, dmgMult: 6.0,
      desc: 'Rewrites glowing runes to reshape the battlefield with traps.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:7}],['beam',{}],['ring',{n:10}]] },
        { until: 0, moves: [['pillars',{n:10}],['beam',{width:40}],['ring',{n:14}],['quake',{r:150}]] },
      ] } } },

  { n: 'The Labyrinth of Doors', palette: P('#3a2a3a','#161016','#6a4a6a','#070407'), gen: 'maze', monsters: ['shade','goblin'], effect: 'confusion',
    boss: { n: 'The Doorkeeper', aff: 'Space', color: '#b39ddb', shape: 'void_eye', hpMult: 50, dmgMult: 6.1,
      desc: 'Controls which doors open, teleport-trapping you mid-fight.',
      script: { phases: [
        { until: 0.5, moves: [['teleport',{}],['blink_strike',{}],['ring',{n:9}]] },
        { until: 0, moves: [['teleport',{}],['nova',{r:140}],['blink_strike',{}],['ring',{n:13}]] },
      ] } } },

  { n: 'The Dream Corridor', palette: P('#4a2a5a','#1f1024','#8a4ad6','#0c0412'), gen: 'hall', monsters: ['shade','void_walker'], effect: 'confusion',
    boss: { n: 'Somnus', aff: 'Arcane', color: '#ce93d8', shape: 'void_eye', hpMult: 52, dmgMult: 6.2,
      desc: 'A dream deity altering reality, raining random status afflictions.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:90}],['blind',{dur:2,r:200}],['spread',{n:7}]] },
        { until: 0, moves: [['mirror',{}],['ring',{n:12}],['field',{r:110}],['nova',{r:140}]] },
      ] } } },

  // ===================== TIER 5 — Floors 41-50 (Biological / Parasitic / Organic) =====================
  { n: 'The Living Tunnel', palette: P('#5a1f2a','#2a0a10','#b83a4a','#140305'), gen: 'cave', monsters: ['blood_crab','poison_toad'], effect: 'none',
    boss: { n: 'The Heart of Hunger', aff: 'Blood', color: '#e53935', shape: 'blood_beast', hpMult: 54, dmgMult: 6.3,
      desc: 'A massive beating heart whose tendrils latch on and drain you.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:90}],['heal',{amt:80}],['dash',{}]] },
        { until: 0, moves: [['field',{r:120}],['heal',{amt:70}],['waves',{n:4}],['quake',{r:140}]] },
      ] } } },

  { n: 'The Spore Cavern', palette: P('#3a5a2a','#16240f','#6ad63a','#07120a'), gen: 'cave', monsters: ['poison_toad','spider'], effect: 'spores',
    boss: { n: 'Mycelia Queen', aff: 'Nature', color: '#9ccc65', shape: 'fungal_horror', hpMult: 56, dmgMult: 6.4,
      desc: 'A fungal titan spreading roots and hallucinogenic spore storms.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:100}],['summon',{types:['poison_toad'],count:2}],['spread',{n:7}]] },
        { until: 0, moves: [['field',{r:130}],['ring',{n:12}],['heal',{amt:50}],['nova',{r:140}]] },
      ] } } },

  { n: 'The Hive Nursery', palette: P('#5a4a1f','#2a230a','#d6b23a','#140f04'), gen: 'gauntlet', monsters: ['spider','bat'], effect: 'none',
    boss: { n: 'Broodmother Hexa', aff: 'Earth', color: '#ffca28', shape: 'spider_matron', hpMult: 58, dmgMult: 6.5,
      desc: 'A six-legged queen who floods the comb with endless larvae.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['spider'],count:3}],['spread',{n:6}],['dash',{}]] },
        { until: 0, moves: [['summon',{types:['spider'],count:4}],['ring',{n:11}],['quake',{r:130}]] },
      ] } } },

  { n: 'The Ribcage Hall', palette: P('#5a5448','#2a2620','#8a8270','#141208'), gen: 'hall', monsters: ['shade','golem'], effect: 'none',
    boss: { n: 'The Fossil Colossus', aff: 'Earth', color: '#d7ccc8', shape: 'stone_titan', hpMult: 60, dmgMult: 6.6,
      desc: 'A reanimated skeleton that reassembles itself after every break.',
      script: { phases: [
        { until: 0.5, moves: [['slam',{r:110}],['heal',{amt:70}],['pillars',{n:6}]] },
        { until: 0, moves: [['quake',{r:160}],['heal',{amt:60}],['slam',{r:130}],['volley',{n:6}]] },
      ] } } },

  { n: 'The Parasite Den', palette: P('#4a2a4a','#1f101f','#8a4a8a','#0c040c'), gen: 'cave', monsters: ['poison_toad','shade'], effect: 'spores',
    boss: { n: 'The Brain Burrower', aff: 'Poison Gas', color: '#ba68c8', shape: 'toxin_spider', hpMult: 62, dmgMult: 6.7,
      desc: 'A worm that briefly mind-controls you, scrambling your movement.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:90}],['confuse_pulse',{}],['spread',{n:6}]] },
        { until: 0, moves: [['field',{r:120}],['confuse_pulse',{}],['ring',{n:12}],['dash',{}]] },
      ] } } },

  { n: 'The Acid Maw', palette: P('#4a5a1f','#1f240a','#8ad63a','#0c1004'), gen: 'cave', monsters: ['poison_toad','blood_crab'], effect: 'radiation',
    boss: { n: 'The Caustic Leviathan', aff: 'Poison Gas', color: '#aeea00', shape: 'tide_serpent', hpMult: 64, dmgMult: 6.8,
      desc: 'A slug that floods the cavern with corroding acid waves.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:3}],['field',{r:100}],['bolt',{spd:360}]] },
        { until: 0, moves: [['waves',{n:5}],['field',{r:130}],['ring',{n:11}]] },
      ] } } },

  { n: 'The Flesh Garden', palette: P('#5a2a3a','#2a1018','#b84a6a','#140508'), gen: 'garden', monsters: ['poison_toad','spider'], effect: 'spores',
    boss: { n: 'The Garden Keeper', aff: 'Nature', color: '#ec407a', shape: 'world_tree', hpMult: 66, dmgMult: 6.9,
      desc: 'A plant hybrid wielding vine whips that grab and pull.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'spin'}],['pull_grav',{}],['field',{r:90}]] },
        { until: 0, moves: [['weapon',{style:'spin'}],['pull_grav',{}],['ring',{n:12}],['quake',{r:140}]] },
      ] } } },

  { n: 'The Digestive Pit', palette: P('#5a3a1f','#2a170a','#b86a3a','#140a04'), gen: 'river', monsters: ['blood_crab','poison_toad'], effect: 'radiation',
    boss: { n: 'The Devourer Core', aff: 'Blood', color: '#ff7043', shape: 'blood_beast', hpMult: 68, dmgMult: 7.0,
      desc: 'A giant maw spitting corrosive bile across the pit.',
      script: { phases: [
        { until: 0.5, moves: [['cone',{}],['field',{r:100}],['spread',{n:7}]] },
        { until: 0, moves: [['cone',{arc:1.4}],['waves',{n:4}],['ring',{n:12}]] },
      ] } } },

  { n: 'The Nerve Nexus', palette: P('#2a4a5a','#101f24','#3a8ad6','#06090c'), gen: 'maze', monsters: ['storm_wraith','shade'], effect: 'none',
    boss: { n: 'Neurospine', aff: 'Lightning', color: '#40c4ff', shape: 'void_eye', hpMult: 70, dmgMult: 7.1,
      desc: 'A brain-creature firing psychic shocks that stun.',
      script: { phases: [
        { until: 0.5, moves: [['chain',{hops:4}],['quake',{r:130}],['beam',{}]] },
        { until: 0, moves: [['chain',{hops:6}],['ring',{n:12}],['quake',{r:160}]] },
      ] } } },

  { n: 'The Blood River', palette: P('#5a1418','#2a0608','#c8202a','#140203'), gen: 'river', monsters: ['blood_crab','shade'], effect: 'none',
    boss: { n: 'The Crimson Current', aff: 'Blood', color: '#d50000', shape: 'tide_serpent', hpMult: 73, dmgMult: 7.2,
      desc: 'A liquid elemental that shifts shape and bleeds you in its flow.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:4}],['field',{r:100}],['dash',{}]] },
        { until: 0, moves: [['waves',{n:6}],['field',{r:130}],['ring',{n:12}],['heal',{amt:50}]] },
      ] } } },

  // ===================== TIER 6 — Floors 51-60 (Organic depths continue) =====================
  { n: 'The Cocoon Vault', palette: P('#4a4a2a','#1f1f10','#8a8a4a','#0c0c06'), gen: 'gauntlet', monsters: ['spider','bat'], effect: 'none',
    boss: { n: 'The Silk Matron', aff: 'Earth', color: '#dce775', shape: 'spider_matron', hpMult: 76, dmgMult: 7.3,
      desc: 'A spider queen weaving silk barriers and immobilizing webs.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['spider'],count:3}],['field',{r:90}],['spread',{n:7}]] },
        { until: 0, moves: [['summon',{types:['spider'],count:4}],['ring',{n:12}],['dash',{}]] },
      ] } } },

  { n: 'The Bone Marrow Mines', palette: P('#5a5448','#2a2620','#9a9078','#141208'), gen: 'cave', monsters: ['golem','shade'], effect: 'slippery',
    boss: { n: 'The Marrow Monarch', aff: 'Earth', color: '#efebe9', shape: 'stone_titan', hpMult: 79, dmgMult: 7.4,
      desc: 'A hulking creature that hardens marrow into living armor.',
      script: { phases: [
        { until: 0.5, moves: [['shield',{dur:2.5}],['slam',{r:110}],['charge',{spd:5}]] },
        { until: 0, moves: [['shield',{dur:2}],['quake',{r:160}],['volley',{n:7}]] },
      ] } } },

  { n: 'The Organ Vault', palette: P('#5a2a4a','#2a101f','#b84a8a','#140510'), gen: 'hall', monsters: ['blood_crab','shade'], effect: 'none',
    boss: { n: 'The Organist', aff: 'Blood', color: '#d81b60', shape: 'blood_beast', hpMult: 82, dmgMult: 7.5,
      desc: 'A surgeon-monster who plays organs like keys to trigger effects.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:4}],['field',{r:100}],['volley',{n:5}]] },
        { until: 0, moves: [['waves',{n:6}],['ring',{n:13}],['nova',{r:150}]] },
      ] } } },

  { n: 'The Spinal Bridge', palette: P('#4a4438','#1f1c14','#8a8268','#0c0a06'), gen: 'gauntlet', monsters: ['serpent','shade','thunder_serpent'], effect: 'none',
    boss: { n: 'The Spinal Warden', aff: 'Earth', color: '#d7ccc8', shape: 'tide_serpent', hpMult: 85, dmgMult: 7.6,
      desc: 'A centipede of vertebrae that shakes the bridge to fling you off.',
      script: { phases: [
        { until: 0.5, moves: [['quake',{r:140}],['charge',{spd:5.5}],['spread',{n:8}]] },
        { until: 0, moves: [['quake',{r:170}],['ring',{n:13}],['charge',{spd:6}]] },
      ] } } },

  { n: 'The Egg Chamber', palette: P('#5a5040','#2a2418','#c2b070','#141206'), gen: 'cave', monsters: ['spider','poison_toad'], effect: 'none',
    boss: { n: 'The Progenitor', aff: 'Nature', color: '#fff59d', shape: 'fungal_horror', hpMult: 88, dmgMult: 7.7,
      desc: 'A monstrous egg that cracks open into a hybrid horror mid-fight.',
      script: { phases: [
        { until: 0.6, moves: [['shield',{dur:2}],['summon',{types:['spider'],count:3}],['nova',{r:120}]] },
        { until: 0, moves: [['enrage',{dmgMult:1.5,spdMult:1.3}],['ring',{n:13}],['summon',{types:['spider'],count:4}],['dash',{}]] },
      ] } } },

  { n: 'The Lymph Swamp', palette: P('#4a5a5a','#1f2424','#8ad6d6','#0c1010'), gen: 'river', monsters: ['poison_toad','blood_crab'], effect: 'sinking',
    boss: { n: 'The White Cell Titan', aff: 'Water', color: '#e0f7fa', shape: 'glacier_lord', hpMult: 91, dmgMult: 7.8,
      desc: 'A guardian that mutates to counter whatever you throw at it.',
      script: { phases: [
        { until: 0.5, moves: [['shield',{dur:2}],['heal',{amt:80}],['spread',{n:7}]] },
        { until: 0, moves: [['shield',{dur:2}],['heal',{amt:60}],['ring',{n:13}],['waves',{n:4}]] },
      ] } } },

  { n: 'The Pulsing Cavern', palette: P('#5a2a2a','#2a1010','#b84a4a','#140505'), gen: 'cave', monsters: ['blood_crab','flame_imp'], effect: 'none',
    boss: { n: 'The Pulse King', aff: 'Blood', color: '#ff5252', shape: 'blood_beast', hpMult: 94, dmgMult: 7.9,
      desc: 'Controls the cavern\u2019s heartbeat to fire timed shockwaves.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:4}],['nova',{r:130}],['quake',{r:130}]] },
        { until: 0, moves: [['waves',{n:6}],['nova',{r:170}],['ring',{n:13}]] },
      ] } } },

  { n: 'The Rotten Hollow', palette: P('#3a4a1f','#16240a','#6a8a3a','#070f04'), gen: 'garden', monsters: ['poison_toad','ice_wolf'], effect: 'spores',
    boss: { n: 'The Rotfather', aff: 'Poison Gas', color: '#9e9d24', shape: 'mire_hag', hpMult: 97, dmgMult: 8.0,
      desc: 'A hulking beast shedding toxic spores that strip armor.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:110}],['cone',{}],['summon',{types:['poison_toad'],count:2}]] },
        { until: 0, moves: [['field',{r:140}],['ring',{n:13}],['waves',{n:4}]] },
      ] } } },

  { n: 'The Tendril Maze', palette: P('#4a2a5a','#1f1024','#8a4ad6','#0c0412'), gen: 'maze', monsters: ['shade','void_walker'], effect: 'darkness',
    boss: { n: 'The Tendril Core', aff: 'Darkness', color: '#7e57c2', shape: 'void_eye', hpMult: 100, dmgMult: 8.1,
      desc: 'A mass of tentacles with a single glowing weak point.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'spin'}],['pull_grav',{}],['ring',{n:10}]] },
        { until: 0, moves: [['weapon',{style:'spin'}],['pull_grav',{}],['ring',{n:14}],['nova',{r:150}]] },
      ] } } },

  { n: 'The Heartforge', palette: P('#5a2a10','#2a1306','#d65a1f','#140600'), gen: 'magma', monsters: ['lava_beast','golem'], effect: 'lavaburn',
    boss: { n: 'The Heartforged Titan', aff: 'Lava', color: '#ff6e40', shape: 'magma_lord', hpMult: 104, dmgMult: 8.2,
      desc: 'A cyborg giant with a visible beating heart of magma.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'chop'}],['pillars',{n:6}],['slam',{r:110}]] },
        { until: 0, moves: [['weapon',{style:'chop'}],['waves',{n:5}],['pillars',{n:8}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  // ===================== TIER 7 — Floors 61-70 (Cosmic / Void / Otherworldly) =====================
  { n: 'The Starfall Observatory', palette: P('#1f2a5a','#0a102a','#3a5ad6','#04061a'), gen: 'arena', monsters: ['void_walker','star_seraph'], effect: 'none',
    boss: { n: 'Astral Oracle', aff: 'Light', color: '#82b1ff', shape: 'light_avatar', hpMult: 108, dmgMult: 8.3,
      desc: 'Bends constellations into meteors and starlight beams.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:6}],['beam',{}],['ring',{n:11}]] },
        { until: 0, moves: [['pillars',{n:9}],['beam',{width:40}],['waves',{n:4}],['nova',{r:150}]] },
      ] } } },

  { n: 'The Void Rift', palette: P('#1a0d3a','#0a0420','#3a1f8a','#040210'), gen: 'arena', monsters: ['void_walker','abyss_eye'], effect: 'gravity',
    boss: { n: 'The Void Maw', aff: 'Space', color: '#651fff', shape: 'void_eye', hpMult: 112, dmgMult: 8.4,
      desc: 'A giant mouth that consumes parts of the arena into the void.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['cone',{arc:1.4}],['ring',{n:12}]] },
        { until: 0, moves: [['pull_grav',{}],['nova',{r:170}],['ring',{n:15}],['beam',{width:44}]] },
      ] } } },

  { n: 'The Cosmic Garden', palette: P('#2a1f5a','#100a2a','#6a4ad6','#06041a'), gen: 'garden', monsters: ['star_seraph','void_walker'], effect: 'radiation',
    boss: { n: 'Galaxia Bloom', aff: 'Light', color: '#b388ff', shape: 'world_tree', hpMult: 116, dmgMult: 8.5,
      desc: 'A star-flower goddess blooming radiation across the cosmos.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:110}],['ring',{n:12}],['beam',{}]] },
        { until: 0, moves: [['field',{r:140}],['ring',{n:16}],['nova',{r:160}],['heal',{amt:50}]] },
      ] } } },

  { n: 'The Comet Trail', palette: P('#1f4a5a','#0a2024','#3ad6e6','#040f10'), gen: 'river', monsters: ['ice_wolf','star_seraph'], effect: 'slippery',
    boss: { n: 'The Comet Knight', aff: 'Ice', color: '#84ffff', shape: 'frost_titan', hpMult: 120, dmgMult: 8.6,
      desc: 'Rides a spectral comet, leaving freezing trails.',
      script: { phases: [
        { until: 0.5, moves: [['charge',{spd:6}],['spread',{n:8}],['field',{r:100}]] },
        { until: 0, moves: [['charge',{spd:6.5}],['ring',{n:14}],['waves',{n:4}]] },
      ] } } },

  { n: 'The Eclipse Chamber', palette: P('#3a2a1f','#16100a','#d6a83a','#0c0804'), gen: 'arena', monsters: ['shade','star_seraph'], effect: 'darkness',
    boss: { n: 'Ecliptor', aff: 'Light', color: '#ffd740', shape: 'light_avatar', hpMult: 124, dmgMult: 8.7,
      desc: 'Shifts between blazing solar and shadowed lunar forms.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['blind',{dur:2,r:200}],['ring',{n:12}]] },
        { until: 0, moves: [['beam',{width:44}],['blind',{dur:3,r:240}],['nova',{r:160}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  { n: 'The Astral Library', palette: P('#2a2a5a','#10102a','#4a4ad6','#06061a'), gen: 'hall', monsters: ['void_walker','shade'], effect: 'gravity',
    boss: { n: 'The Star Scribe', aff: 'Arcane', color: '#536dfe', shape: 'void_eye', hpMult: 128, dmgMult: 8.8,
      desc: 'Rewrites physics mid-fight, flipping gravity as you read.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['mirror',{}],['ring',{n:12}]] },
        { until: 0, moves: [['pull_grav',{}],['mirror',{}],['beam',{width:40}],['nova',{r:160}]] },
      ] } } },

  { n: 'The Nebula Tunnel', palette: P('#3a1f5a','#16102a','#8a4ad6','#06041a'), gen: 'cave', monsters: ['void_walker','star_seraph'], effect: 'darkness',
    boss: { n: 'The Nebulord', aff: 'Space', color: '#b388ff', shape: 'void_eye', hpMult: 132, dmgMult: 8.9,
      desc: 'A shifting cloud entity dissolving visibility into dust.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:110}],['blind',{dur:2,r:220}],['ring',{n:12}]] },
        { until: 0, moves: [['field',{r:140}],['ring',{n:15}],['nova',{r:160}]] },
      ] } } },

  { n: 'The Planetarium Core', palette: P('#1f2a4a','#0a101f','#3a5ad6','#04061a'), gen: 'arena', monsters: ['star_seraph','void_walker'], effect: 'gravity',
    boss: { n: 'The Celestial Mechanic', aff: 'Space', color: '#448aff', shape: 'void_eye', hpMult: 136, dmgMult: 9.0,
      desc: 'Controls planetary orbits, raining orbiting hazards.',
      script: { phases: [
        { until: 0.5, moves: [['orbit_strafe',{}],['ring',{n:12}],['pull_grav',{}]] },
        { until: 0, moves: [['orbit_strafe',{}],['ring',{n:16}],['nova',{r:160}],['pull_grav',{}]] },
      ] } } },

  { n: 'The Black Hole Antechamber', palette: P('#0a0a2a','#040414','#2a2a6a','#020208'), gen: 'arena', monsters: ['abyss_eye','void_walker'], effect: 'gravity',
    boss: { n: 'Event Horizon', aff: 'Space', color: '#311b92', shape: 'void_eye', hpMult: 142, dmgMult: 9.2,
      desc: 'A humanoid black hole with an inescapable, constant pull.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['pull_grav',{}],['ring',{n:14}]] },
        { until: 0, moves: [['pull_grav',{}],['nova',{r:180}],['ring',{n:18}],['beam',{width:48}]] },
      ] } } },

  { n: 'The Starforge', palette: P('#5a3a10','#2a1c06','#ffab1f','#140a00'), gen: 'magma', monsters: ['lava_beast','star_seraph'], effect: 'lavaburn',
    boss: { n: 'The Sunforged Titan', aff: 'Light', color: '#ffd740', shape: 'magma_lord', hpMult: 148, dmgMult: 9.4,
      desc: 'Wields molten weapons forged in a captive sun.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'chop'}],['beam',{}],['pillars',{n:7}]] },
        { until: 0, moves: [['weapon',{style:'chop'}],['waves',{n:5}],['beam',{width:44}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  // ===================== TIER 8 — Floors 71-80 (Cosmic remainder) =====================
  { n: 'The Lunar Shrine', palette: P('#2a2a4a','#10101f','#8a8ad6','#06061a'), gen: 'crypt', monsters: ['ice_wolf','star_seraph'], effect: 'darkness',
    boss: { n: 'The Moon Priestess', aff: 'Light', color: '#c5cae9', shape: 'light_avatar', hpMult: 152, dmgMult: 9.5,
      desc: 'Summons converging moonlight beams under a cold sky.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['ring',{n:12}],['heal',{amt:70}]] },
        { until: 0, moves: [['beam',{width:44}],['ring',{n:16}],['nova',{r:160}],['heal',{amt:50}]] },
      ] } } },

  { n: 'The Cosmic Reef', palette: P('#1f4a4a','#0a2020','#3ad6c2','#041010'), gen: 'river', monsters: ['blood_crab','star_seraph'], effect: 'radiation',
    boss: { n: 'Reef Monarch', aff: 'Water', color: '#1de9b6', shape: 'tide_serpent', hpMult: 156, dmgMult: 9.6,
      desc: 'A giant cosmic crustacean amid drifting radiation pockets.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:110}],['spread',{n:8}],['dash',{}]] },
        { until: 0, moves: [['field',{r:140}],['ring',{n:16}],['waves',{n:4}]] },
      ] } } },

  { n: 'The Time Fracture', palette: P('#3a3a1f','#16160a','#d6d63a','#0c0c04'), gen: 'maze', monsters: ['void_walker','shade'], effect: 'confusion',
    boss: { n: 'Chronosplit', aff: 'Time', color: '#ffd54f', shape: 'chrono_phantom', hpMult: 160, dmgMult: 9.7,
      desc: 'Exists in three timelines at once, attacking from each.',
      script: { phases: [
        { until: 0.5, moves: [['teleport',{}],['volley',{n:5}],['mirror',{}]] },
        { until: 0, moves: [['teleport',{}],['ring',{n:14}],['blink_strike',{}],['nova',{r:160}]] },
      ] } } },

  { n: 'The Meteor Crater', palette: P('#4a2a10','#1f1306','#d65a1f','#0c0600'), gen: 'magma', monsters: ['lava_beast','flame_imp'], effect: 'lavaburn',
    boss: { n: 'The Meteor Titan', aff: 'Fire', color: '#ff6e40', shape: 'magma_lord', hpMult: 164, dmgMult: 9.8,
      desc: 'Hurls burning rocks that rain across the crater.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:7}],['slam',{r:120}],['spread',{n:8}]] },
        { until: 0, moves: [['pillars',{n:10}],['waves',{n:5}],['ring',{n:14}]] },
      ] } } },

  { n: 'The Aurora Cavern', palette: P('#1f4a3a','#0a2016','#3ad68a','#04100a'), gen: 'cave', monsters: ['ice_wolf','star_seraph'], effect: 'slippery',
    boss: { n: 'Aurora Spirit', aff: 'Light', color: '#64ffda', shape: 'light_avatar', hpMult: 168, dmgMult: 9.9,
      desc: 'Bends shimmering light into sweeping lasers.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['beam',{}],['ring',{n:12}]] },
        { until: 0, moves: [['beam',{width:44}],['ring',{n:16}],['nova',{r:160}]] },
      ] } } },

  { n: 'The Rift Cathedral', palette: P('#2a1f4a','#100a1f','#5a4ad6','#06041a'), gen: 'crypt', monsters: ['void_walker','shade'], effect: 'gravity',
    boss: { n: 'The Rift Bishop', aff: 'Space', color: '#7c4dff', shape: 'phantom_bishop', hpMult: 172, dmgMult: 10.0,
      desc: 'Phases in and out of reality between dimensions.',
      script: { phases: [
        { until: 0.5, moves: [['teleport',{}],['beam',{}],['ring',{n:12}]] },
        { until: 0, moves: [['teleport',{}],['blink_strike',{}],['ring',{n:16}],['nova',{r:160}]] },
      ] } } },

  { n: 'The Starless Abyss', palette: P('#050510','#020208','#1a1a3a','#000004'), gen: 'maze', monsters: ['abyss_eye','void_walker'], effect: 'darkness',
    boss: { n: 'The Nightfather', aff: 'Darkness', color: '#311b92', shape: 'void_eye', hpMult: 176, dmgMult: 10.2,
      desc: 'A massive shadow with glowing eyes in total blackness.',
      script: { phases: [
        { until: 0.5, moves: [['blind',{dur:3,r:240}],['ring',{n:12}],['dash',{}]] },
        { until: 0, moves: [['blind',{dur:4,r:280}],['ring',{n:16}],['nova',{r:170}],['enrage',{dmgMult:1.4,spdMult:1.2}]] },
      ] } } },

  { n: 'The Cosmic Clocktower', palette: P('#3a2a1f','#16100a','#d6a83a','#0c0804'), gen: 'gauntlet', monsters: ['void_walker','golem'], effect: 'confusion',
    boss: { n: 'The Chrono Warden', aff: 'Time', color: '#ffca28', shape: 'chrono_phantom', hpMult: 180, dmgMult: 10.4,
      desc: 'Reverses your actions and rewinds its own wounds.',
      script: { phases: [
        { until: 0.5, moves: [['heal',{amt:90}],['volley',{n:6}],['teleport',{}]] },
        { until: 0, moves: [['heal',{amt:70}],['ring',{n:16}],['quake',{r:160}]] },
      ] } } },

  { n: 'The Void Garden', palette: P('#1a0d3a','#0a0420','#4a2f8a','#040210'), gen: 'garden', monsters: ['void_walker','shade'], effect: 'darkness',
    boss: { n: 'The Void Gardener', aff: 'Darkness', color: '#651fff', shape: 'world_tree', hpMult: 184, dmgMult: 10.6,
      desc: 'Harvests shadows that bloom into darkness across the garden.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:120}],['blind',{dur:2,r:220}],['ring',{n:13}]] },
        { until: 0, moves: [['field',{r:150}],['ring',{n:17}],['nova',{r:170}]] },
      ] } } },

  { n: 'The Astral Coliseum', palette: P('#2a2a5a','#10102a','#5a5ad6','#06061a'), gen: 'arena', monsters: ['star_seraph','void_walker'], effect: 'none',
    boss: { n: 'The Star Champion', aff: 'Light', color: '#536dfe', shape: 'light_avatar', hpMult: 188, dmgMult: 10.8,
      desc: 'A cosmic warrior cycling through rotating arena hazards.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'slash'}],['pillars',{n:7}],['beam',{}]] },
        { until: 0, moves: [['weapon',{style:'spin'}],['pillars',{n:10}],['ring',{n:16}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  // ===================== TIER 9 — Floors 81-90 (Traps / Castle / Underwater / Sky) =====================
  { n: 'The Trap Cathedral', palette: P('#3a3a2a','#161610','#7a7a4a','#070706'), gen: 'gauntlet', monsters: ['golem','shade'], effect: 'none',
    boss: { n: 'The Trapmaster', aff: 'Metal', color: '#cddc39', shape: 'iron_giant', hpMult: 192, dmgMult: 11.0,
      desc: 'Controls every mechanism — blades, pits, and crushers.',
      script: { phases: [
        { until: 0.5, moves: [['pillars',{n:8}],['slam',{r:120}],['weapon',{style:'spin'}]] },
        { until: 0, moves: [['pillars',{n:12}],['quake',{r:170}],['ring',{n:16}]] },
      ] } } },

  { n: 'The Royal Menagerie', palette: P('#4a2a1f','#1f1310','#b86a3a','#0c0804'), gen: 'arena', monsters: ['ice_wolf','spider','lava_beast'], effect: 'none',
    boss: { n: 'The Beast King', aff: 'Earth', color: '#ff8f00', shape: 'scarab_lord', hpMult: 196, dmgMult: 11.2,
      desc: 'Rides a chimera, releasing caged beasts into the fray.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['ice_wolf','spider'],count:3}],['charge',{spd:6}],['spread',{n:8}]] },
        { until: 0, moves: [['summon',{types:['lava_beast','spider'],count:3}],['quake',{r:160}],['ring',{n:15}]] },
      ] } } },

  { n: 'The Flooded Ballroom', palette: P('#1f3a5a','#0a1824','#3a7ad6','#040c1a'), gen: 'river', monsters: ['blood_crab','thunder_serpent'], effect: 'sinking',
    boss: { n: 'The Drowned Duchess', aff: 'Water', color: '#40a4ff', shape: 'tide_serpent', hpMult: 200, dmgMult: 11.4,
      desc: 'Summons tidal waves across the half-submerged dancefloor.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:5}],['field',{r:110}],['spread',{n:8}]] },
        { until: 0, moves: [['waves',{n:7}],['ring',{n:16}],['nova',{r:170}]] },
      ] } } },

  { n: 'The Sky Bridge', palette: P('#3a5a7a','#16242a','#7ad6f6','#071018'), gen: 'gauntlet', monsters: ['storm_wraith','bat'], effect: 'none',
    boss: { n: 'The Cloud Wyrm', aff: 'Air', color: '#80d8ff', shape: 'tide_serpent', hpMult: 204, dmgMult: 11.6,
      desc: 'Swoops from above the clouds, shoving you toward the edge.',
      script: { phases: [
        { until: 0.5, moves: [['charge',{spd:6.5}],['quake',{r:140}],['spread',{n:8}]] },
        { until: 0, moves: [['charge',{spd:7}],['ring',{n:16}],['waves',{n:5}]] },
      ] } } },

  { n: 'The Coral Palace', palette: P('#1f5a5a','#0a2424','#3ad6d6','#041010'), gen: 'river', monsters: ['blood_crab','star_seraph'], effect: 'sinking',
    boss: { n: 'The Coral Queen', aff: 'Water', color: '#26c6da', shape: 'glacier_lord', hpMult: 208, dmgMult: 11.8,
      desc: 'Controls tidal currents under crushing water pressure.',
      script: { phases: [
        { until: 0.5, moves: [['waves',{n:5}],['field',{r:110}],['pull_grav',{}]] },
        { until: 0, moves: [['waves',{n:7}],['ring',{n:16}],['nova',{r:170}]] },
      ] } } },

  { n: 'The Lightning Tower', palette: P('#2a2a6a','#10102a','#5a6af6','#06061a'), gen: 'arena', monsters: ['thunder_serpent','storm_wraith'], effect: 'none',
    boss: { n: 'The Stormlord', aff: 'Lightning', color: '#536dfe', shape: 'storm_king', hpMult: 212, dmgMult: 12.0,
      desc: 'Channels lightning through his staff in chaining bolts.',
      script: { phases: [
        { until: 0.5, moves: [['chain',{hops:5}],['beam',{}],['ring',{n:12}]] },
        { until: 0, moves: [['chain',{hops:7}],['ring',{n:16}],['beam',{width:44}]] },
      ] } } },

  { n: 'The Poison Bog', palette: P('#2a4a1f','#10240a','#5ad63a','#04100a'), gen: 'garden', monsters: ['poison_toad','ice_wolf'], effect: 'spores',
    boss: { n: 'The Bog Witch', aff: 'Poison Gas', color: '#aeea00', shape: 'mire_hag', hpMult: 216, dmgMult: 12.2,
      desc: 'Brews toxic storms that blanket the bog.',
      script: { phases: [
        { until: 0.5, moves: [['field',{r:120}],['cone',{}],['summon',{types:['poison_toad'],count:2}]] },
        { until: 0, moves: [['field',{r:150}],['ring',{n:16}],['waves',{n:5}]] },
      ] } } },

  { n: 'The Clockwork Dungeon', palette: P('#4a3a2a','#1f1710','#8a6a3a','#0c0905'), gen: 'gauntlet', monsters: ['golem','goblin'], effect: 'none',
    boss: { n: 'The Clockwork Emperor', aff: 'Metal', color: '#ffb300', shape: 'iron_giant', hpMult: 220, dmgMult: 12.4,
      desc: 'Pilots a giant mech of crushing, grinding gears.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'spin'}],['pillars',{n:8}],['charge',{spd:6}]] },
        { until: 0, moves: [['weapon',{style:'spin'}],['quake',{r:170}],['volley',{n:8}],['enrage',{dmgMult:1.3,spdMult:1.2}]] },
      ] } } },

  { n: 'The Mirage Desert', palette: P('#5a4a1f','#2a230a','#d6b23a','#140f04'), gen: 'hall', monsters: ['scarab_lord','shade'], effect: 'confusion',
    boss: { n: 'The Mirage Djinn', aff: 'Air', color: '#ffd54f', shape: 'dust_djinn', hpMult: 224, dmgMult: 12.6,
      desc: 'Creates fake copies of itself amid the shimmering heat.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['shade'],count:3}],['teleport',{}],['spread',{n:8}]] },
        { until: 0, moves: [['summon',{types:['shade'],count:3}],['ring',{n:16}],['blink_strike',{}]] },
      ] } } },

  { n: 'The Frozen Citadel', palette: P('#1f3a5a','#0a1824','#3a7ad6','#040c1a'), gen: 'crypt', monsters: ['ice_wolf','golem'], effect: 'blizzard',
    boss: { n: 'The Ice Emperor', aff: 'Ice', color: '#40c4ff', shape: 'frost_titan', hpMult: 228, dmgMult: 12.8,
      desc: 'Summons blizzards and freezing winds across the citadel.',
      script: { phases: [
        { until: 0.5, moves: [['blizzard_call',{}],['spread',{n:9}],['slam',{r:120}]] },
        { until: 0, moves: [['blizzard_call',{}],['ring',{n:16}],['waves',{n:5}],['heal',{amt:60}]] },
      ] } } },

  // ===================== TIER 10 — Floors 91-100 (Finale) =====================
  { n: 'The Lava Throne', palette: P('#5a1f08','#2a0f04','#ff5a1f','#140500'), gen: 'magma', monsters: ['lava_beast','flame_imp'], effect: 'lavaburn',
    boss: { n: 'The Flame Tyrant', aff: 'Lava', color: '#ff3d00', shape: 'magma_lord', hpMult: 234, dmgMult: 13.0,
      desc: 'Wields molten weapons from a throne ringed in lava.',
      script: { phases: [
        { until: 0.5, moves: [['weapon',{style:'chop'}],['pillars',{n:8}],['waves',{n:4}]] },
        { until: 0, moves: [['weapon',{style:'chop'}],['waves',{n:6}],['pillars',{n:12}],['enrage',{dmgMult:1.4,spdMult:1.2}]] },
      ] } } },

  { n: 'The Maze of Chains', palette: P('#3a3a3a','#161616','#7a7a7a','#070707'), gen: 'maze', monsters: ['golem','shade'], effect: 'darkness',
    boss: { n: 'The Chain Warden', aff: 'Metal', color: '#bdbdbd', shape: 'iron_giant', hpMult: 240, dmgMult: 13.3,
      desc: 'Swings massive chains that grab and reel you in.',
      script: { phases: [
        { until: 0.5, moves: [['pull_grav',{}],['weapon',{style:'spin'}],['slam',{r:120}]] },
        { until: 0, moves: [['pull_grav',{}],['weapon',{style:'spin'}],['quake',{r:170}],['ring',{n:15}]] },
      ] } } },

  { n: 'The Thunder Plains', palette: P('#2a2a5a','#10102a','#5a6ad6','#06061a'), gen: 'arena', monsters: ['thunder_serpent','storm_wraith'], effect: 'none',
    boss: { n: 'The Thunder Titan', aff: 'Lightning', color: '#448aff', shape: 'storm_king', hpMult: 246, dmgMult: 13.6,
      desc: 'Stomps to send shockwaves rolling across the plains.',
      script: { phases: [
        { until: 0.5, moves: [['quake',{r:150}],['chain',{hops:5}],['ring',{n:13}]] },
        { until: 0, moves: [['quake',{r:180}],['chain',{hops:7}],['ring',{n:17}],['beam',{width:44}]] },
      ] } } },

  { n: 'The Crystal Cavern', palette: P('#2a1f5a','#100a2a','#6a4ad6','#06041a'), gen: 'cave', monsters: ['golem','star_seraph'], effect: 'darkness',
    boss: { n: 'The Crystal Dragon', aff: 'Light', color: '#b388ff', shape: 'inferno_wyrm', hpMult: 252, dmgMult: 13.9,
      desc: 'Fires refracted beams that split through the crystals.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['spread',{n:9}],['charge',{spd:6}]] },
        { until: 0, moves: [['beam',{width:48}],['ring',{n:17}],['waves',{n:5}]] },
      ] } } },

  { n: 'The Haunted Barracks', palette: P('#3a3a2a','#161610','#6a6a4a','#070706'), gen: 'gauntlet', monsters: ['shade','golem'], effect: 'silence',
    boss: { n: 'The Fallen General', aff: 'Darkness', color: '#9e9e9e', shape: 'phantom_bishop', hpMult: 258, dmgMult: 14.2,
      desc: 'Commands ghost troops behind a fear aura.',
      script: { phases: [
        { until: 0.5, moves: [['summon',{types:['shade'],count:3}],['weapon',{style:'thrust'}],['volley',{n:6}]] },
        { until: 0, moves: [['summon',{types:['shade'],count:4}],['ring',{n:16}],['blink_strike',{}]] },
      ] } } },

  { n: 'The Iron Prison', palette: P('#3a3a3a','#161616','#6a7a8a','#070708'), gen: 'gauntlet', monsters: ['golem','serpent'], effect: 'none',
    boss: { n: 'The Warden Construct', aff: 'Metal', color: '#90a4ae', shape: 'iron_giant', hpMult: 264, dmgMult: 14.5,
      desc: 'A giant metal golem; the walls close in as you fight.',
      script: { phases: [
        { until: 0.5, moves: [['shield',{dur:2.5}],['slam',{r:130}],['charge',{spd:6}]] },
        { until: 0, moves: [['shield',{dur:2}],['quake',{r:180}],['volley',{n:8}],['pull_grav',{}]] },
      ] } } },

  { n: 'The Labyrinth of Fog', palette: P('#3a3a4a','#16161f','#6a6a8a','#070710'), gen: 'maze', monsters: ['shade','void_walker'], effect: 'darkness',
    boss: { n: 'The Fog Reaper', aff: 'Darkness', color: '#b0bec5', shape: 'hollow_queen', hpMult: 270, dmgMult: 14.8,
      desc: 'Appears silently behind you out of the thick fog.',
      script: { phases: [
        { until: 0.5, moves: [['blink_strike',{}],['blind',{dur:3,r:240}],['teleport',{}]] },
        { until: 0, moves: [['blink_strike',{}],['ring',{n:16}],['blink_strike',{}],['nova',{r:170}]] },
      ] } } },

  { n: 'The Radiant Sanctum', palette: P('#5a5a3a','#2a2a16','#fff176','#14140a'), gen: 'hall', monsters: ['star_seraph','golem'], effect: 'none',
    boss: { n: 'The Radiant Seraph', aff: 'Light', color: '#ffee58', shape: 'light_avatar', hpMult: 278, dmgMult: 15.2,
      desc: 'Fires blinding beams of holy light from on high.',
      script: { phases: [
        { until: 0.5, moves: [['beam',{}],['blind',{dur:2,r:220}],['ring',{n:14}]] },
        { until: 0, moves: [['beam',{width:48}],['blind',{dur:3,r:260}],['nova',{r:180}],['ring',{n:18}]] },
      ] } } },

  { n: 'The Abyssal Staircase', palette: P('#0a0a1a','#040410','#2a2a4a','#000004'), gen: 'gauntlet', monsters: ['abyss_eye','void_walker'], effect: 'darkness',
    boss: { n: 'The Abyss Walker', aff: 'Space', color: '#311b92', shape: 'void_eye', hpMult: 286, dmgMult: 15.6,
      desc: 'Teleports between shadows descending into the dark.',
      script: { phases: [
        { until: 0.5, moves: [['teleport',{}],['blink_strike',{}],['ring',{n:14}]] },
        { until: 0, moves: [['teleport',{}],['nova',{r:180}],['blink_strike',{}],['ring',{n:18}]] },
      ] } } },

  { n: 'The Final Gate', palette: P('#5a1f1f','#2a0a0a','#ff1744','#140202'), gen: 'arena', monsters: ['star_seraph','abyss_eye','void_walker'], effect: 'silence',
    boss: { n: 'The Gate Guardian', aff: 'Time', color: '#ff1744', shape: 'krezcent', hpMult: 320, dmgMult: 16.5,
      desc: 'A colossal armored titan that tests every skill you have learned.',
      script: { phases: [
        { until: 0.66, moves: [['weapon',{style:'slash'}],['beam',{}],['summon',{types:['void_walker'],count:2}],['ring',{n:14}]] },
        { until: 0.33, moves: [['enrage',{dmgMult:1.3,spdMult:1.2}],['waves',{n:5}],['pillars',{n:10}],['chain',{hops:6}],['nova',{r:170}]] },
        { until: 0, moves: [['enrage',{dmgMult:1.3,spdMult:1.3}],['ring',{n:20}],['beam',{width:50}],['blink_strike',{}],['quake',{r:200}],['waves',{n:6}]] },
      ] } } },
];

// floor number (1-100) -> entry (clamped)
export function floorDef(floor) {
  const idx = Math.max(0, Math.min(FLOORS.length - 1, floor - 1));
  return FLOORS[idx];
}

// Theme object compatible with the old THEMES shape (name + colors).
export function floorTheme(floor) {
  const d = floorDef(floor);
  return { name: d.n, wall: d.palette.wall, floor: d.palette.floor, accent: d.palette.accent, bg: d.palette.bg };
}

// Boss definition for a floor, normalized to the shape initBoss expects.
export function floorBoss(floor) {
  const d = floorDef(floor);
  const b = d.boss;
  return {
    n: b.n, color: b.color, aff: b.aff, shape: b.shape,
    hpMult: b.hpMult, dmgMult: b.dmgMult, desc: b.desc,
    script: b.script, scripted: true,
    unique: floor % 10 === 0,
  };
}

export function floorLayout(floor) { return floorDef(floor).gen; }
export function floorEffect(floor) { return floorDef(floor).effect; }