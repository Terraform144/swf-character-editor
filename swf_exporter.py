"""SWF exporter for character animations.

Input model ("baked project", one frame per element of `frames`):

{
  "name": "Hero",
  "fps": 24,
  "stage": {"w": 550, "h": 400},
  "frames": [
    [ {"id": 1, "type": "rect", "x": 100, "y": 100, "w": 50, "h": 50,
       "rotation": 0, "scaleX": 1, "scaleY": 1,
       "fill": "#C0392B", "stroke": "#000000", "strokeWidth": 2,
       "points": [[dx, dy], ...],        # only for line/poly
       "depth": 0}, ...],                # layer order
    ...
  ]
}

Shape types: rect, ellipse, line, poly.
Geometry is always emitted centered on the shape-local origin (0,0);
x, y is the shape center on the stage, in pixels.

The exported SWF has the whole animation on its root timeline, so
`Loader.content as MovieClip` in AIR yields a playing MovieClip.
"""
import math
import struct

TAG_END = 0
TAG_SHOWFRAME = 1
TAG_SETBACKGROUNDCOLOR = 9
TAG_PLACEOBJECT2 = 26
TAG_DEFINESHAPE3 = 32
TAG_DEFINESPRITE = 39


class BitWriter:
    def __init__(self):
        self.data = bytearray()
        self.cur = 0
        self.n = 0

    def bit(self, b):
        self.cur = (self.cur << 1) | (b & 1)
        self.n += 1
        if self.n == 8:
            self.data.append(self.cur)
            self.cur = 0
            self.n = 0

    def ub(self, value, nbits):
        for i in range(nbits - 1, -1, -1):
            self.bit((value >> i) & 1)

    def sb(self, value, nbits):
        self.ub(value & ((1 << nbits) - 1), nbits)

    def flush(self):
        while self.n:
            self.bit(0)
        return bytes(self.data)


def nbits_signed(*vals):
    n = 1
    for v in vals:
        n = max(n, abs(int(round(v))).bit_length() + 1)
    return n


def rect_tag(xmin, xmax, ymin, ymax):
    w = BitWriter()
    nb = nbits_signed(xmin, xmax, ymin, ymax)
    w.ub(nb, 5)
    w.sb(xmin, nb)
    w.sb(xmax, nb)
    w.sb(ymin, nb)
    w.sb(ymax, nb)
    return w.flush()


def matrix(tx=0, ty=0, rotation=0.0, sx=1.0, sy=1.0):
    """SWF MATRIX: translate (twips) * rotation (rad) * scale."""
    w = BitWriter()
    rad = math.radians(rotation)
    a = sx * math.cos(rad)      # ScaleX
    d = sy * math.cos(rad)      # ScaleY
    b = sx * math.sin(rad)      # RotateSkew0
    c = -sy * math.sin(rad)     # RotateSkew1

    def fixed(v):
        return int(round(v * 65536.0))

    if abs(sx - 1.0) > 1e-9 or abs(sy - 1.0) > 1e-9 or abs(rotation) > 1e-9:
        fa, fd, fb, fc = fixed(a), fixed(d), fixed(b), fixed(c)
        nb = nbits_signed(fa, fd, fb, fc)
        w.bit(1)
        w.ub(nb, 5)
        w.sb(fa, nb)
        w.sb(fd, nb)
    else:
        w.bit(0)

    if abs(rotation) > 1e-9:
        fb, fc = fixed(b), fixed(c)
        nb = nbits_signed(fb, fc)
        w.bit(1)
        w.ub(nb, 5)
        w.sb(fb, nb)
        w.sb(fc, nb)
    else:
        w.bit(0)

    if tx or ty:
        nb = nbits_signed(tx, ty)
        w.ub(nb, 5)
        w.sb(tx, nb)
        w.sb(ty, nb)
    else:
        w.ub(0, 5)
    return w.flush()


def tag(code, body):
    if len(body) < 0x3F:
        return struct.pack('<H', (code << 6) | len(body)) + body
    return struct.pack('<H', (code << 6) | 0x3F) + struct.pack('<I', len(body)) + body


def parse_color(hexcolor, alpha=255):
    h = hexcolor.lstrip('#')
    if len(h) == 8:                       # RRGGBBAA
        return bytes((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16)))
    return bytes((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha))


