"""Cross-check: PureVanilla_version/swf_exporter.js must produce byte-identical
SWF output to swf_exporter.py for the same baked project JSON.

Samples:
  1. TestHero  - rect/ellipse/line with rotation + scale (from test_export.py)
  2. WalkCycle - 5-frame tweened animation
  3. BrushTest - brush stroke outline polygon (generated via brush.js)
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import test_export                      # also re-runs the pyswf verification
from swf_exporter import export_project

SAMPLES = os.path.join(HERE, '_vanilla_samples')
os.makedirs(SAMPLES, exist_ok=True)
NODE = 'node'


def gen_walkcycle():
    frames = []
    for i in range(5):
        t = i / 4.0
        frames.append([
            {"id": 1, "type": "rect", "x": 100 + 200 * t, "y": 150, "w": 80, "h": 60,
             "rotation": 15 * t, "scaleX": 1, "scaleY": 1,
             "fill": "#C0392B", "stroke": "#333333", "strokeWidth": 2, "depth": 1000},
            {"id": 2, "type": "ellipse", "x": 100 + 200 * t, "y": 100 - 15 * t, "w": 40, "h": 40,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#F5C542", "stroke": "#000000", "strokeWidth": 1, "depth": 1001},
            {"id": 3, "type": "line", "x": 200, "y": 220,
             "w": 300, "h": 0,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "stroke": "#00AA00", "strokeWidth": 3, "depth": 0,
             "points": [[-150, 0], [150, 0]]},
        ])
    return {"name": "WalkCycle", "fps": 24, "stage": {"w": 400, "h": 300}, "frames": frames}


def gen_brush_json(dst):
    js = r'''
const B = require('./brush.js');
const pts = [];
for (let i = 0; i <= 40; i++) {
  const t = i / 40;
  pts.push([50 + t * 250, 150 + 40 * Math.sin(t * Math.PI * 3)]);
}
const r = B.brushToPoly(pts, 24, 'round');
const cx = Math.round(r.cx), cy = Math.round(r.cy);
const shape = { id: 1, type: 'poly', x: cx, y: cy, w: Math.round(r.w), h: Math.round(r.h),
  rotation: 0, scaleX: 1, scaleY: 1, fill: '#2C7A51', stroke: '#2C7A51', strokeWidth: 1,
  points: r.points.map(p => [Math.round(p[0] - cx), Math.round(p[1] - cy)]), depth: 1000 };
const frames = [];
for (let f = 0; f < 8; f++) {
  const cut = Math.max(3, Math.round(shape.points.length * (f + 1) / 8));
  frames.push([Object.assign({}, shape, { points: shape.points.slice(0, cut) })]);
}
require('fs').writeFileSync(process.argv[1],
  JSON.stringify({ name: 'BrushTest', fps: 12, stage: { w: 400, h: 300 }, frames: frames }));
console.log('brush sample: ' + shape.points.length + ' outline points');
'''
    r = subprocess.run([NODE, '-e', js, dst], cwd=HERE,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    print(r.stdout.strip())


def gen_point_tween():
    """Baked frames exactly as the editor's bake() produces them for a
    point-tweened animation: a line whose endpoints bend, and a rect whose
    w/h animate. Mirrors anim.js layerStateAt pairwise point lerp."""
    frames = []
    N = 6
    for i in range(N):
        t = i / (N - 1)
        # line: start endpoint stays, end endpoint lifts and moves right
        p1 = [-60, 0]
        p2 = [-60 + 120 * t, -50 * t]
        cx = (p1[0] + p2[0]) / 2
        cy = (p1[1] + p2[1]) / 2
        frames.append([
            {"id": 1, "type": "line", "x": 200 + cx, "y": 150 + cy,
             "w": abs(p2[0] - p1[0]), "h": abs(p2[1] - p1[1]),
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "stroke": "#8E44AD", "strokeWidth": 4, "depth": 1000,
             "points": [[p1[0] - cx, p1[1] - cy], [p2[0] - cx, p2[1] - cy]]},
            {"id": 2, "type": "rect", "x": 200, "y": 230, "w": 20 + 60 * t, "h": 60 - 40 * t,
             "rotation": 10 * t, "scaleX": 1, "scaleY": 1,
             "fill": "#16A085", "stroke": "#000000", "strokeWidth": 1, "depth": 0},
        ])
    return {"name": "PointTween", "fps": 24, "stage": {"w": 400, "h": 300}, "frames": frames}


def main():
    samples = {'Sample1_TestHero': test_export.project,
               'Sample2_WalkCycle': gen_walkcycle(),
               'Sample4_PointTween': gen_point_tween()}
    brush_json = os.path.join(SAMPLES, 'Sample3_BrushTest.json')
    gen_brush_json(brush_json)
    with open(brush_json, 'r', encoding='utf-8') as f:
        samples['Sample3_BrushTest'] = json.load(f)

    ok = True
    for name, proj in samples.items():
        pj = os.path.join(SAMPLES, name + '.json')
        with open(pj, 'w', encoding='utf-8') as f:
            json.dump(proj, f)

        py_out = os.path.join(SAMPLES, name + '_py.swf')
        with open(py_out, 'wb') as f:
            f.write(export_project(proj))

        js_out = os.path.join(SAMPLES, name + '_js.swf')
        r = subprocess.run(
            [NODE, os.path.join('PureVanilla_version', 'swf_exporter.js'), pj, js_out],
            cwd=HERE, capture_output=True, text=True)
        if r.returncode != 0:
            print('JS exporter failed for %s:\n%s' % (name, r.stderr))
            ok = False
            continue

        a = open(py_out, 'rb').read()
        b = open(js_out, 'rb').read()
        if a == b:
            print('IDENTICAL  %-20s %d bytes %s' % (name, len(a), r.stdout.strip()))
        else:
            ok = False
            print('DIFFER     %-20s python %d bytes vs js %d bytes' % (name, len(a), len(b)))
            for i, (x, y) in enumerate(zip(a, b)):
                if x != y:
                    print('  first difference at byte %d: py=%02x js=%02x' % (i, x, y))
                    break

    print('VANILLA PORT: ' + ('ALL BYTES IDENTICAL' if ok else 'MISMATCHES FOUND'))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
