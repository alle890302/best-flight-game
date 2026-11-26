// TRADEWIND RUN — deterministic screenshot states.
// One job: turn a ?shot= URL into a fixed game state, so the maker's screenshots
// are reproducible renders of the game's own code. Never random, never live input.

import { freshPlane } from './physics.js';

// Build the state for a named shot. Returns { mode, plane, selected }.
export function stateForShot(shot, course) {
  const plane = freshPlane(course, course.mission);
  switch (shot) {
    case 'start':
      // Title screen over a live dawn backdrop: the plane cruises the course.
      plane.z = 1500;
      plane.y = 720;
      plane.x = -160;
      plane.speed = 110;
      plane.throttle = 55;
      return { mode: 'title', plane, selected: 0 };

    case 'play': {
      // Mid-flight: three rings ahead, HUD lit, plane banked into a turn.
      plane.z = 2600;
      plane.y = 640;
      plane.x = 120;
      plane.speed = 132;
      plane.throttle = 78;
      plane.bank = 18;
      plane.pitch = 3;
      plane.fuel = 74;
      plane.score = 250;
      plane.ringsHit = 2;
      plane.ringsCentre = 1;
      course.rings[0].passed = true;
      course.rings[0].centre = true;
      course.rings[1].passed = true;
      return { mode: 'fly', plane, selected: 0 };
    }

    case 'approach': {
      // Final approach: runway ahead, PAPI in view, gear down, low and slow.
      plane.z = course.runway.z - course.runway.length / 2 - 1250;
      plane.y = 320;
      plane.x = 24;
      plane.speed = 88;
      plane.throttle = 34;
      plane.pitch = -4;
      plane.bank = -4;
      plane.flaps = true;
      plane.fuel = 41;
      plane.score = 820;
      plane.ringsHit = 8;
      plane.ringsCentre = 3;
      for (const r of course.rings) { r.passed = true; }
      course.rings[2].centre = true;
      course.rings[5].centre = true;
      course.rings[7].centre = true;
      return { mode: 'fly', plane, selected: 0 };
    }

    case 'end': {
      // Debrief: landed, score breakdown on screen.
      plane.z = course.runway.z;
      plane.y = 42;
      plane.x = 6;
      plane.speed = 0;
      plane.throttle = 0;
      plane.fuel = 33;
      plane.score = 2140;
      plane.ringsHit = 8;
      plane.ringsCentre = 3;
      plane.time = 132;
      plane.landed = true;
      plane.onGround = true;
      plane.landing = {
        total: 862, vsFpm: 210, centreDist: 9,
        verdict: 'BUTTER SMOOTH',
        smoothness: 0.77, centreline: 0.85, zone: 0.9,
        approachSpeed: 1, bank: 0.95, alignment: 0.9, rollout: 1,
      };
      for (const r of course.rings) { r.passed = true; }
      return { mode: 'debrief', plane, selected: 0 };
    }

    default:
      return { mode: 'title', plane, selected: 0 };
  }
}
