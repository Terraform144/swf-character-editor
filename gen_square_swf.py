"""Generate a minimal SWF: a square shape inside a MovieClip (DefineSprite), placed on stage.

Pure binary SWF emission, no compiler needed.
Structure:
  DefineShape3 (id 1)  -> the square
  DefineSprite (id 2)  -> the MovieClip, 1 frame, containing the square at depth 1
  PlaceObject2         -> MovieClip instance on the main timeline
"""
import struct

STAGE_W, STAGE_H = 550, 400          # pixels
SQUARE = 100                          # pixels
FRAME_RATE = 30
VERSION = 8


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
        n = max(n, abs(v).bit_length() + 1)
    return n


def rect(xmin, xmax, ymin, ymax):
    w = BitWriter()
    nb = nbits_signed(xmin, xmax, ymin, ymax)
    w.ub(nb, 5)
    w.sb(xmin, nb)
    w.sb(xmax, nb)
    w.sb(ymin, nb)
    w.sb(ymax, nb)
    return w.flush()


def matrix(tx=0, ty=0):
    w = BitWriter()
    w.bit(0)                       # hasScale
    w.bit(0)                       # hasRotate
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


def define_shape3(shape_id, x, y, size, argb):
    """Solid-filled square with a 1px outline, in twips (1 px = 20 twips)."""
    s = size * 20
    body = bytearray()
    body += struct.pack('<H', shape_id)
    body += rect(x, x + s, y, y + s)

    # FillStyles: 1 solid fill (RGBA)
    body.append(1)
    body.append(0x00)              # solid fill
    body += bytes(argb)            # R, G, B, A
    # LineStyles: 1px black outline (RGBA)
    body.append(1)
    body += struct.pack('<H', 20)  # width in twips
    body += bytes((0x00, 0x00, 0x00, 0xFF))

    body.append((1 << 4) | 1)      # NumFillBits=1, NumLineBits=1

    w = BitWriter()
    # StyleChangeRecord: moveTo(0,0), fillStyle0=1, lineStyle=1
    w.bit(0)                       # TypeFlag: non-edge
    w.bit(0)                       # StateNewStyles
    w.bit(1)                       # StateLineStyle
    w.bit(0)                       # StateFillStyle1
    w.bit(1)                       # StateFillStyle0
    w.bit(1)                       # StateMoveTo
    w.ub(0, 5)                     # MoveBits = 0 -> deltas are (0,0)
    w.ub(1, 1)                     # FillStyle0 index = 1
    w.ub(1, 1)                     # LineStyle index = 1
    # Straight edges around the square
    nb = nbits_signed(s, -s) - 2
    for dx, dy in ((s, 0), (0, s), (-s, 0), (0, -s)):
        w.bit(1)                   # TypeFlag: edge
        w.bit(1)                   # StraightFlag
        w.ub(nb, 4)                # bits per value - 2
        w.bit(1)                   # GeneralLineFlag: both deltas follow
        w.sb(dx, nb + 2)
        w.sb(dy, nb + 2)
    for _ in range(6):
        w.bit(0)                   # EndShapeRecord
    body += w.flush()
    return tag(32, bytes(body))    # 32 = DefineShape3


def place_object2(depth, char_id, tx=0, ty=0):
    body = bytearray()
    body.append(0x06)              # HasCharacter | HasMatrix
    body += struct.pack('<H', depth)
    body += struct.pack('<H', char_id)
    body += matrix(tx, ty)
    return tag(26, bytes(body))    # 26 = PlaceObject2


def define_sprite(sprite_id, frame_count, control_tags):
    body = struct.pack('<HH', sprite_id, frame_count)
    body += b''.join(control_tags)
    return tag(39, bytes(body))    # 39 = DefineSprite


def build():
    # Inside the MovieClip: square (shape id 1) at local (0,0), depth 1
    sprite = define_sprite(2, 1, [
        define_shape3(1, 0, 0, SQUARE, (0xC0, 0x39, 0x2B, 0xFF)),  # red square
        place_object2(1, 1),
        tag(1, b''),               # ShowFrame
        tag(0, b''),               # End of sprite control tags
    ])
    # Main timeline
    body = b''.join([
        tag(9, bytes((0xFF, 0xFF, 0xFF))),                          # SetBackgroundColor white
        sprite,
        place_object2(1, 2, (STAGE_W - SQUARE) // 2 * 20, (STAGE_H - SQUARE) // 2 * 20),
        tag(1, b''),               # ShowFrame
        tag(0, b''),               # End
    ])

    # Header: FWS, version, file length, RECT, framerate 8.8, framecount
    header = bytearray()
    header += b'FWS'
    header.append(VERSION)
    header += b'____'              # file length placeholder (UI32 LE)
    header += rect(0, STAGE_W * 20, 0, STAGE_H * 20)
    header += struct.pack('<H', FRAME_RATE << 8)
    header += struct.pack('<H', 1)

    total = struct.pack('<I', len(header) + len(body))
    return bytes(header[:4] + total + header[8:] + body)


if __name__ == '__main__':
    swf = build()
    with open('square.swf', 'wb') as f:
        f.write(swf)
    print('square.swf written:', len(swf), 'bytes')
