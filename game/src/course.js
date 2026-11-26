// TRADEWIND RUN — the course: terrain, islands, landmarks, rings and the runway.
// One job: given a mission, build a fixed, seeded world and answer questions about it
// (ground height at a point, next ring, wind at a point, runway geometry).

import { COURSE, MISSIONS } from './config.js';
import { mulberry32, makeNoise2D } from './random.js';

// Landmark kinds the renderer draws as code art.
export const LANDMARKS = {
  volcano: { label: 'ASHFALL PEAK', height: 1500 },
  lighthouse: { label: 'LIGHTHOUSE ISLAND', height: 260 },
  bridge: { label: 'MERIDIAN BRIDGE', height: 320 },
  city: { label: 'PORT MERIDIAN', height: 420 },
  runway: { label: 'RUNWAY 09', height: 40 },
};

export function buildCourse(missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  const rand = mulberry32(mission.seed);
  const noise = makeNoise2D(rand, 10, 3);
  const L = COURSE.length;

  // Island centres: fixed layout along the course so every mission reads the same map,
  // with heights jittered by seed. x is lateral metres from the course centreline.
  const islands = [
    { x: -620, z: 1100, r: 520, h: 700, kind: 'hill' },
    { x: 540, z: 2100, r: 460, h: 1500, kind: 'volcano' },
    { x: -480, z: 3400, r: 420, h: 260, kind: 'lighthouse' },
    { x: 300, z: 4700, r: 560, h: 320, kind: 'bridge' },
    { x: -350, z: 6100, r: 640, h: 420, kind: 'city' },
    { x: 0, z: 8300, r: 900, h: 40, kind: 'runway' }, // the home island
  ];

  // Ground height in feet at world (x, z). Sea is 0; islands rise smoothly.
  function groundHeight(x, z) {
    let h = 0;
    for (const isl of islands) {
      const dx = (x - isl.x) / isl.r;
      const dz = (z - isl.z) / (isl.r * 1.6);
      const d2 = dx * dx + dz * dz;
      if (d2 < 1) {
        const fall = Math.cos(d2 * Math.PI * 0.5); // 1 at centre, 0 at edge
        h += isl.h * fall * fall;
      }
    }
    // Gentle rolling swell between islands, never above 120 ft.
    h += 60 + 60 * noise(x / 2400 + 7, z / 2400 + 3);
    return Math.max(0, h);
  }

  // Rings: evenly spaced along the course, weaving left/right and up/down so the
  // pilot has to fly, not just hold the stick. Courier: pickup ring at the lighthouse
  // island, then two guide rings toward home.
  const rings = [];
  const n = mission.rings;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    let z = 900 + t * (L - 1900);
    let x = Math.sin(t * Math.PI * 2.2 + mission.seed) * 420;
    let y = 420 + Math.sin(t * Math.PI * 3.1) * 260 + i * 18;
    if (mission.id === 'courier') {
      // Ring 0 is the mail pickup over Lighthouse Island; the rest guide home.
      if (i === 0) { x = -480; z = 3400; y = 520; }
      else { x = -200 + i * 120; z = 4800 + i * 1400; y = 480 - i * 60; }
    }
    // Keep rings clear of the ground and of the volcano.
    y = Math.max(y, groundHeight(x, z) + 260);
    rings.push({ x, y, z, r: 150, passed: false, missed: false, centre: false });
  }

  const runway = {
    x: 0, z: L - 450, length: 900, width: 46,
    heading: 90, // runway 09: the course runs east
    numbers: '09',
  };

  // Wind: steady crosswind plus gusts (storm only). Returns lateral push in m/s.
  function windAt(z, time) {
    const base = mission.wind;
    if (!mission.gusts) return base;
    // Gusts: slow sine swell plus a faster chop, both seeded by course position.
    const swell = Math.sin(time * 0.5 + z * 0.001) * 5;
    const chop = Math.sin(time * 2.3 + z * 0.004) * 3;
    return base + swell + chop;
  }

  return {
    mission,
    islands,
    rings,
    runway,
    groundHeight,
    windAt,
    // Next ring the pilot must fly through (first unpassed, unmissed one).
    nextRing() {
      return rings.find((r) => !r.passed && !r.missed) || null;
    },
    ringsLeft() {
      return rings.filter((r) => !r.passed && !r.missed).length;
    },
    // Distance along the course to the runway threshold.
    distanceToRunway(z) {
      return Math.max(0, runway.z - runway.length / 2 - z);
    },
  };
}
