/* Shape simplification: light jitter smoothing + Ramer-Douglas-Peucker.
   Pure functions, no DOM - testable under Node.

   simplifyPoints(pts, tolerance, closed, smoothPasses)
     pts          [[x,y], ...]
     tolerance    RDP epsilon: max allowed deviation from the original shape
     closed      true -> treat pts as a closed ring (brush outlines, filled polys)
     smoothPasses number of moving-average passes before simplification (default 1)

   Guarantees (with smoothPasses = 0):
     - every removed point lies within `tolerance` of the simplified outline
     - open paths keep their endpoints
     - closed rings keep at least 3 points, open paths at least 2
*/
(function (root) {
  'use strict';

  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function rdpOpen(pts, eps) {
    if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
    const ax = pts[0][0], ay = pts[0][1];
    const bx = pts[pts.length - 1][0], by = pts[pts.length - 1][1];
    let dmax = -1, index = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSeg(pts[i][0], pts[i][1], ax, ay, bx, by);
      if (d > dmax) { dmax = d; index = i; }
    }
    if (dmax > eps) {
      const left = rdpOpen(pts.slice(0, index + 1), eps);
      const right = rdpOpen(pts.slice(index), eps);
      return left.slice(0, -1).concat(right);
    }
    return [[ax, ay], [bx, by]];
  }

  function rdpClosed(ring, eps) {
    const n = ring.length;
    if (n < 5) return ring.map(p => [p[0], p[1]]);
    // split the ring at point 0 and the point farthest from it
    let k = 1, dmax = -1;
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
      if (d > dmax) { dmax = d; k = i; }
    }
    const ra = rdpOpen(ring.slice(0, k + 1), eps);
    const rb = rdpOpen(ring.slice(k).concat([ring[0]]), eps);
    const out = ra.slice(0, -1).concat(rb.slice(0, -1));
    return out.length >= 3 ? out : ring.map(p => [p[0], p[1]]);
  }

  function smoothOpenPts(pts, passes) {
    let p = pts.map(q => [q[0], q[1]]);
    for (let k = 0; k < passes; k++) {
      const q = p.map(r => [r[0], r[1]]);
      for (let i = 1; i < p.length - 1; i++) {
        q[i] = [(p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4,
                (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4];
      }
      p = q;
    }
    return p;
  }

  function smoothCyclic(pts, passes) {
    let p = pts.map(q => [q[0], q[1]]);
    const n = p.length;
    for (let k = 0; k < passes; k++) {
      const q = [];
      for (let i = 0; i < n; i++) {
        const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
        q.push([(a[0] + 2 * b[0] + c[0]) / 4,
                (a[1] + 2 * b[1] + c[1]) / 4]);
      }
      p = q;
    }
    return p;
  }

  function simplifyPoints(pts, tolerance, closed, smoothPasses) {
    const passes = smoothPasses === undefined ? 1 : Math.max(0, smoothPasses);
    const eps = Math.max(0.1, tolerance);
    let p = pts.map(q => [q[0], q[1]]);
    if (passes > 0) p = closed ? smoothCyclic(p, passes) : smoothOpenPts(p, passes);
    p = closed ? rdpClosed(p, eps) : rdpOpen(p, eps);
    const min = closed ? 3 : 2;
    return p.length >= min ? p : pts.map(q => [q[0], q[1]]);
  }

  const api = { simplifyPoints, rdpOpen, rdpClosed, smoothOpenPts, smoothCyclic };
  root.Simplify = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
