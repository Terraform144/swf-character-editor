"""Test swf_exporter: build a sample animated character, verify the SWF with pyswf."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from swf_exporter import export_project

project = {
    "name": "TestHero",
    "fps": 24,
    "stage": {"w": 200, "h": 200},
    "frames": [
        [   # frame 1: body rect at left, eye ellipse, ground line
            {"id": 1, "type": "rect", "x": 60, "y": 120, "w": 80, "h": 50,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#C0392B", "stroke": "#333333", "strokeWidth": 2, "depth": 0},
            {"id": 2, "type": "ellipse", "x": 60, "y": 100, "w": 20, "h": 20,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#FFFFFF", "stroke": "#000000", "strokeWidth": 1, "depth": 1},
            {"id": 3, "type": "line", "x": 100, "y": 160,
             "w": 100, "h": 0,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "stroke": "#00AA00", "strokeWidth": 3,
             "points": [[-50, 0], [50, 0]], "depth": 2},
        ],
        [   # frame 2: rect moved right, rotated, scaled; eye follows
            {"id": 1, "type": "rect", "x": 120, "y": 110, "w": 80, "h": 50,
             "rotation": 30, "scaleX": 1.2, "scaleY": 0.8,
             "fill": "#C0392B", "stroke": "#333333", "strokeWidth": 2, "depth": 0},
            {"id": 2, "type": "ellipse", "x": 120, "y": 90, "w": 20, "h": 20,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#FFFFFF", "stroke": "#000000", "strokeWidth": 1, "depth": 1},
            {"id": 3, "type": "line", "x": 100, "y": 160,
             "w": 100, "h": 0,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "stroke": "#00AA00", "strokeWidth": 3,
             "points": [[-50, 0], [50, 0]], "depth": 2},
        ],
        [   # frame 3: same as frame 1 but stroke-only rect scale differs
            {"id": 1, "type": "rect", "x": 60, "y": 120, "w": 80, "h": 50,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#C0392B", "stroke": "#333333", "strokeWidth": 2, "depth": 0},
            {"id": 2, "type": "ellipse", "x": 60, "y": 100, "w": 20, "h": 20,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "fill": "#FFFFFF", "stroke": "#000000", "strokeWidth": 1, "depth": 1},
            {"id": 3, "type": "line", "x": 100, "y": 160,
             "w": 100, "h": 0,
             "rotation": 0, "scaleX": 1, "scaleY": 1,
             "stroke": "#00AA00", "strokeWidth": 3,
             "points": [[-50, 0], [50, 0]], "depth": 2},
        ],
    ],
}

os.makedirs(os.path.join(HERE, 'exports'), exist_ok=True)
swf = export_project(project)
out = os.path.join(HERE, 'exports', 'TestHero.swf')
with open(out, 'wb') as f:
    f.write(swf)
print(f'{out}: {len(swf)} bytes, 3 frames')

# Verification with pyswf
PY = [
    "import sys, io, importlib",
    "sys.modules['StringIO'] = io",
    "for m in ['consts','utils','actions','data','filters','stream','geom','tag','export']:",
    "    sys.modules[m] = importlib.import_module('swf.' + m)",
    "from swf.movie import SWF, SWFHeader",
    "from swf.stream import SWFStream",
    "from swf.tag import TagDefineShape3, TagPlaceObject2, TagShowFrame, TagEnd",
    "",
    "st = SWFStream(open(r'%s', 'rb'))" % out.replace('\\', '/'),
    "header = SWFHeader(st)",
    "movie = SWF(); movie._header = header",
    "movie.parse_tags(st)",
    "print('header: fps', header.frame_rate, 'frames', header.frame_count, 'stage', header.frame_size.xmax//20, 'x', header.frame_size.ymax//20)",
    "assert header.frame_count == 3, header.frame_count",
    "shapes = [t for t in movie.tags if isinstance(t, TagDefineShape3)]",
    "places = [t for t in movie.tags if isinstance(t, TagPlaceObject2)]",
    "frames = [t for t in movie.tags if isinstance(t, TagShowFrame)]",
    "assert isinstance(movie.tags[-1], TagEnd)",
    "print('unique shapes:', len(shapes), '(expected 3: rect, ellipse, line)')",
    "assert len(shapes) == 3",
    "print('place tags:', len(places), '(expected 9: 3 shapes x 3 frames)')",
    "assert len(places) == 9",
    "assert len(frames) == 3, len(frames)",
    "f2_rect = places[3]   # frame 2, shape 1 (rect moved/rotated/scaled)",
    "m = f2_rect.matrix",
    "print('frame2 rect: tx,ty =', m.translateX, m.translateY, 'twips; scaleX', m.scaleX if hasattr(m,'scaleX') else '?')",
    "assert m.translateX == 2400 and m.translateY == 2200, (m.translateX, m.translateY)",
    "for p in places:",
    "    print('  place: char', p.characterId, 'depth', p.depth, 'tx', p.matrix.translateX, 'ty', p.matrix.translateY)",
    "print('ALL EXPORT TESTS PASSED')",
]

r = subprocess.run([sys.executable, '-c', '\n'.join(PY)],
                   capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr)
    sys.exit(1)