def _path_records(w, pts, nfill, nline, close):
    """StyleChange + edge records through pts (twips, shape-local)."""
    start = pts[0]
    w.bit(0)                              # StyleChangeRecord
    w.bit(0)                              # StateNewStyles
    w.bit(1 if nline else 0)              # StateLineStyle
    w.bit(1 if nfill else 0)              # StateFillStyle1
    w.bit(1 if nfill else 0)              # StateFillStyle0
    w.bit(1)                              # StateMoveTo
    nb = nbits_signed(start[0], start[1])
    w.ub(nb, 5)
    w.sb(start[0], nb)
    w.sb(start[1], nb)
    if nfill:
        w.ub(1, nfill)                    # fill style index 1
        w.ub(0, nfill)
    if nline:
        w.ub(1, nline)                    # line style index 1
    # straight edges between consecutive points
    px, py = start
    for (nx, ny) in pts[1:]:
        dx, dy = nx - px, ny - py
        if dx == 0 and dy == 0:
            continue
        nb = nbits_signed(dx, dy) - 2
        w.bit(1)                          # edge record
        w.bit(1)                          # straight
        w.ub(nb, 4)
        w.bit(1)                          # general line: both deltas
        w.sb(dx, nb + 2)
        w.sb(dy, nb + 2)
        px, py = nx, ny
    if close:
        dx, dy = start[0] - px, start[1] - py
        if dx or dy:
            nb = nbits_signed(dx, dy) - 2
            w.bit(1); w.bit(1); w.ub(nb, 4); w.bit(1)
            w.sb(dx, nb + 2); w.sb(dy, nb + 2)
    for _ in range(6):
        w.bit(0)                          # EndShapeRecord
    w.flush()


def _rect_pts(w_tw, h_tw):
    x, y = int(round(w_tw / 2.0)), int(round(h_tw / 2.0))
    return [(-x, -y), (x, -y), (x, y), (-x, y)]


def _ellipse_curve_records(w_bw, rx, ry, nfill, nline):
    """Ellipse via 8 quadratic curved edges (tangent-intersection controls)."""
    w_bw.bit(0)                           # StyleChangeRecord
    w_bw.bit(0)
    w_bw.bit(1 if nline else 0)
    w_bw.bit(1 if nfill else 0)
    w_bw.bit(1 if nfill else 0)
    w_bw.bit(1)                           # StateMoveTo
    nb = nbits_signed(rx, 0)
    w_bw.ub(nb, 5)
    w_bw.sb(rx, nb)
    w_bw.sb(0, nb)
    if nfill:
        w_bw.ub(1, nfill); w_bw.ub(0, nfill)
    if nline:
        w_bw.ub(1, nline)

    px, py = rx, 0
    for i in range(8):
        a1 = i * math.pi / 4
        a2 = (i + 1) * math.pi / 4
        am = (a1 + a2) / 2
        f = 1.0 / math.cos(math.pi / 8)
        cx = int(round(f * rx * math.cos(am)))
        cy = int(round(f * ry * math.sin(am)))
        ax = int(round(rx * math.cos(a2)))
        ay = int(round(ry * math.sin(a2)))
        dcx, dcy = cx - px, cy - py
        dax, day = ax - cx, ay - cy
        nb = nbits_signed(dcx, dcy, dax, day) - 2
        w_bw.bit(1)                       # edge record
        w_bw.bit(0)                       # curved
        w_bw.ub(nb, 4)
        w_bw.sb(dcx, nb + 2)
        w_bw.sb(dcy, nb + 2)
        w_bw.sb(dax, nb + 2)
        w_bw.sb(day, nb + 2)
        px, py = ax, ay
    for _ in range(6):
        w_bw.bit(0)
    w_bw.flush()


def _geometry_key(shape):
    return (
        shape['type'],
        int(round(shape.get('w', 0) * 20)),
        int(round(shape.get('h', 0) * 20)),
        tuple((int(round(px * 20)), int(round(py * 20))) for px, py in shape.get('points', [])),
        shape.get('fill'),
        shape.get('stroke'),
        int(round(shape.get('strokeWidth', 0) * 20)),
    )


