// TRADEWIND RUN — seeded random numbers.
// One job: deterministic randomness, so every run of a mission builds the same course.

// mulberry32: small, fast, deterministic for a 32-bit seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1-D value noise from a seeded stream: returns a function f(t) in [-1, 1]
// built from a few octaves of interpolated random control points.
export function makeNoise1D(rand, points = 24, octaves = 3) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const n = points * (o + 1);
    const vals = [];
    for (let i = 0; i <= n; i++) vals.push(rand() * 2 - 1);
    layers.push({ n, vals, amp: 1 / (o + 1) });
  }
  return function noise(t) {
    let sum = 0;
    let ampSum = 0;
    for (const { n, vals, amp } of layers) {
      const x = ((t % 1) + 1) % 1 * n;
      const i = Math.floor(x);
      const f = x - i;
      const s = f * f * (3 - 2 * f); // smoothstep
      sum += (vals[i] * (1 - s) + vals[Math.min(i + 1, n)] * s) * amp;
      ampSum += amp;
    }
    return sum / ampSum;
  };
}

// Smooth 2-D value noise: f(x, z) in [-1, 1], deterministic per seed.
export function makeNoise2D(rand, grid = 12, octaves = 3) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const n = grid * (o + 1);
    const vals = [];
    for (let j = 0; j <= n; j++) {
      const row = [];
      for (let i = 0; i <= n; i++) row.push(rand() * 2 - 1);
      vals.push(row);
    }
    layers.push({ n, vals, amp: 1 / (o + 1) });
  }
  const smooth = (f) => f * f * (3 - 2 * f);
  return function noise(x, z) {
    let sum = 0;
    let ampSum = 0;
    for (const { n, vals, amp } of layers) {
      const fx = (((x % 1) + 1) % 1) * n;
      const fz = (((z % 1) + 1) % 1) * n;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const sx = smooth(fx - ix);
      const sz = smooth(fz - iz);
      const i2 = Math.min(ix + 1, n);
      const j2 = Math.min(iz + 1, n);
      const top = vals[iz][ix] * (1 - sx) + vals[iz][i2] * sx;
      const bot = vals[j2][ix] * (1 - sx) + vals[j2][i2] * sx;
      sum += (top * (1 - sz) + bot * sz) * amp;
      ampSum += amp;
    }
    return sum / ampSum;
  };
}
