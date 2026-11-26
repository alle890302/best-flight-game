// TRADEWIND RUN — the game loop and state machine.
// One job: own the modes (title → fly → paused → debrief), wire input, physics,
// audio and rendering together, and run the self-test when asked.

import { VIEW, MISSIONS } from './config.js';
import { buildCourse } from './course.js';
import { freshPlane, stepPlane, starsFor } from './physics.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stateForShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.W;
canvas.height = VIEW.H;
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const selftest = params.get('selftest') === '1';

const input = createInput(canvas);
const audio = createAudio();
const renderer = createRenderer(canvas);

// The game object the renderer reads. One object, mutated in place.
const game = {
  mode: 'title',
  view: 'chase',
  time: 0,
  toast: '',
  toastT: 0,
  toastColor: '#fff3c4',
  turbulence: false,
  stars: 0,
  missionIndex: 0,
  course: null,
  plane: null,
};

function loadMission(index) {
  game.missionIndex = index;
  const mission = MISSIONS[index];
  game.course = buildCourse(mission.id);
  game.course.missionList = MISSIONS;
  game.course.selected = index;
  game.plane = freshPlane(game.course, mission);
  game.time = 0;
  game.toast = '';
  game.toastT = 0;
  game.turbulence = false;
  game.stars = 0;
  setStatus(`${mission.name}: ${mission.briefing}`);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function toast(text, color) {
  game.toast = text;
  game.toastT = 2.4;
  game.toastColor = color || '#fff3c4';
}

function startMission(index) {
  audio.ensure();
  audio.click();
  loadMission(index);
  game.mode = 'fly';
  setStatus(`${MISSIONS[index].name} — fly the rings, land on runway 09.`);
}

// Ring events: compare flags before/after the physics step.
function watchRings(before) {
  for (let i = 0; i < game.course.rings.length; i++) {
    const r = game.course.rings[i];
    const was = before[i];
    if (!was.passed && r.passed) {
      if (r.centre) { toast(`RING! +100 — DEAD CENTRE`, '#7dffb0'); audio.centre(); }
      else { toast(`RING! +50`, '#7dffb0'); audio.ring(); }
    } else if (!was.missed && r.missed) {
      toast('RING MISSED −50', '#ff5d5d');
    }
  }
  if (game.course.mission.id === 'courier' && game.course.rings[0].passed && !game.pickedUp) {
    game.pickedUp = true;
    toast('MAIL ON BOARD — DELIVER TO RUNWAY 09', '#8fd8ff');
  }
}

let last = performance.now();
let stallBeepAt = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const actions = input.takeActions();

  if (actions.mute) audio.toggleMute();
  if (actions.view) game.view = game.view === 'chase' ? 'cockpit' : 'chase';

  if (game.mode === 'title') {
    // Attract mode: the plane cruises the dawn course behind the menu.
    game.time += dt;
    const p = game.plane;
    p.z += 42 * dt;
    if (p.z > 8200) { p.z = 400; p.x = 0; }
    p.x = Math.sin(game.time * 0.12) * 220;
    p.y = 700 + Math.sin(game.time * 0.3) * 90;
    p.bank = Math.cos(game.time * 0.12) * 14;
    p.speed = 110;
    if (actions.confirm) startMission(game.course.selected);
    if (actions.anyKey) audio.ensure();
    // Mission select with 1/2/3.
    for (let i = 0; i < 3; i++) {
      if (input.keys.has(`Digit${i + 1}`)) game.course.selected = i;
    }
    // Click a mission card.
    const m = input.mousePos();
    if (m.down) {
      const cards = MISSIONS.length;
      const cw = 300;
      const gap = 30;
      const total = cards * cw + (cards - 1) * gap;
      const x0 = (VIEW.W - total) / 2;
      for (let i = 0; i < cards; i++) {
        const x = x0 + i * (cw + gap);
        if (m.x >= x && m.x <= x + cw && m.y >= 250 && m.y <= 440) {
          startMission(i);
        }
      }
    }
  } else if (game.mode === 'fly') {
    game.time += dt;
    if (game.toastT > 0) game.toastT -= dt;
    if (actions.pause) { game.mode = 'paused'; setStatus('Paused.'); }
    if (actions.retry) { loadMission(game.missionIndex); }
    const frameIn = input.readFrame();
    const before = game.course.rings.map((r) => ({ passed: r.passed, missed: r.missed }));
    const wasStalled = game.plane.stalled;
    stepPlane(game.plane, frameIn, game.course, dt);
    watchRings(before);
    const p = game.plane;
    game.turbulence = game.course.mission.gusts === 1 && p.speed > 60 && !p.onGround;
    audio.update(p.throttle, p.speed, p.stalled);
    if (p.stalled && !wasStalled && now - stallBeepAt > 900) {
      stallBeepAt = now;
      audio.stall();
    }
    if (p.fuel > 0 && p.fuel < 15 && !game.lowFuelWarned) {
      game.lowFuelWarned = true;
      toast('LOW FUEL — THROTTLE BACK', '#ff5d5d');
    }
    if (p.fuel <= 0 && !game.fuelGoneWarned) {
      game.fuelGoneWarned = true;
      toast('FUEL EMPTY — GLIDING', '#ff5d5d');
    }
    if (p.crashed) {
      audio.crash();
      game.mode = 'debrief';
      game.stars = 0;
      setStatus(`Crashed: ${p.crashReason}. Press R to fly again.`);
    } else if (p.landed) {
      audio.thud();
      audio.fanfare();
      game.mode = 'debrief';
      game.stars = starsFor(p, game.course);
      toast('', '#fff3c4');
      setStatus(`Landed: ${p.landing.verdict}. Score ${p.score}.`);
    } else if (p.time >= game.course.mission.timeLimit) {
      game.mode = 'debrief';
      game.stars = 0;
      setStatus('Out of time. Press R to fly again.');
    }
  } else if (game.mode === 'paused') {
    if (actions.pause || actions.confirm) { game.mode = 'fly'; }
    if (actions.retry) { loadMission(game.missionIndex); game.mode = 'fly'; }
  } else if (game.mode === 'debrief') {
    if (actions.retry) { loadMission(game.missionIndex); game.mode = 'fly'; }
    if (actions.confirm) {
      const next = (game.missionIndex + 1) % MISSIONS.length;
      startMission(next);
    }
    if (input.keys.has('Escape')) { loadMission(game.missionIndex); game.mode = 'title'; }
  }

  renderer.render(game);
  requestAnimationFrame(frame);
}