def define_shape3(shape_id, shape):
    """Geometry centered on (0,0), all values in twips."""
    body = bytearray()
    w_tw = int(round(shape.get('w', 0) * 20))
    h_tw = int(round(shape.get('h', 0) * 20))
    body += struct.pack('<H', shape_id)
    body += rect_tag(-w_tw // 2, w_tw // 2, -h_tw // 2, h_tw // 2)

    fill = shape.get('fill')
    stroke = shape.get('stroke')
    stroke_w = int(round(shape.get('strokeWidth', 0) * 20))
    nfill = 1 if fill else 0
    nline = 1 if stroke and stroke_w > 0 else 0

    body.append(nfill)
    if fill:
        body.append(0x00)
        body += parse_color(fill)
    body.append(nline)
    if nline:
        body += struct.pack('<H', max(stroke_w, 1))
        body += parse_color(stroke)

    nf = 1 if nfill else 0
    nl = 1 if nline else 0
    body.append((nf << 4) | nl)

    w = BitWriter()
    st = shape['type']
    if st == 'rect':
        _path_records(w, _rect_pts(w_tw, h_tw), nf, nl, close=True)
    elif st == 'ellipse':
        rx = int(round(w_tw / 2.0))
        ry = int(round(h_tw / 2.0))
        _ellipse_curve_records(w, rx, ry, nf, nl)
    elif st in ('line', 'poly'):
        pts = [(int(round(px * 20)), int(round(py * 20)))
               for px, py in shape.get('points', [])]
        if pts:
            _path_records(w, pts, nf, nl, close=(st == 'poly' and bool(fill)))
    body += w.data
    return tag(TAG_DEFINESHAPE3, bytes(body))


def place_object2(depth, char_id, tx=0, ty=0, rotation=0.0, sx=1.0, sy=1.0):
    body = bytearray()
    body.append(0x06)                      # HasCharacter | HasMatrix
    body += struct.pack('<H', depth)
    body += struct.pack('<H', char_id)
    body += matrix(tx, ty, rotation, sx, sy)
    return tag(TAG_PLACEOBJECT2, bytes(body))


def export_project(project):
    """Baked project dict -> SWF bytes."""
    stage = project.get('stage', {'w': 550, 'h': 400})
    fps = int(project.get('fps', 24))
    frames = project['frames']

    # Dedupe shape geometries across frames.
    shapes = {}          # geometry key -> shape id
    next_id = 1

    body = bytearray()
    body += tag(TAG_SETBACKGROUNDCOLOR, bytes((0xFF, 0xFF, 0xFF)))

    for frame_shapes in frames:
        for shape in frame_shapes:
            key = _geometry_key(shape)
            if key not in shapes:
                shapes[key] = next_id
                next_id += 1

    shape_defs = b''.join(
        define_shape3(shapes[k], _shape_from_key(k)) for k in shapes
    )
    # definitions must precede first use; rebuild order: defs then frames
    timeline = bytearray()
    for frame_shapes in frames:
        for shape in frame_shapes:
            timeline += place_object2(
                depth=int(shape.get('depth', 0)) + 1,
                char_id=shapes[_geometry_key(shape)],
                tx=int(round(shape['x'] * 20)),
                ty=int(round(shape['y'] * 20)),
                rotation=float(shape.get('rotation', 0)),
                sx=float(shape.get('scaleX', 1)) or 1e-6,
                sy=float(shape.get('scaleY', 1)) or 1e-6,
            )
        timeline += tag(TAG_SHOWFRAME, b'')
    body += shape_defs + timeline
    body += tag(TAG_END, b'')

    header = bytearray()
    header += b'FWS'
    header.append(9)
    header += b'____'
    header += rect_tag(0, int(stage['w']) * 20, 0, int(stage['h']) * 20)
    header += struct.pack('<H', fps << 8)
    header += struct.pack('<H', len(frames))

    total = struct.pack('<I', len(header) + len(body))
    return bytes(header[:4] + total + header[8:] + body)


def _shape_from_key(key):
    stype, w_tw, h_tw, pts, fill, stroke, stroke_w = key
    shape = {
        'type': stype,
        'w': w_tw / 20.0,
        'h': h_tw / 20.0,
        'fill': fill,
        'stroke': stroke,
        'strokeWidth': stroke_w / 20.0,
        'points': [(px / 20.0, py / 20.0) for px, py in pts],
    }
    return shape


if __name__ == '__main__':
    import json
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else 'character.json'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'character.swf'
    with open(src, 'r', encoding='utf-8') as f:
        project = json.load(f)
    data = export_project(project)
    with open(dst, 'wb') as f:
        f.write(data)
    print(f'{dst}: {len(data)} bytes, {len(project["frames"])} frames')
