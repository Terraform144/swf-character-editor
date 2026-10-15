// Unit tests for anim.js interpolation (run: node test_anim.js)
'use strict';
const A = require('./anim.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}
const close = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

// basic transform tween (regression)
{
  const L = { keyframes: [
    { frame: 1, shapes: [{ id: 1, type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, scaleX: 1, scaleY: 1 }] },
    { frame: 11, shapes: [{ id: 1, type: 'rect', x: 100, y: 40, w: 10, h: 10, rotation: 90, scaleX: 2, scaleY: 3 }] }
  ] };
  const mid = A.layerStateAt(L, 6);
  check('transform tween t=0.5', close(mid[0].x, 50) && close(mid[0].y, 20) &&
        close(mid[0].rotation, 45) && close(mid[0].scaleX, 1.5) && close(mid[0].scaleY, 2),
        JSON.stringify(mid[0]));
}

// w/h tween (rect/ellipse geometry animation)
{
  const L = { keyframes: [
    { frame: 1, shapes: [{ id: 1, type: 'ellipse', x: 50, y: 50, w: 10, h: 40, rotation: 0, scaleX: 1, scaleY: 1 }] },
    { frame: 5, shapes: [{ id: 1, type: 'ellipse', x: 50, y: 50, w: 30, h: 40, rotation: 0, scaleX: 1, scaleY: 1 }] }
  ] };
  const m = A.layerStateAt(L, 3);
  check('ellipse w tween', close(m[0].w, 20) && close(m[0].h, 40), JSON.stringify(m[0]));
}

// point-wise tween: line endpoints animate
{
  const L = { keyframes: [
    { frame: 1,  shapes: [{ id: 1, type: 'line', x: 50, y: 50, w: 100, h: 0, rotation: 0, scaleX: 1, scaleY: 1,
                            fill: '', stroke: '#000', strokeWidth: 2, points: [[-50, 0], [50, 0]] }] },
    { frame: 9, shapes: [{ id: 1, type: 'line', x: 50, y: 50, w: 100, h: 0, rotation: 0, scaleX: 1, scaleY: 1,
                            fill: '', stroke: '#000', strokeWidth: 2, points: [[-50, -40], [50, 80]] }] }
  ] };
  const m = A.layerStateAt(L, 5);   // t = 0.5
  check('line endpoints tween', close(m[0].points[0][1], -20) && close(m[0].points[1][1], 40),
        JSON.stringify(m[0].points));
}

// brush outline morph: same point count tween
{
  const ptsA = [], ptsB = [];
  for (let i = 0; i < 20; i++) { ptsA.push([i * 5, 0]); ptsB.push([i * 5, i % 2 ? 10 : -10]); }
  const L = { keyframes: [
    { frame: 1,  shapes: [{ id: 1, type: 'poly', x: 47, y: 100, w: 95, h: 0, rotation: 0, scaleX: 1, scaleY: 1,
                            fill: '#123456', stroke: '#123456', strokeWidth: 1, points: ptsA }] },
    { frame: 41, shapes: [{ id: 1, type: 'poly', x: 47, y: 100, w: 95, h: 10, rotation: 0, scaleX: 1, scaleY: 1,
                            fill: '#123456', stroke: '#123456', strokeWidth: 1, points: ptsB }] }
  ] };
  const m = A.layerStateAt(L, 21);  // t = 0.5
  check('brush outline morph t=0.5',
        m[0].points.every((p, i) => close(p[1], (ptsA[i][1] + ptsB[i][1]) / 2)),
        JSON.stringify(m[0].points.slice(0, 3)));
}

// mismatched point counts: hold, do not crash
{
  const L = { keyframes: [
    { frame: 1, shapes: [{ id: 1, type: 'poly', x: 0, y: 0, w: 10, h: 10, rotation: 0, scaleX: 1, scaleY: 1,
                           fill: '#111', stroke: '#111', strokeWidth: 1, points: [[0, 0], [10, 0], [5, 10]] }] },
    { frame: 9, shapes: [{ id: 1, type: 'poly', x: 0, y: 0, w: 10, h: 10, rotation: 0, scaleX: 1, scaleY: 1,
                           fill: '#111', stroke: '#111', strokeWidth: 1, points: [[1, 1], [9, 1], [5, 9], [9, 9]] }] }
  ] };
  const m = A.layerStateAt(L, 5);
  check('mismatched point count holds prev', m[0].points.length === 3 && close(m[0].points[0][0], 0),
        JSON.stringify(m[0].points));
}

// CRITICAL: returned point arrays must be fresh - mutating them must not
// corrupt the source keyframes (this is what point editing relies on)
{
  const L = { keyframes: [
    { frame: 1, shapes: [{ id: 1, type: 'poly', x: 0, y: 0, w: 10, h: 10, rotation: 0, scaleX: 1, scaleY: 1,
                           fill: '#111', stroke: '#111', strokeWidth: 1, points: [[0, 0], [10, 0], [5, 10]] }] },
    { frame: 11, shapes: [{ id: 1, type: 'poly', x: 0, y: 0, w: 10, h: 10, rotation: 0, scaleX: 1, scaleY: 1,
                           fill: '#111', stroke: '#111', strokeWidth: 1, points: [[5, 0], [10, 0], [5, 10]] }] }
  ] };
  const m = A.layerStateAt(L, 6);
  m[0].points[0][0] = 999;          // simulate a point drag on the snapshot
  const again = A.layerStateAt(L, 6);
  check('snapshot mutation does not corrupt keyframes', again[0].points[0][0] === 2.5,
        'got ' + again[0].points[0][0]);
}

// hold semantics: before first kf, after last, held-then-gone, appears-at-next
{
  const L = { keyframes: [
    { frame: 3, shapes: [{ id: 1, type: 'rect', x: 5, y: 5, w: 8, h: 8, rotation: 0, scaleX: 1, scaleY: 1 }] },
    { frame: 6, shapes: [{ id: 2, type: 'rect', x: 9, y: 9, w: 8, h: 8, rotation: 0, scaleX: 1, scaleY: 1 }] }
  ] };
  check('hold backwards before first kf', A.layerStateAt(L, 1)[0].x === 5);
  check('id2 hidden before its kf', A.layerStateAt(L, 4).every(s => s.id === 1));
  check('id1 held until next kf', A.layerStateAt(L, 5).some(s => s.id === 1));
  check('after last kf holds', A.layerStateAt(L, 9)[0].id === 2);
}

// empty layer
{
  check('empty layer -> empty state', A.layerStateAt({ keyframes: [] }, 5).length === 0);
}

console.log(failures === 0 ? '\nALL ANIM TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
