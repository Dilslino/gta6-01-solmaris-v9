// Solmaris — tuning numbers and world coordinates in one place.
// The island city is a 560 x 560 m grid centred on the origin; north is -Z.
// Roads run every 60 m; buildings fill the blocks between them.

export const STEP = 1 / 60;

export const WORLD = {
  half: 280,
  roadWidth: 12,
  roadsX: [-180, -120, -60, 0, 60, 120, 180],
  roadsZ: [-240, -180, -120, -60, 0, 60, 120, 180, 240],
  // The two coordinates the whole game is built around (R7/R8 lesson):
  northDropoff: { x: 0, z: -210 },
  parkingGarage: { x: 175, z: -105 },
  spawn: { x: 0, z: 30 },
};

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 9,
  radius: 0.6,
  height: 1.8,
  maxHealth: 100,
  turnSpeed: 10,
};

export const CAR = {
  maxSpeed: 14,
  reverseSpeed: 6,
  accel: 10,
  brake: 18,
  // Arcade steering: the turn rate stays high at full speed so a U-turn
  // always fits in a road width (R7/R8 lesson — never a sim-style lockout).
  turnRate: 1.9,
  minTurnFactor: 0.55,
};

export const POLICE = {
  maxCars: 2,
  chaseSpeed: 13,
  ramDamage: 8,
  ramCooldown: 1.2,
};

export const HELI = {
  height: 55,
  hp: 200,
  spottedRise: 0.5,
  spottedFall: 0.6,
  searchRange: 110,
};

export const WEAPON = {
  damage: 25,
  guardHp: 75,
  fireCooldown: 0.22,
  range: 220,
  // The aim ray may pitch up this far so the player can shoot the helicopter.
  maxPitchDeg: 77,
};

export const MISSIONS = [
  {
    id: 1,
    name: 'Sunset Pickup',
    brief: 'Grab the crate at the Marina, then deliver it to the North Drop-off.',
    reward: 300,
    steps: [
      { kind: 'goto', label: 'Pick up the crate at the Marina', x: 60, z: 180, radius: 4 },
      { kind: 'goto', label: 'Deliver to the North Drop-off', x: 0, z: -210, radius: 5 },
    ],
  },
  {
    id: 2,
    name: 'Sunset Cab',
    brief: 'Pick up the passenger on 2nd Ave, drop them at East Beach.',
    reward: 350,
    steps: [
      { kind: 'goto', label: 'Pick up the passenger', x: -120, z: 60, radius: 4 },
      { kind: 'goto', label: 'Drop the passenger at East Beach', x: 180, z: 120, radius: 5 },
    ],
  },
  {
    id: 3,
    name: 'Three Drops',
    brief: 'Collect the three cash bags stashed around the city, in any order.',
    reward: 400,
    steps: [
      { kind: 'collect', label: 'Cash bag 1 of 3', x: -180, z: -60, radius: 4 },
      { kind: 'collect', label: 'Cash bag 2 of 3', x: 120, z: -180, radius: 4 },
      { kind: 'collect', label: 'Cash bag 3 of 3', x: 60, z: 120, radius: 4 },
    ],
  },
  {
    id: 4,
    name: 'Downtown Dash',
    brief: 'A short walkable run: plaza to the corner shop. A car is parked nearby if you want it.',
    reward: 300,
    steps: [
      { kind: 'goto', label: 'Pick up the parcel at Central Plaza', x: -30, z: -30, radius: 4 },
      { kind: 'goto', label: 'Deliver to the corner shop', x: 40, z: -60, radius: 4 },
    ],
  },
  {
    id: 5,
    name: 'Dock Shootout',
    brief: 'Three guards hold the stash at the West Docks. Take them down, then grab it.',
    reward: 500,
    steps: [
      { kind: 'shoot', label: 'Eliminate the dock guards (0/3)', x: -200, z: 120, radius: 6, guards: 3 },
      { kind: 'goto', label: 'Grab the stash', x: -210, z: 140, radius: 4 },
    ],
  },
  {
    id: 6,
    name: 'Heli Down',
    brief: 'Wanted level 3 — a police helicopter is on you. Shoot it down.',
    reward: 600,
    steps: [
      { kind: 'heli', label: 'Shoot down the police helicopter', x: 0, z: 0, radius: 10 },
    ],
  },
];

export const PALETTE = {
  skyTop: 0x2a1e5e,
  skyHorizon: 0xff7e3d,
  sun: 0xffb347,
  fog: 0xe8834f,
  ground: 0x8a7a5a,
  road: 0x3a3a44,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a938a,
  water: 0x1d4e6b,
  sand: 0xd9b380,
  building: [0x6b5b8f, 0x8f5b6b, 0x5b7a8f, 0x7a6b4f, 0x4f6b5b, 0x9a7a5a],
  windowLit: 0xffd27a,
  windowDark: 0x2c3242,
  carColors: [0xc0392b, 0x2980b9, 0xf39c12, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x1abc9c],
  policeCar: 0x1c2733,
  heli: 0x222a35,
  marker: 0xffe14d,
  player: 0x35d0ff,
};

export const SAVE_KEY = 'solmaris.save.v9';
