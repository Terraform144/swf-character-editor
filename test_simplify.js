// Unit tests for simplify.js (run: node test_simplify.js)
'use strict';
const S = require('./simplify.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}
const close = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);
const sum = arr => arr.reduce((a, b) => a + b, 0);

// distance of point p to polyline (open) or ring (closed)
function maxDev(pts, poly, closed) {
  let worst = 0;
  const n = poly.length;
  const segs = closed ? n : n - 1;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < segs; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

// 1. open: collinear chain collapses to its endpoints
{
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push([i * 5, 0]);
  const out = S.simplifyPoints(pts, 1, false, 0);
  check('collinear open -> 2 endpoints', out.length === 2, JSON.stringify(out));
  check('endpoints exact', out[0][0] === 0 && out[1][0] === 50);
}

// 2. open: spike above tolerance survives, below tolerance is removed
{
  const flat = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const spiked = [[0, 0], [10, 0], [15, 6], [20, 0], [30, 0]];
  check('small deviation removed (tol 4)', S.simplifyPoints(flat.concat([]), 4, false, 0).length === 2);
  const keep = S.simplifyPoints(spiked, 4, false, 0);
  check('spike kept (tol 4)', keep.some(p => close(p[1], 6)), JSON.stringify(keep));
  check('spike dropped at high tol (8)', S.simplifyPoints(spiked, 8, false, 0).length === 2);
}

// 3. open: endpoints always preserved
{
  const pts = [];
  for (let i = 0; i <= 30; i++) pts.push([i * 4, Math.sin(i / 3) * 8]);
  const out = S.simplifyPoints(pts, 2, false, 1);
  check('open endpoints preserved', out[0][0] === 0 && out[out.length - 1][0] === 120);
  check('noisy sine simplified', out.length < pts.length, out.length + ' vs ' + pts.length);
  check('fidelity within tol (+smoothing)', maxDev(pts, out, false) <= 2 + 2.5,
        'maxdev=' + maxDev(pts, out, false).toFixed(2));
}

// 4. closed ring: square outline with midpoints -> 4 corners (tol 1)
{
  const ring = [];
  const corners = [[0, 0], [40, 0], [40, 40], [0, 40]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let k = 0; k < 5; k++) ring.push([a[0] + (b[0] - a[0]) * k / 5, a[1] + (b[1] - a[1]) * k / 5]);
  }
  const out = S.simplifyPoints(ring, 1, true, 0);
  check('square ring -> ~4 corners', out.length <= 6, 'len=' + out.length);
  check('ring still closed (>= 3 pts)', out.length >= 3);
  check('ring fidelity', maxDev(ring, out, true) <= 1 + 0.05, 'maxdev=' + maxDev(ring, out, true).toFixed(3));
}

// 5. closed ring: circle (40 pts) simplified, bounded error, still round-ish
{
  const ring = [];
  for (let i = 0; i < 40; i++) {
    const a = 2 * Math.PI * i / 40;
    ring.push([50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)]);
  }
  const out = S.simplifyPoints(ring, 1, true, 0);
  check('circle simplifies', out.length < 40 && out.length >= 6, 'len=' + out.length);
  check('circle fidelity <= tol', maxDev(ring, out, true) <= 1 + 0.05,
        'maxdev=' + maxDev(ring, out, true).toFixed(3));
}

// 6. smoothing: jitter noise is reduced, endpoints and rough centroid kept
{
  const noisy = [];
  for (let i = 0; i <= 20; i++) noisy.push([i * 5, 20 + (i % 2 ? 3 : -3)]);
  const sm = S.smoothOpenPts(noisy, 2);
  const yRange = a => Math.max(...a.map(p => p[1])) - Math.min(...a.map(p => p[1]));
  check('smoothing reduces jitter', yRange(sm) < yRange(noisy),
        yRange(sm).toFixed(2) + ' vs ' + yRange(noisy).toFixed(2));
  check('smoothing keeps endpoints', sm[0][1] === noisy[0][1] && sm[sm.length - 1][1] === noisy[noisy.length - 1][1],
        sm[0][1] + ',' + sm[sm.length - 1][1]);
  const cyclic = ring => S.smoothCyclic(ring, 1);
  check('cyclic smoothing preserves length', cyclic(noisy).length === noisy.length);
}

// 7. tiny inputs are safe
{
  check('2-pt open stays 2', S.simplifyPoints([[0, 0], [10, 10]], 5, false, 1).length === 2);
  check('3-pt closed stays >= 3', S.simplifyPoints([[0, 0], [5, 5], [10, 0]], 5, true, 1).length >= 3);
  check('empty open ok', S.simplifyPoints([], 5, false, 1).length === 0);
}

// 8. brush outline scenario: wavy 96-pt ring simplified heavily but recognizable
{
  const ring = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 96;
    const a = 2 * Math.PI * t;
    ring.push([100 + 60 * Math.cos(a) + 8 * Math.sin(a * 5), 80 + 30 * Math.sin(a) + 5 * Math.cos(a * 4)]);
  }
  for (const [tol, maxPts] of [[0.5, 96], [2, 60], [5, 35]]) {
    const out = S.simplifyPoints(ring, tol, true, 1);
    check('brush ring tol=' + tol + ' reduces points', out.length < 96 && out.length >= 8,
          'len=' + out.length);
  }
  const out = S.simplifyPoints(ring, 0.5, true, 1);
  check('brush ring tight tol fidelity', maxDev(ring, out, true) <= 0.5 + 2.5,
        'maxdev=' + maxDev(ring, out, true).toFixed(2));
}

console.log(failures === 0 ? '\nALL SIMPLIFY TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
