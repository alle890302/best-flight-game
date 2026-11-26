// TRADEWIND RUN — the flight model.
// One job: turn pilot inputs into motion, and decide what the flight costs
// (fuel, damage, stall) and how a landing scores.

import { PLANE, LANDING_SCORE } from './config.js';

const KT_TO_MS = 0.514444;   // knots to metres per second
const FT_TO_M = 0.3048;

// Fresh aircraft state at the start of a sortie.
export function freshPlane(course, mission) {
  return {
    x: 0, y: 600, z: 0,        // metres, feet, metres along the course
    heading: 90,               // degrees, 90 = east along the course
    speed: 95,                 // knots
    throttle: 62,              // percent
    pitch: 0,                  // flight-path angle, degrees (+ = climbing)
    bank: 0,                   // degrees (+ = right wing down)
    vspeed: 0,                 // vertical speed, ft/min
    fuel: mission.fuel,
    damage: 0,
    flaps: false,
    stalled: false,
    landed: false,
    crashed: false,
    crashReason: '',
    onGround: false,
    time: 0,
    score: 0,
    ringsHit: 0,
    ringsCentre: 0,
    ringsMissed: 0,
  };
}

// One physics step. dt is seconds. input: { pitch, roll, throttle, rudder, flaps }.
// wind is the lateral wind in m/s (positive pushes the plane right / +x).
export function stepPlane(plane, input, course, dt) {
  if (plane.landed || plane.crashed) return plane;
  plane.time += dt;

  // --- Throttle and speed -------------------------------------------------
  plane.throttle = clamp(plane.throttle + input.throttle * 55 * dt, 0, 100);
  const targetSpeed = PLANE.minSpeed + (plane.throttle / 100) * (PLANE.maxSpeed - PLANE.minSpeed);
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, PLANE.accel * dt / 40);
  // Climbing bleeds speed; diving buys it back. Energy management, not magic.
  const climbBleed = Math.max(0, plane.pitch) * PLANE.drag * dt;
  const diveGain = Math.max(0, -plane.pitch) * PLANE.drag * 1.6 * dt;
  plane.speed = clamp(plane.speed + diveGain - climbBleed, 35, 210);

  // --- Stall --------------------------------------------------------------
  const stallSpeed = plane.flaps ? PLANE.stallSpeed - 8 : PLANE.stallSpeed;
  const wasStalled = plane.stalled;
  plane.stalled = plane.speed < stallSpeed && !plane.onGround;
  if (plane.stalled) {
    plane.pitch = Math.max(plane.pitch - 14 * dt, -12); // nose drops
    plane.speed = Math.max(plane.speed - 6 * dt, 35);
  }
  // A stall itself costs time, not points — the sink rate is the punishment.

  // --- Attitude -----------------------------------------------------------
  const pitchTarget = clamp(input.pitch * 22, -18, 22);
  plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, PLANE.pitchRate * dt * 4);
  const bankTarget = clamp(input.roll * 42, -42, 42);
  plane.bank += (bankTarget - plane.bank) * Math.min(1, 3.2 * dt);
  // A banked wing turns the nose: turn rate grows with bank and speed.
  // REVISION 1 (self-test review): the old formula mixed radians and degrees and
  // turned ~119 deg/s at full bank — unplayable. Now ~19 deg/s at 42 deg bank.
  const turnDeg = plane.bank * PLANE.turnRate * (plane.speed / PLANE.cruiseSpeed) * dt;
  plane.heading = (plane.heading + turnDeg + input.rudder * 6 * dt + 360) % 360;

  // --- Motion -------------------------------------------------------------
  const hdg = (plane.heading * Math.PI) / 180;
  const fwd = plane.speed * KT_TO_MS; // m/s along the heading
  const climbFps = Math.sin((plane.pitch * Math.PI) / 180) * fwd / FT_TO_M;
  const sinkFps = plane.stalled ? PLANE.sinkRate * 2.2 : 0;
  plane.vspeed = climbFps * 60 - sinkFps * 60;
  plane.y += (climbFps - sinkFps) * dt;
  // Heading 90 flies the course (+z): forward = (cos h, sin h) in (x, z).
  plane.x += Math.cos(hdg) * fwd * dt;
  plane.z += Math.sin(hdg) * fwd * dt;
  // Wind pushes the plane sideways (storm run); the pilot crabs into it.
  plane.x += course.windAt(plane.z, plane.time) * dt * 0.6;

  // --- Fuel ---------------------------------------------------------------
  const burn = (PLANE.fuelBurnIdle + (plane.throttle / 100) * PLANE.fuelBurn) * dt;
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (plane.fuel <= 0 && plane.throttle > 0) plane.throttle = 0; // glide only

  // --- Terrain ------------------------------------------------------------
  const ground = course.groundHeight(plane.x, plane.z);
  if (plane.y <= ground + 2) {
    if (nearRunway(plane, course)) {
      landPlane(plane, course);
    } else {
      crashPlane(plane, ground <= 2 ? 'Ditched in the sea' : 'Flew into terrain');
    }
  }
  // Out of the course sideways or backwards: turn back, don't crash.
  if (Math.abs(plane.x) > 1400) plane.x = Math.sign(plane.x) * 1400;
  if (plane.z < -50) plane.z = -50;
  if (plane.y > 5200) { plane.y = 5200; plane.pitch = Math.min(plane.pitch, 0); }

  // --- Rings --------------------------------------------------------------
  const ring = course.nextRing();
  if (ring) {
    const dz = plane.z - ring.z;
    if (Math.abs(dz) < 26 && !ring.passed && !ring.missed) {
      // REVISION 1: ring radius is in feet — convert lateral metres to feet first.
      // The old code compared metres against feet, making rings 3.28x too wide.
      const dx = (plane.x - ring.x) / FT_TO_M;
      const dy = plane.y - ring.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= ring.r) {
        ring.passed = true;
        ring.centre = dist <= ring.r * 0.45;
        plane.ringsHit += 1;
        if (ring.centre) plane.ringsCentre += 1;
        plane.score += ring.centre ? 100 : 50;
      } else {
        ring.missed = true;
        plane.ringsMissed += 1;
        plane.score -= 50;
      }
    }
  }
  return plane;
}

