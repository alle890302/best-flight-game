// TRADEWIND RUN — tuning constants, missions and palette.
// One job: every number the rest of the game reads, in one place.

export const VIEW = { W: 1280, H: 720 };

export const PLANE = {
  // Speeds in knots; altitudes in feet; distances in metres.
  minSpeed: 45,        // below this the wing quits (stall)
  stallSpeed: 55,      // warning starts here
  maxSpeed: 185,       // level-flight top speed at full throttle
  cruiseSpeed: 120,
  climbRate: 9,        // ft/s at full power, best climb
  sinkRate: 14,        // ft/s at idle, wings level
  turnRate: 0.45,      // deg/s of heading change per degree of bank at cruise
  pitchRate: 0.35,     // rad/s of flight-path change
  accel: 22,           // kt/s toward throttle target speed
  drag: 0.35,          // extra kt/s bled in a hard climb
  fuelCapacity: 100,   // percent
  fuelBurn: 0.55,      // %/s at full throttle (scaled by throttle)
  fuelBurnIdle: 0.06,  // %/s at idle
  damagePerHardLanding: 34,
  runwayLength: 900,   // metres of tarmac
  runwayWidth: 46,
};

// Course length in metres; the plane starts at z=0 and the runway sits at z=COURSE.
export const COURSE = { length: 9000, width: 2600, seaLevel: 0 };

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tag: '8 rings, beat the clock',
    seed: 101,
    rings: 8,
    timeLimit: 150,   // seconds
    ringTimeBonus: 8, // seconds added per ring
    fuel: 100,
    wind: 0,          // m/s crosswind
    gusts: 0,
    briefing: 'Thread all 8 rings in order, then put her down on runway 09. Centre of a ring pays double.',
  },
  {
    id: 'courier',
    name: 'COURIER RUN',
    tag: 'pick up the mail, deliver it',
    seed: 202,
    rings: 3,         // pickup ring + 2 guide rings
    timeLimit: 170,
    ringTimeBonus: 0,
    fuel: 62,         // tight on purpose: throttle discipline decides it
    wind: 4,
    gusts: 0,
    briefing: 'Low pass through the mail ring at Lighthouse Island, then deliver to runway 09 before the clock dies. Fuel is tight — don\'t fly flat out.',
  },
  {
    id: 'storm',
    name: 'STORM RUN',
    tag: 'rings in a crosswind',
    seed: 303,
    rings: 8,
    timeLimit: 165,
    ringTimeBonus: 8,
    fuel: 78,
    wind: 11,
    gusts: 1,
    briefing: 'Same 8 rings, now in a crosswind with gusts. The wind shoves you sideways and shakes the camera. Fly the crab, not the fight.',
  },
];

// Landing score breakdown (mirrors the classic 1000-point landing scale).
export const LANDING_SCORE = {
  smoothness: 300,  // touchdown vertical speed
  centreline: 200,  // lateral distance from runway centre
  zone: 150,        // touchdown inside the target zone
  approachSpeed: 120,
  bank: 100,
  alignment: 80,
  rollout: 50,
};

export const RING_SCORE = { centre: 100, edge: 50, miss: -50 };

// Dawn palette — one style for sky, sea and terrain.
export const PALETTE = {
  skyTop: '#2b4a7a',
  skyMid: '#e8906a',
  skyLow: '#f7c98b',
  sun: '#ffd98a',
  sunCore: '#fff3c4',
  seaDeep: '#16365c',
  seaShallow: '#2f6d8f',
  sand: '#e8d9a0',
  grass: '#5d8a4a',
  rock: '#7a6a58',
  snow: '#f2f0ea',
  cloud: 'rgba(255,244,230,0.85)',
  runway: '#3a3f46',
  runwayMark: '#f5f2e8',
  ringNext: '#ff4fd8',
  ringPassed: '#37e08b',
  ringMissed: '#8a8f96',
  hudAmber: '#ffb454',
  hudGreen: '#7dffb0',
  hudRed: '#ff5d5d',
  hudCyan: '#8fd8ff',
  panel: 'rgba(10,16,28,0.72)',
  panelEdge: 'rgba(143,216,255,0.35)',
};
