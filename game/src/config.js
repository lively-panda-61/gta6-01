// Port Solano — tuning, layout and palette.
// One source of truth for the city grid, districts, colours and gameplay
// tuning, shared by the city builder, the HUD minimap and the missions.
export const WORLD = {
  size: 480, // the ground plane, centred on 0,0
  blockPitch: 48, // block (36) + road (12)
  roadWidth: 12,
  blockSize: 36,
  half: 240,
};

// Road centre lines (the grid is symmetric, so one list serves both axes).
export const ROAD_LINES = [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216];

// Districts: name, rectangle, building style, palette hint.
export const DISTRICTS = [
  { name: 'Downtown', x0: -72, z0: -72, x1: 72, z1: 72, style: 'tower', height: [42, 95] },
  { name: 'Old Town', x0: -216, z0: -216, x1: -72, z1: 72, style: 'oldtown', height: [8, 18] },
  { name: 'North Hills', x0: -72, z0: -216, x1: 216, z1: -72, style: 'villa', height: [7, 14] },
  { name: 'East Port', x0: 72, z0: -72, x1: 216, z1: 144, style: 'port', height: [6, 16] },
  { name: 'Marina', x0: -216, z0: 72, x1: 72, z1: 216, style: 'marina', height: [10, 26] },
  { name: 'South Beach', x0: 72, z0: 144, x1: 216, z1: 216, style: 'beach', height: [8, 20] },
];

export const WATER = { x0: -240, z0: 216, x1: 240, z1: 240 }; // the bay, south edge

export const LANDMARKS = [
  { name: 'Solano Tower', x: 0, z: -24, kind: 'tower' },
  { name: 'Harbor Stadium', x: -168, z: 24, kind: 'stadium' },
  { name: 'Sunset Pier', x: -120, z: 216, kind: 'pier' },
  { name: 'Port Cranes', x: 168, z: 24, kind: 'cranes' },
  { name: 'Civic Plaza', x: 24, z: 24, kind: 'plaza' },
];

export const STREET_NAMES = [
  'Palma Avenue', 'Coral Street', 'Harbor Boulevard', 'Solano Drive',
  'Marina Way', 'Jacaranda Lane', 'Cannon Row', 'Sunset Strip',
  'Vista Road', 'Anchor Street', 'Loma Avenue', 'Pier Street',
];

export const PALETTE = {
  sky: 0x8ec9e8,
  sun: 0xffe3b3,
  ground: 0x9aa578,
  sand: 0xe8d29a,
  water: 0x2e7f9e,
  asphalt: 0x3a3d42,
  sidewalk: 0xb9b3a4,
  buildingGlass: 0x6fa8c8,
};

export const TUNING = {
  playerWalkSpeed: 6.5,
  playerSprintSpeed: 10,
  playerHealth: 100,
  carAccel: 14,
  carBrake: 26,
  carMaxSpeed: 38,
  carMaxReverse: 12,
  carSteer: 0.55,
  trafficCount: 14,
  pedestrianCount: 18,
  policeResponseSeconds: 4,
  wantedDecaySeconds: 18,
  pistolDamage: 34,
  pistolRange: 70,
  enemyHealth: 60,
  missionRewardBase: 500,
};

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[0];
}

export function streetNameAt(x) {
  const idx = Math.abs(Math.floor((x + 240) / 48)) % STREET_NAMES.length;
  return STREET_NAMES[idx];
}
