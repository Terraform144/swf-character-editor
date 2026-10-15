// Unit tests for brush.js geometry (run: node test_brush.js)
'use strict';
const B = require('./brush.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}
function noNaN(pts) { return pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])); }

// helpers: stroke samplers
const flatLine = [];
for (let i = 0; i <= 20; i++) flatLine.push([i * 5, 100]);           // horizontal 100px
const diagLine = [];
for (let i = 0; i <= 20; i++) diagLine.push([i * 3.5, 100 + i * 3.5]); // 45 deg

// 1. flat pattern: constant width, butt caps
{
  const r = B.brushToPoly(flatLine, 10, 'flat');
  check('flat: bbox height == size', Math.abs(r.h - 10) < 0.6, 'h=' + r.h);
  check('flat: bbox width == length (no caps)', Math.abs(r.w - 100) < 0.6, 'w=' + r.w);
  check('flat: no NaN', noNaN(r.points));
  check('flat: closed outline = 2n points', r.points.length === 42, 'len=' + r.points.length);
}

// 2. round pattern: round caps extend bbox by half size on each end
{
  const r = B.brushToPoly(flatLine, 10, 'round');
  check('round: bbox height == size', Math.abs(r.h - 10) < 0.8, 'h=' + r.h);
  check('round: caps extend width', Math.abs(r.w - 100 - 10) < 1.2, 'w=' + r.w);
  check('round: no NaN', noNaN(r.points));
}

// 3. calligraphy: thinner along the 45deg nib direction, wider perpendicular
{
  const along = B.brushToPoly(diagLine, 10, 'calligraphy');
  const across = B.brushToPoly(flatLine, 10, 'calligraphy');
  const alongW = Math.min(along.h, along.w);   // stroke is 45deg; the width direction crosses it
  // measure real width: sample width perpendicular to direction via bbox of rotated stroke
  // simpler: diagonal stroke bbox is (len+size-ish) x (len+...) - instead verify via halfWidthAt
  const hwAlongNib = B.halfWidthAt(0.5, Math.PI / 4, 10, 'calligraphy'); // stroke at 45deg = nib angle
  const hwPerp = B.halfWidthAt(0.5, 0, 10, 'calligraphy');                // horizontal stroke
  check('calligraphy: nib direction is thin', hwAlongNib < hwPerp * 0.55, hwAlongNib.toFixed(2) + ' vs ' + hwPerp.toFixed(2));
  check('calligraphy: never below 8% of size', hwAlongNib >= 10 * 0.079, 'hw=' + hwAlongNib);
  check('calligraphy: no NaN', noNaN(along.points) && noNaN(across.points));
}

// 4. taper: zero-width ends, full width in the middle
{
  check('taper: mid == full half width', Math.abs(B.halfWidthAt(0.5, 0, 10, 'taper') - 5) < 1e-9);
  check('taper: ends are thin', B.halfWidthAt(0, 0, 10, 'taper') < 1e-9 && B.halfWidthAt(1, 0, 10, 'taper') < 1e-9);
  const r = B.brushToPoly(flatLine, 10, 'taper');
  check('taper: bbox height ~ size at middle', Math.abs(r.h - 10) < 0.8, 'h=' + r.h);
  check('taper: no NaN', noNaN(r.points));
}

// 5. dabs (single click)
{
  const r = B.brushToPoly([[50, 50]], 12, 'round');
  check('round dab: 12x12 circle-ish', Math.abs(r.w - 12) < 0.8 && Math.abs(r.h - 12) < 0.8, r.w + 'x' + r.h);
  const f = B.brushToPoly([[50, 50]], 12, 'flat');
  check('flat dab: square', Math.abs(f.w - 12) < 0.8 && Math.abs(f.h - 12) < 0.8, f.w + 'x' + f.h);
  const c = B.brushToPoly([[50, 50]], 12, 'calligraphy');
  check('calligraphy dab: fits in bbox', c.w <= 12.8 && c.h <= 12.8, c.w + 'x' + c.h);
  // thin across the nib: project outline onto the +45deg direction (perpendicular to the -45deg nib)
  const cos45 = Math.SQRT1_2, sin45 = Math.SQRT1_2;
  const proj = c.points.map(p => (p[0] - 50) * cos45 + (p[1] - 50) * sin45);
  const thin = Math.max(...proj) - Math.min(...proj);
  check('calligraphy dab: thin across the nib', thin <= 12 * 0.3 * 2 + 1, 'thin=' + thin.toFixed(2));
  check('dabs: no NaN', noNaN(r.points) && noNaN(f.points) && noNaN(c.points));
}

// 6. curved stroke sanity
{
  const curve = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    curve.push([t * 100, 100 + 30 * Math.sin(t * Math.PI * 2)]);
  }
  for (const pat of ['round', 'flat', 'calligraphy', 'taper']) {
    const r = B.brushToPoly(curve, 14, pat);
    check('curve ' + pat + ': no NaN', noNaN(r.points));
    check('curve ' + pat + ': bbox covers width', r.h >= 14 - 1.5 && r.h <= 30 * 2 + 14 + 2, 'h=' + r.h);
    check('curve ' + pat + ': >= 2x30 outline points', r.points.length >= 60, 'len=' + r.points.length);
  }
}

// 7. smoothing keeps endpoints and shortens noise
{
  const noisy = [[0, 0], [10, 5], [20, -5], [30, 0]];
  const s = B.smoothPoints(noisy, 2);
  check('smooth: endpoints preserved', s[0][0] === 0 && s[0][1] === 0 && s[3][0] === 30);
  check('smooth: interior moved toward middle', Math.abs(s[1][1]) < 5 && Math.abs(s[2][1]) < 5);
}

console.log(failures === 0 ? '\nALL BRUSH TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