// --- Deterministic screenshot states (?shot=...) ---------------------------
if (shotName) {
  loadMission(0);
  const s = stateForShot(shotName, game.course);
  game.plane = s.plane;
  game.mode = s.mode;
  game.course.selected = s.selected;
  game.course.missionList = MISSIONS;
  // One render pass now; the loop keeps it alive for the screenshot timer.
  renderer.render(game);
}

// --- Self-test (?selftest=1) ----------------------------------------------
// Runs the real code paths headlessly and reports PASS/FAIL in the title and
// on the canvas. No network, no input, fully deterministic.
function runSelfTest() {
  const results = [];
  const check = (name, ok) => results.push([name, !!ok]);

  // 1. Every mission builds a course with its rings and runway.
  for (const m of MISSIONS) {
    const c = buildCourse(m.id);
    check(`course ${m.id} has ${m.rings} rings`, c.rings.length === m.rings);
    check(`course ${m.id} runway exists`, c.runway.z > 8000);
  }
  // 2. Throttle makes speed; the plane moves forward and climbs with pitch.
  const c0 = buildCourse('rings');
  const p0 = freshPlane(c0, c0.mission);
  for (let i = 0; i < 240; i++) stepPlane(p0, { pitch: 0.4, roll: 0, throttle: 1, rudder: 0 }, c0, 1 / 60);
  check('throttle builds speed > 120kt', p0.speed > 120);
  check('plane advances along course', p0.z > 200); // ~145 kt avg x 4 s ≈ 300 m
  check('pitch climbs the plane', p0.y > 600);
  // 3. Flying through ring 0 marks it passed (centre when dead-on).
  const c1 = buildCourse('rings');
  const p1 = freshPlane(c1, c1.mission);
  const r0 = c1.rings[0];
  p1.x = r0.x; p1.y = r0.y; p1.z = r0.z - 30; p1.speed = 120;
  for (let i = 0; i < 60; i++) stepPlane(p1, { pitch: 0, roll: 0, throttle: 0, rudder: 0 }, c1, 1 / 60);
  check('ring 0 passed when flown through', r0.passed === true);
  check('centre pass scores 100', p1.score >= 100);
  // 4. A gentle touchdown on the runway lands the plane with a score.
  const c2 = buildCourse('rings');
  const p2 = freshPlane(c2, c2.mission);
  p2.x = 4; p2.z = c2.runway.z; p2.y = 46; p2.speed = 82; p2.vspeed = -180; p2.bank = 2; p2.heading = 90;
  stepPlane(p2, { pitch: 0, roll: 0, throttle: 0, rudder: 0 }, c2, 1 / 60);
  check('gentle touchdown lands', p2.landed === true);
  check('landing scores above 400', (p2.landing?.total ?? 0) > 400);
  // 5. Flying into the sea crashes, with a reason.
  const c3 = buildCourse('rings');
  const p3 = freshPlane(c3, c3.mission);
  p3.y = 10; p3.speed = 100;
  stepPlane(p3, { pitch: 0, roll: 0, throttle: 0, rudder: 0 }, c3, 1 / 60);
  check('ditching in the sea crashes', p3.crashed === true && !!p3.crashReason);
  // 6. Stall: slow flight with the nose up drops the nose.
  const c4 = buildCourse('rings');
  const p4 = freshPlane(c4, c4.mission);
  p4.speed = 50; p4.throttle = 0;
  stepPlane(p4, { pitch: 1, roll: 0, throttle: 0, rudder: 0 }, c4, 1);
  check('slow flight stalls', p4.stalled === true);
  // 7. Fuel runs out and the throttle dies.
  const c5 = buildCourse('storm');
  const p5 = freshPlane(c5, c5.mission);
  p5.fuel = 0.1;
  for (let i = 0; i < 120; i++) stepPlane(p5, { pitch: 0, roll: 0, throttle: 1, rudder: 0 }, c5, 1 / 60);
  check('empty fuel kills throttle', p5.throttle === 0);
  // 8. The renderer draws a non-blank frame.
  loadMission(0);
  const s = stateForShot('play', game.course);
  game.plane = s.plane;
  game.mode = 'fly';
  renderer.render(game);
  const px = ctx2d().getImageData(0, 0, VIEW.W, VIEW.H).data;
  let lit = 0;
  for (let i = 0; i < px.length; i += 401 * 4) {
    if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
  }
  check('render produces a lit frame', lit > 50);

  const passed = results.filter(([, ok]) => ok).length;
  const failed = results.filter(([, ok]) => !ok);
  const title = failed.length === 0
    ? `SELFTEST PASS ${passed}/${results.length}`
    : `SELFTEST FAIL ${passed}/${results.length}: ${failed.map(([n]) => n).join('; ')}`;
  document.title = title;
  // Draw the result on the canvas so a screenshot shows it too.
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(8,14,26,0.85)';
  g.fillRect(0, 0, VIEW.W, VIEW.H);
  g.fillStyle = failed.length === 0 ? '#7dffb0' : '#ff5d5d';
  g.font = '800 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, VIEW.W / 2, 120);
  g.textAlign = 'left';
  g.font = '600 16px system-ui, sans-serif';
  results.forEach(([name, ok], i) => {
    g.fillStyle = ok ? '#7dffb0' : '#ff5d5d';
    g.fillText(`${ok ? 'PASS' : 'FAIL'}  ${name}`, 120, 170 + i * 28);
  });
  console.log(title);
}

function ctx2d() {
  return canvas.getContext('2d');
}

// --- Boot -------------------------------------------------------------------
loadMission(0);
if (selftest) {
  runSelfTest();
} else {
  requestAnimationFrame(frame);
}
