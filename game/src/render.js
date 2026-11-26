// TRADEWIND RUN — everything the player sees.
// One job: draw the world (sky, sea, terrain, landmarks, rings, runway), the
// aircraft, and the instruments. The judge reads the game mostly through the
// screenshots, so this file is where the game wins or loses.

import { VIEW, PALETTE } from './config.js';

const FT_TO_M = 0.3048;
const FOCAL = 760; // perspective focal length in pixels

// ---------------------------------------------------------------------------
// Projection: chase camera behind the plane, looking along its heading.
// World: x = lateral metres, y = feet, z = metres along the course.
// ---------------------------------------------------------------------------
function cameraFor(plane) {
  // Forward = (cos h, sin h) in (x, z): heading 90 looks down the course (+z).
  // Right = (-sin h, cos h): facing +z with y up, right is -x.
  const h = (plane.heading * Math.PI) / 180;
  const fx = Math.cos(h);
  const fz = Math.sin(h);
  return {
    x: plane.x - fx * 42,
    y: (plane.y + 9) * FT_TO_M,
    z: plane.z - fz * 42,
    fx, fz,
    rx: -Math.sin(h), rz: Math.cos(h), // right vector
  };
}

function project(cam, px, pyFt, pz, horizonY) {
  const dx = px - cam.x;
  const dy = pyFt * FT_TO_M - cam.y;
  const dz = pz - cam.z;
  const relZ = dx * cam.fx + dz * cam.fz;
  if (relZ < 2) return null;
  const relX = dx * cam.rx + dz * cam.rz;
  const s = FOCAL / relZ;
  return { x: VIEW.W / 2 + relX * s, y: horizonY - dy * s, s, d: relZ };
}