function nearRunway(plane, course) {
  const r = course.runway;
  return (
    Math.abs(plane.z - r.z) <= r.length / 2 + 60 &&
    Math.abs(plane.x - r.x) <= r.width / 2 + 120
  );
}

// Touchdown: judge it like a landing examiner, then roll out.
export function landPlane(plane, course) {
  const r = course.runway;
  const vsFpm = Math.abs(plane.vspeed);
  const centreDist = Math.abs(plane.x - r.x);
  const zoneDist = Math.abs(plane.z - (r.z - r.length / 2 + 180));
  const parts = {
    smoothness: Math.max(0, 1 - vsFpm / 900),
    centreline: Math.max(0, 1 - centreDist / (r.width / 2 + 60)),
    zone: Math.max(0, 1 - zoneDist / 320),
    approachSpeed: plane.speed >= 60 && plane.speed <= 105 ? 1 : Math.max(0, 1 - Math.abs(plane.speed - 82) / 60),
    bank: Math.max(0, 1 - Math.abs(plane.bank) / 20),
    alignment: Math.max(0, 1 - Math.abs(((plane.heading - 90 + 540) % 360) - 180) / 45),
    rollout: 1,
  };
  const landingScore =
    Math.round(parts.smoothness * LANDING_SCORE.smoothness) +
    Math.round(parts.centreline * LANDING_SCORE.centreline) +
    Math.round(parts.zone * LANDING_SCORE.zone) +
    Math.round(parts.approachSpeed * LANDING_SCORE.approachSpeed) +
    Math.round(parts.bank * LANDING_SCORE.bank) +
    Math.round(parts.alignment * LANDING_SCORE.alignment) +
    LANDING_SCORE.rollout;
  plane.score += landingScore;
  plane.landing = { ...parts, total: landingScore, vsFpm: Math.round(vsFpm), centreDist: Math.round(centreDist) };

  const tooHard = vsFpm > 900 || Math.abs(plane.bank) > 20 || centreDist > r.width / 2 + 60;
  if (tooHard) {
    plane.damage += PLANE.damagePerHardLanding;
    plane.landing.verdict = vsFpm > 900 ? 'HARD LANDING' : 'OFF THE TARMAC';
    if (plane.damage >= 100) {
      crashPlane(plane, 'Airframe broke up on landing');
      return plane;
    }
  } else {
    plane.landing.verdict =
      landingScore >= 850 ? 'BUTTER SMOOTH' : landingScore >= 650 ? 'SMOOTH' : landingScore >= 450 ? 'SAFE' : 'FIRM';
  }
  plane.y = course.groundHeight(plane.x, plane.z) + 2;
  plane.landed = true;
  plane.onGround = true;
  plane.speed = Math.max(0, plane.speed - 40);
  return plane;
}

export function crashPlane(plane, reason) {
  plane.crashed = true;
  plane.crashReason = reason;
  return plane;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Stars for a finished sortie: 3 = aced it, 1 = walked away from it.
export function starsFor(plane, course) {
  if (plane.crashed) return 0;
  const rings = course.rings.length;
  const hitRate = rings ? plane.ringsHit / rings : 1;
  const land = plane.landing ? plane.landing.total / 1000 : 0.5;
  const s = hitRate * 0.6 + land * 0.4 + (plane.fuel / 100) * 0.1;
  return s >= 0.85 ? 3 : s >= 0.6 ? 2 : 1;
}