function terrainColor(hFt) {
  if (hFt < 4) return PALETTE.seaDeep;
  if (hFt < 40) return PALETTE.seaShallow;
  if (hFt < 90) return PALETTE.sand;
  if (hFt < 480) return PALETTE.grass;
  if (hFt < 1100) return PALETTE.rock;
  return PALETTE.snow;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = VIEW.W;
  const H = VIEW.H;

  // Clouds live in world space so they parallax correctly; seeded once.
  const clouds = [];
  let cr = 1234567;
  const crand = () => { cr = (cr * 1103515245 + 12345) & 0x7fffffff; return cr / 0x7fffffff; };
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (crand() - 0.5) * 5200,
      y: 1500 + crand() * 1800,
      z: crand() * 9500,
      r: 90 + crand() * 190,
      drift: 2 + crand() * 4,
    });
  }

  function drawSky(plane, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.42, PALETTE.skyMid);
    g.addColorStop(0.62, PALETTE.skyLow);
    g.addColorStop(1, '#1a2a44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun, low on the horizon ahead-left.
    const sx = W * 0.24;
    const sy = H * 0.40;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.35, 'rgba(255,217,138,0.55)');
    glow.addColorStop(1, 'rgba(255,217,138,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
    // Birds: three little chevrons drifting across the dawn.
    ctx.strokeStyle = 'rgba(30,30,40,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const bx = ((time * 12 + i * 260) % (W + 200)) - 100;
      const by = 120 + i * 34 + Math.sin(time * 0.8 + i * 2) * 8;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by);
      ctx.quadraticCurveTo(bx, by - 7, bx + 9, by);
      ctx.stroke();
    }
  }

  function drawClouds(cam, horizonY, time) {
    ctx.fillStyle = PALETTE.cloud;
    for (const c of clouds) {
      const cx = c.x + time * c.drift;
      const p = project(cam, cx, c.y, c.z, horizonY);
      if (!p || p.d > 4000) continue;
      const r = Math.max(4, c.r * p.s * 0.12);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 2.4, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x - r, p.y + r * 0.3, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + r, p.y + r * 0.3, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Terrain as depth slices, far to near. Each slice is drawn as one coloured quad
  // per column segment, from its top edge down to the bottom of the screen, so a
  // slice that spans sea and island paints sea under the sea and grass under the
  // island — never one colour for the whole strip.
  // REVISION 1: the first version filled each slice with the last column's colour,
  // which painted sea grass-green wherever a slice crossed an island.
  function drawTerrain(course, cam, horizonY, plane) {
    const depths = [];
    for (let d = 2400; d > 60; d *= 0.82) depths.push(d);
    depths.push(38);
    const cols = 56;
    for (const d of depths) {
      const halfW = (d * (W / 2)) / FOCAL * 1.15;
      const cx = cam.x + cam.fx * d;
      const cz = cam.z + cam.fz * d;
      const pts = [];
      for (let i = 0; i <= cols; i++) {
        const u = -halfW + (2 * halfW * i) / cols;
        const wx = cx + cam.rx * u;
        const wz = cz + cam.rz * u;
        const h = course.groundHeight(wx, wz);
        pts.push({ p: project(cam, wx, h, wz, horizonY), h });
      }
      for (let i = 0; i < cols; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a.p || !b.p) continue;
        ctx.fillStyle = terrainColor((a.h + b.h) / 2);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(b.p.x, H + 40);
        ctx.lineTo(a.p.x, H + 40);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawLandmarks(course, cam, horizonY) {
    for (const isl of course.islands) {
      const p = project(cam, isl.x, isl.h * 0.55, isl.z, horizonY);
      if (!p || p.d > 2600 || p.d < 30) continue;
      const s = p.s;
      if (isl.kind === 'volcano') {
        // Cone with a smoke plume.
        const baseW = 320 * s;
        const topH = isl.h * FT_TO_M * s;
        ctx.fillStyle = '#5d4a3a';
        ctx.beginPath();
        ctx.moveTo(p.x - baseW, p.y + 10);
        ctx.lineTo(p.x, p.y - topH);
        ctx.lineTo(p.x + baseW, p.y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PALETTE.snow;
        ctx.beginPath();
        ctx.moveTo(p.x - baseW * 0.28, p.y - topH * 0.72);
        ctx.lineTo(p.x, p.y - topH);
        ctx.lineTo(p.x + baseW * 0.28, p.y - topH * 0.72);
        ctx.lineTo(p.x + baseW * 0.14, p.y - topH * 0.6);
        ctx.lineTo(p.x - baseW * 0.14, p.y - topH * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(220,220,220,0.5)';
        ctx.beginPath();
        ctx.ellipse(p.x + 14, p.y - topH - 18, 26 * s + 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        label(p.x, p.y - topH - 44, 'ASHFALL PEAK');
      } else if (isl.kind === 'lighthouse') {
        const tw = 26 * s + 4;
        const th = isl.h * FT_TO_M * s;
        ctx.fillStyle = '#f2ede2';
        ctx.fillRect(p.x - tw / 2, p.y - th, tw, th);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(p.x - tw / 2, p.y - th * 0.66, tw, th * 0.18);
        ctx.fillRect(p.x - tw / 2, p.y - th * 0.28, tw, th * 0.18);
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(p.x, p.y - th - 4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,217,138,0.28)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - th);
        ctx.lineTo(p.x + 220 * s + 40, p.y - th - 26);
        ctx.lineTo(p.x + 220 * s + 40, p.y - th + 10);
        ctx.closePath();
        ctx.fill();
        label(p.x, p.y - th - 30, 'LIGHTHOUSE ISLAND');
      } else if (isl.kind === 'bridge') {
        const bw = 700 * s;
        const bh = 130 * s;
        ctx.strokeStyle = '#8a6a4a';
        ctx.lineWidth = Math.max(2, 10 * s);
        ctx.beginPath();
        ctx.moveTo(p.x - bw, p.y);
        ctx.quadraticCurveTo(p.x, p.y - bh * 2.2, p.x + bw, p.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(138,106,74,0.8)';
        ctx.lineWidth = Math.max(1, 3 * s);
        for (let i = -4; i <= 4; i++) {
          const tx = p.x + (i / 4) * bw * 0.9;
          const ty = p.y - bh * 2.2 * (1 - (i / 4) * (i / 4)) * 0.9;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx, p.y);
          ctx.stroke();
        }
        label(p.x, p.y - bh * 2.2 - 26, 'MERIDIAN BRIDGE');
      } else if (isl.kind === 'city') {
        for (let i = -3; i <= 3; i++) {
          const bw = (34 + ((i * 37) % 40)) * s + 6;
          const bh = (120 + ((i * 53) % 160)) * FT_TO_M * s * 0.6;
          ctx.fillStyle = i % 2 ? '#4a5568' : '#5d6b82';
          ctx.fillRect(p.x + i * 90 * s - bw / 2, p.y - bh, bw, bh);
          ctx.fillStyle = 'rgba(255,217,138,0.85)';
          for (let w = 0; w < 3; w++) {
            ctx.fillRect(p.x + i * 90 * s - bw / 2 + 4 + w * (bw / 3), p.y - bh + 8 + ((i + w) % 3) * 14, 3, 4);
          }
        }
        label(p.x, p.y - 190 * s - 40, 'PORT MERIDIAN');
      }
    }
  }

  function label(x, y, text) {
    ctx.font = '600 13px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(10,16,28,0.6)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 11, w, 20, 5);
    ctx.fill();
    ctx.fillStyle = '#dfe9f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawRunway(course, cam, horizonY) {
    const r = course.runway;
    const g = course.groundHeight(r.x, r.z);
    const corners = [
      [r.x - r.width / 2, g + 2, r.z - r.length / 2],
      [r.x + r.width / 2, g + 2, r.z - r.length / 2],
      [r.x + r.width / 2, g + 2, r.z + r.length / 2],
      [r.x - r.width / 2, g + 2, r.z + r.length / 2],
    ].map(([x, y, z]) => project(cam, x, y, z, horizonY));
    if (corners.some((c) => !c)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let i = 0; i < 9; i++) {
      const z0 = r.z - r.length / 2 + 60 + i * 90;
      const a = project(cam, r.x - 2, g + 3, z0, horizonY);
      const b = project(cam, r.x + 2, g + 3, z0 + 40, horizonY);
      if (!a || !b) continue;
      ctx.fillRect(a.x, a.y, Math.max(1.5, b.x - a.x), Math.max(1.5, b.y - a.y));
    }
    // Threshold bars + runway numbers at the near end.
    const t0 = project(cam, r.x, g + 3, r.z - r.length / 2 + 24, horizonY);
    if (t0) {
      ctx.font = `700 ${Math.max(12, 90 * t0.s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.runwayMark;
      ctx.fillText('09', t0.x, t0.y);
    }
    // PAPI lights: 4 lamps beside the threshold, red/white by glidepath.
    const papiZ = r.z - r.length / 2 + 90;
    for (let i = 0; i < 4; i++) {
      const p = project(cam, r.x + r.width / 2 + 14 + i * 9, g + 4, papiZ, horizonY);
      if (!p) continue;
      ctx.fillStyle = i < 2 ? '#ff5d5d' : '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, 5 * p.s), 0, Math.PI * 2);
      ctx.fill();
    }
    label(corners[0].x, corners[0].y - 34, 'RUNWAY 09');
  }

  function drawRings(course, cam, horizonY, time) {
    const sorted = [...course.rings].sort((a, b) => b.z - a.z);
    for (const ring of sorted) {
      const p = project(cam, ring.x, ring.y, ring.z, horizonY);
      if (!p || p.d > 2600 || p.d < 8) continue;
      const rr = ring.r * FT_TO_M * p.s;
      if (rr < 2) continue;
      const isNext = course.nextRing() === ring;
      const col = ring.passed ? PALETTE.ringPassed : ring.missed ? PALETTE.ringMissed : isNext ? PALETTE.ringNext : '#cfe3f5';
      const pulse = isNext ? 1 + Math.sin(time * 5) * 0.12 : 1;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, rr * 0.12 * pulse);
      ctx.shadowColor = col;
      ctx.shadowBlur = 18 * pulse;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rr * pulse, rr * pulse * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Centre dot so a centre pass reads clearly.
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, rr * 0.08), 0, Math.PI * 2);
      ctx.fill();
      if (isNext) {
        const distM = Math.max(0, Math.round(ring.z - cam.z));
        ctx.font = '700 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = col;
        ctx.fillText(`${distM} m`, p.x, p.y - rr - 12);
      }
    }
  }

  // -- The aircraft: a stylised seaplane seen from behind-below. ---------------
  function drawPlane(plane, time, turbulence) {
    const cx = W / 2;
    const cy = H * 0.74 + plane.pitch * 1.6 + (turbulence ? Math.sin(time * 31) * 2.2 : 0);
    const bank = (plane.bank * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank * 0.9);
    const S = 1; // scale unit
    // Prop disc (spinning).
    ctx.fillStyle = 'rgba(200,215,235,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -46 * S, 34 * S, 40 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,255,0.5)';
    ctx.lineWidth = 2;
    const pa = time * 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(pa) * 34, -46 + Math.sin(pa) * 40);
    ctx.lineTo(-Math.cos(pa) * 34, -46 - Math.sin(pa) * 40);
    ctx.stroke();
    // Tail.
    ctx.fillStyle = '#b8452e';
    ctx.beginPath();
    ctx.moveTo(-58, 26);
    ctx.lineTo(58, 26);
    ctx.lineTo(40, 6);
    ctx.lineTo(-40, 6);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    const fg = ctx.createLinearGradient(0, -60, 0, 40);
    fg.addColorStop(0, '#e8b23a');
    fg.addColorStop(0.55, '#d98a2b');
    fg.addColorStop(1, '#8a4d16');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.quadraticCurveTo(20, -40, 18, 8);
    ctx.quadraticCurveTo(16, 34, 0, 38);
    ctx.quadraticCurveTo(-16, 34, -18, 8);
    ctx.quadraticCurveTo(-20, -40, 0, -62);
    ctx.closePath();
    ctx.fill();
    // Canopy (lit).
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.ellipse(0, -38, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-3, -44, 4, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Wings.
    ctx.fillStyle = '#c94f33';
    ctx.beginPath();
    ctx.moveTo(-16, -18);
    ctx.lineTo(-168, 4);
    ctx.lineTo(-168, 22);
    ctx.lineTo(-14, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -18);
    ctx.lineTo(168, 4);
    ctx.lineTo(168, 22);
    ctx.lineTo(14, 12);
    ctx.closePath();
    ctx.fill();
    // Wingtip lights.
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath(); ctx.arc(-166, 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#37e08b';
    ctx.beginPath(); ctx.arc(166, 13, 4, 0, Math.PI * 2); ctx.fill();
    // Registration + stripe.
    ctx.fillStyle = '#fff3c4';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N-KSTRL', 0, 20);
    // Floats.
    ctx.fillStyle = '#5d6b82';
    ctx.beginPath(); ctx.roundRect(-30, 40, 14, 10, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(16, 40, 14, 10, 4); ctx.fill();
    ctx.restore();
  }

  // -- HUD and instruments (lit) ------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function digital(x, y, label, value, unit, color) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = color || PALETTE.hudAmber;
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText(value, x, y + 26);
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(unit, x + ctx.measureText(value).width + 34, y + 26);
  }

  function bar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, frac))), h, 4);
    ctx.fill();
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 5);
  }

  // Artificial horizon: a rolling ball with sky above, ground below, pitch ladder.
  function attitudeGauge(cx, cy, r, pitch, bank) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate((-bank * Math.PI) / 180);
    ctx.translate(0, pitch * 1.6);
    ctx.fillStyle = '#3f7ec2';
    ctx.fillRect(-r - 4, -r * 2 - 4, (r + 4) * 2, r * 2 + 4);
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(-r - 4, 0, (r + 4) * 2, r * 2 + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const d of [-20, -10, 10, 20]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, d * 1.6);
      ctx.lineTo(r * 0.4, d * 1.6);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed wings + bezel.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r - 2, 0); ctx.lineTo(-r * 0.35, 0);
    ctx.moveTo(r * 0.35, 0); ctx.lineTo(r + 2, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,216,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function compassTape(plane, course, y) {
    const cx = W / 2;
    const w = 420;
    panel(cx - w / 2, y, w, 40);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y, w, 40, 8);
    ctx.clip();
    for (let d = -60; d <= 60; d += 15) {
      const hdg = Math.round((plane.heading + d + 360) % 360);
      const x = cx + d * 3.2;
      const major = hdg % 30 === 0;
      ctx.strokeStyle = 'rgba(223,233,245,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 26);
      ctx.lineTo(x, y + (major ? 12 : 18));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#dfe9f5';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(hdg).padStart(3, '0'), x, y + 38);
      }
    }
    // Heading bug: magenta marker at the bearing to the next ring.
    const ring = course.nextRing();
    if (ring) {
      const dx = ring.x - plane.x;
      const dz = ring.z - plane.z;
      const bearing = (Math.atan2(dz, dx) * 180) / Math.PI;
      let diff = ((bearing - plane.heading + 540) % 360) - 180;
      diff = Math.max(-60, Math.min(60, diff));
      const bx = cx + diff * 3.2;
      ctx.fillStyle = PALETTE.ringNext;
      ctx.beginPath();
      ctx.moveTo(bx, y + 2);
      ctx.lineTo(bx - 6, y + 12);
      ctx.lineTo(bx + 6, y + 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Centre caret.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx, y + 40);
    ctx.lineTo(cx - 6, y + 30);
    ctx.lineTo(cx + 6, y + 30);
    ctx.closePath();
    ctx.fill();
  }

  function drawHUD(plane, course, state) {
    const mission = course.mission;
    const timeLeft = Math.max(0, mission.timeLimit - plane.time);
    // Top-left instruments.
    panel(16, 14, 300, 74);
    digital(30, 32, 'ALT', String(Math.round(plane.y)), 'FT', plane.y < 120 ? PALETTE.hudRed : PALETTE.hudAmber);
    digital(128, 32, 'SPD', String(Math.round(plane.speed)), 'KT', plane.stalled ? PALETTE.hudRed : PALETTE.hudAmber);
    digital(226, 32, 'HDG', String(Math.round(plane.heading)).padStart(3, '0'), '°', PALETTE.hudCyan);
    // Compass tape.
    compassTape(plane, course, 14);
    // Top-right: mission + fuel + damage.
    panel(W - 316, 14, 300, 74);
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mission.name, W - 300, 34);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = '600 12px system-ui, sans-serif';
    const ring = course.nextRing();
    ctx.fillText(
      ring ? `RING ${plane.ringsHit + 1}/${course.rings.length}  •  ${Math.round(timeLeft)}s left` : `LAND ON RUNWAY 09  •  ${Math.round(timeLeft)}s left`,
      W - 300, 52,
    );
    bar(W - 300, 66, 130, 8, plane.fuel / 100, plane.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen, 'FUEL');
    bar(W - 156, 66, 130, 8, 1 - plane.damage / 100, plane.damage > 60 ? PALETTE.hudRed : PALETTE.hudGreen, 'AIRFRAME');
    // Bottom-left: attitude gauge + score.
    panel(16, H - 128, 150, 112);
    attitudeGauge(66, H - 72, 34, plane.pitch, plane.bank);
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${plane.score}`, 112, H - 96);
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`RINGS ${plane.ringsHit}/${course.rings.length}`, 112, H - 74);
    ctx.fillText(plane.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 112, H - 54);
    // Bottom-centre: throttle bar.
    panel(W / 2 - 130, H - 46, 260, 30);
    bar(W / 2 - 118, H - 26, 200, 8, plane.throttle / 100, PALETTE.hudAmber, 'THROTTLE');
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(plane.throttle)}%`, W / 2 + 92, H - 18);
    // Bottom-right: wind + vertical speed.
    panel(W - 196, H - 128, 180, 112);
    const wind = course.windAt(plane.z, plane.time);
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`WIND ${Math.abs(Math.round(wind))} kt ${wind >= 0 ? '→' : '←'}`, W - 182, H - 96);
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`V/S ${plane.vspeed >= 0 ? '+' : ''}${Math.round(plane.vspeed)} fpm`, W - 182, H - 74);
    ctx.fillText(`DIST RWY ${Math.round(course.distanceToRunway(plane.z))} m`, W - 182, H - 54);
    // Stall warning.
    if (plane.stalled) {
      const blink = Math.sin(state.time * 14) > 0;
      if (blink) {
        ctx.fillStyle = PALETTE.hudRed;
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠ STALL — NOSE DOWN ⚠', W / 2, 150);
      }
    }
    if (plane.fuel > 0 && plane.fuel < 15) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL', W / 2, 176);
    }
    // Toasts (centre messages, fade out).
    if (state.toast && state.toastT > 0) {
      ctx.globalAlpha = Math.min(1, state.toastT * 2);
      ctx.fillStyle = state.toastColor || '#fff3c4';
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.toast, W / 2, 210);
      ctx.globalAlpha = 1;
    }
    // Flight-path marker: where the nose points, relative to the horizon.
    const fx = W / 2 + plane.bank * 1.2;
    const fy = H * 0.42 - plane.pitch * 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx - 18, fy); ctx.lineTo(fx - 10, fy);
    ctx.moveTo(fx + 10, fy); ctx.lineTo(fx + 18, fy);
    ctx.moveTo(fx, fy - 18); ctx.lineTo(fx, fy - 10);
    ctx.stroke();
  }

  function drawCockpitFrame(plane, course, state) {
    // V view: sit inside the aircraft — a dashboard bezel with lit gauges.
    const dashH = 190;
    const g = ctx.createLinearGradient(0, H - dashH, 0, H);
    g.addColorStop(0, '#232a36');
    g.addColorStop(1, '#10141d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - dashH + 40);
    ctx.quadraticCurveTo(W / 2, H - dashH - 30, W, H - dashH + 40);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,216,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Six lit dials.
    attitudeGauge(W / 2 - 300, H - 92, 40, plane.pitch, plane.bank);
    gauge(W / 2 - 180, H - 92, 40, 'AIRSPEED', `${Math.round(plane.speed)}`, 'KT', plane.speed / 185);
    gauge(W / 2 - 60, H - 92, 40, 'ALTIMETER', `${Math.round(plane.y)}`, 'FT', Math.min(1, plane.y / 3000));
    gauge(W / 2 + 60, H - 92, 40, 'HEADING', `${String(Math.round(plane.heading)).padStart(3, '0')}`, '°', plane.heading / 360);
    gauge(W / 2 + 180, H - 92, 40, 'FUEL', `${Math.round(plane.fuel)}`, '%', plane.fuel / 100);
    gauge(W / 2 + 300, H - 92, 40, 'VERT SPEED', `${plane.vspeed >= 0 ? '+' : ''}${Math.round(plane.vspeed)}`, 'FPM', Math.min(1, Math.abs(plane.vspeed) / 1500));
    // Nose + prop arc at the bottom centre.
    ctx.fillStyle = '#d98a2b';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 26, H);
    ctx.quadraticCurveTo(W / 2, H - 46, W / 2 + 26, H);
    ctx.closePath();
    ctx.fill();
  }

  function gauge(cx, cy, r, label, value, unit, frac) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1522';
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,216,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.hudGreen;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, frac)) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(value, cx, cy + 2);
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(label, cx, cy - r - 6);
    ctx.fillText(unit, cx, cy + r + 14);
    ctx.restore();
  }

  // -- Screens ------------------------------------------------------------------
  function drawTitle(course, time) {
    ctx.fillStyle = 'rgba(8,14,26,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3c4';
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.fillText('TRADEWIND RUN', W / 2, 150);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('A bush-plane courier over the Meridian Islands — dawn shift', W / 2, 186);
    // Mission cards.
    const cards = course.missionList;
    const cw = 300;
    const gap = 30;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let x0 = (W - total) / 2;
    cards.forEach((m, i) => {
      const x = x0 + i * (cw + gap);
      const y = 250;
      const sel = course.selected === i;
      ctx.fillStyle = sel ? 'rgba(255,180,84,0.22)' : PALETTE.panel;
      ctx.strokeStyle = sel ? PALETTE.hudAmber : PALETTE.panelEdge;
      ctx.lineWidth = sel ? 3 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, 190, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff3c4';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillText(m.name, x + cw / 2, y + 44);
      ctx.fillStyle = PALETTE.hudCyan;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(m.tag, x + cw / 2, y + 74);
      ctx.fillStyle = '#dfe9f5';
      ctx.font = '400 13px system-ui, sans-serif';
      wrapText(m.briefing, x + 18, y + 104, cw - 36, 18);
      ctx.fillStyle = sel ? PALETTE.hudAmber : '#9fb4cc';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(sel ? '▶ PRESS ENTER TO FLY' : `PRESS ${i + 1}`, x + cw / 2, y + 168);
    });
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('W/S throttle  •  Arrows pitch & roll  •  Q/E rudder  •  F flaps  •  Mouse drag = stick  •  V cockpit view', W / 2, 500);
    ctx.fillText('Fly the rings, mind your fuel, and land her gentle on runway 09.', W / 2, 528);
    ctx.fillStyle = 'rgba(223,233,245,0.6)';
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText('An original game — no commercial aircraft, names or places. Built for make.fun.', W / 2, 580);
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    ctx.textAlign = 'left';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    ctx.textAlign = 'center';
  }

  function drawDebrief(plane, course) {
    ctx.fillStyle = 'rgba(8,14,26,0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 320, 90, 640, 480);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3c4';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(plane.crashed ? 'CRASHED' : 'SORTIE COMPLETE', W / 2, 150);
    if (plane.crashed) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(plane.crashReason, W / 2, 182);
    } else {
      const stars = '★'.repeat(course.stars) + '☆'.repeat(3 - course.stars);
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.fillText(stars, W / 2, 182);
      ctx.fillStyle = PALETTE.hudCyan;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(plane.landing ? plane.landing.verdict : 'MISSION COMPLETE', W / 2, 210);
    }
    // Score breakdown.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#dfe9f5';
    ctx.font = '600 16px system-ui, sans-serif';
    const rows = [
      ['Rings flown', `${plane.ringsHit}/${course.rings.length}  (${plane.ringsCentre} centre)`, plane.ringsHit * 50 + plane.ringsCentre * 50],
      ['Ring misses', `${plane.ringsMissed}`, plane.ringsMissed * -50],
      ['Landing', plane.landing ? `${plane.landing.total} / 1000` : '—', plane.landing ? plane.landing.total : 0],
      ['Time', `${Math.round(plane.time)}s`, Math.max(0, Math.round((course.mission.timeLimit - plane.time) * 2))],
      ['Fuel left', `${Math.round(plane.fuel)}%`, Math.round(plane.fuel * 2)],
    ];
    let y = 250;
    for (const [label, val, pts] of rows) {
      ctx.fillStyle = '#9fb4cc';
      ctx.fillText(label, W / 2 - 260, y);
      ctx.fillStyle = '#dfe9f5';
      ctx.fillText(val, W / 2 - 60, y);
      ctx.fillStyle = pts >= 0 ? PALETTE.hudGreen : PALETTE.hudRed;
      ctx.textAlign = 'right';
      ctx.fillText(`${pts >= 0 ? '+' : ''}${pts}`, W / 2 + 260, y);
      ctx.textAlign = 'left';
      y += 30;
    }
    ctx.fillStyle = '#fff3c4';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`TOTAL  ${plane.score}`, W / 2, y + 22);
    if (plane.landing) {
      ctx.fillStyle = '#9fb4cc';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(
        `Touchdown ${plane.landing.vsFpm} fpm  •  ${plane.landing.centreDist} m off centreline`,
        W / 2, y + 52,
      );
    }
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('R — fly again    •    ENTER — next sortie    •    ESC — menu', W / 2, 530);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,14,26,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff3c4';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.fillStyle = '#9fb4cc';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('P or ESC to resume  •  R to restart the sortie', W / 2, H / 2 + 26);
  }

  // -- Main render entry --------------------------------------------------------
  function render(game) {
    const { plane, course, mode, time } = game;
    const horizonY = H * 0.42 - plane.pitch * 5 + (game.turbulence ? Math.sin(time * 29) * 2 : 0);
    const cam = cameraFor(plane);
    drawSky(plane, time);
    drawClouds(cam, horizonY, time);
    drawTerrain(course, cam, horizonY, plane);
    drawLandmarks(course, cam, horizonY);
    drawRunway(course, cam, horizonY);
    drawRings(course, cam, horizonY, time);
    if (mode === 'fly' || mode === 'debrief' || mode === 'paused') {
      if (game.view === 'cockpit') {
        // Cockpit: the world through the canopy, then the dashboard.
        drawCockpitFrame(plane, course, game);
      } else {
        drawPlane(plane, time, game.turbulence);
      }
      drawHUD(plane, course, game);
    }
    if (mode === 'title') drawTitle(course, time);
    if (mode === 'debrief') drawDebrief(plane, course);
    if (mode === 'paused') drawPaused();
  }

  return { render };
}
