/* Pure JS SWF exporter - byte-compatible with swf_exporter.py.
   Baked project model (identical to the Python version):

   { "name": "Hero", "fps": 24, "stage": {"w":550,"h":400},
     "frames": [ [ {id, type:"rect"|"ellipse"|"line"|"poly",
                    x, y, w, h, rotation, scaleX, scaleY,
                    fill, stroke, strokeWidth, points, depth}, ... ], ... ] }

   Usage (browser): const bytes = SWFExporter.exportProject(project);
   Usage (node):    node swf_exporter.js character.json character.swf
*/
(function (root) {
  'use strict';

  const TAG_END = 0, TAG_SHOWFRAME = 1, TAG_SETBACKGROUNDCOLOR = 9,
        TAG_PLACEOBJECT2 = 26, TAG_DEFINESHAPE3 = 32, TAG_DEFINESPRITE = 39;

  // Python-compatible round (round-half-to-even) so output stays byte-identical.
  function pyRound(v) {
    const f = Math.floor(v), d = v - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
  }

  function bitLength(v) { return v === 0 ? 0 : v.toString(2).length; }

  function u16le(v) { return [v & 255, (v >> 8) & 255]; }
  function u32le(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }

  class BitWriter {
    constructor() { this.data = []; this.cur = 0; this.n = 0; }
    bit(b) {
      this.cur = (this.cur << 1) | (b & 1);
      this.n++;
      if (this.n === 8) { this.data.push(this.cur); this.cur = 0; this.n = 0; }
    }
    ub(value, nbits) {
      for (let i = nbits - 1; i >= 0; i--) this.bit(Math.floor(value / Math.pow(2, i)) % 2);
    }
    sb(value, nbits) {
      const m = Math.pow(2, nbits);
      this.ub(((value % m) + m) % m, nbits);
    }
    flush() {
      while (this.n) this.bit(0);
      return this.data;
    }
  }

  function nbitsSigned(...vals) {
    let n = 1;
    for (const v of vals) n = Math.max(n, bitLength(Math.abs(pyRound(v))) + 1);
    return n;
  }

  function rectTag(xmin, xmax, ymin, ymax) {
    const w = new BitWriter();
    const nb = nbitsSigned(xmin, xmax, ymin, ymax);
    w.ub(nb, 5);
    w.sb(xmin, nb); w.sb(xmax, nb); w.sb(ymin, nb); w.sb(ymax, nb);
    return w.flush();
  }

  function matrix(tx, ty, rotation, sx, sy) {
    const w = new BitWriter();
    const rad = (rotation || 0) * Math.PI / 180;
    const a = sx * Math.cos(rad);       // ScaleX
    const d = sy * Math.cos(rad);       // ScaleY
    const b = sx * Math.sin(rad);       // RotateSkew0
    const c = -sy * Math.sin(rad);      // RotateSkew1
    const fixed = v => pyRound(v * 65536.0);

    if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9 || Math.abs(rotation) > 1e-9) {
      const fa = fixed(a), fd = fixed(d), fb = fixed(b), fc = fixed(c);
      const nb = nbitsSigned(fa, fd, fb, fc);
      w.bit(1);
      w.ub(nb, 5);
      w.sb(fa, nb); w.sb(fd, nb);
    } else {
      w.bit(0);
    }
    if (Math.abs(rotation) > 1e-9) {
      const fb = fixed(b), fc = fixed(c);
      const nb = nbitsSigned(fb, fc);
      w.bit(1);
      w.ub(nb, 5);
      w.sb(fb, nb); w.sb(fc, nb);
    } else {
      w.bit(0);
    }
    if (tx || ty) {
      const nb = nbitsSigned(tx, ty);
      w.ub(nb, 5);
      w.sb(tx, nb); w.sb(ty, nb);
    } else {
      w.ub(0, 5);
    }
    return w.flush();
  }

  function tag(code, body) {
    if (body.length < 0x3F) {
      const h = (code << 6) | body.length;
      return u16le(h).concat(body);
    }
    const h = (code << 6) | 0x3F;
    return u16le(h).concat(u32le(body.length), body);
  }

  function parseColor(hexcolor, alpha) {
    const h = String(hexcolor || '').replace('#', '');
    if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
                                parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16), alpha === undefined ? 255 : alpha];
  }

  function pathRecords(w, pts, nfill, nline, close) {
    const start = pts[0];
    w.bit(0);                                  // StyleChangeRecord
    w.bit(0);                                  // StateNewStyles
    w.bit(nline ? 1 : 0);                      // StateLineStyle
    w.bit(nfill ? 1 : 0);                      // StateFillStyle1
    w.bit(nfill ? 1 : 0);                      // StateFillStyle0
    w.bit(1);                                  // StateMoveTo
    const nb = nbitsSigned(start[0], start[1]);
    w.ub(nb, 5);
    w.sb(start[0], nb); w.sb(start[1], nb);
    if (nfill) { w.ub(1, nfill); w.ub(0, nfill); }
    if (nline) { w.ub(1, nline); }
    let px = start[0], py = start[1];
    for (let i = 1; i < pts.length; i++) {
      const nx = pts[i][0], ny = pts[i][1];
      const dx = nx - px, dy = ny - py;
      if (dx === 0 && dy === 0) continue;
      const nb2 = nbitsSigned(dx, dy) - 2;
      w.bit(1); w.bit(1);                      // edge, straight
      w.ub(nb2, 4);
      w.bit(1);                                // general line: both deltas
      w.sb(dx, nb2 + 2); w.sb(dy, nb2 + 2);
      px = nx; py = ny;
    }
    if (close) {
      const dx = start[0] - px, dy = start[1] - py;
      if (dx || dy) {
        const nb2 = nbitsSigned(dx, dy) - 2;
        w.bit(1); w.bit(1); w.ub(nb2, 4); w.bit(1);
        w.sb(dx, nb2 + 2); w.sb(dy, nb2 + 2);
      }
    }
    for (let i = 0; i < 6; i++) w.bit(0);      // EndShapeRecord
    w.flush();
  }

  function rectPts(wTw, hTw) {
    const x = Math.floor(wTw / 2), y = Math.floor(hTw / 2);
    return [[-x, -y], [x, -y], [x, y], [-x, y]];
  }

  function ellipseCurveRecords(w, rx, ry, nfill, nline) {
    w.bit(0);                                  // StyleChangeRecord
    w.bit(0);
    w.bit(nline ? 1 : 0);
    w.bit(nfill ? 1 : 0);
    w.bit(nfill ? 1 : 0);
    w.bit(1);                                  // StateMoveTo
    const nb = nbitsSigned(rx, 0);
    w.ub(nb, 5);
    w.sb(rx, nb); w.sb(0, nb);
    if (nfill) { w.ub(1, nfill); w.ub(0, nfill); }
    if (nline) { w.ub(1, nline); }

    let px = rx, py = 0;
    const f = 1.0 / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a1 = i * Math.PI / 4, a2 = (i + 1) * Math.PI / 4, am = (a1 + a2) / 2;
      const cx = pyRound(f * rx * Math.cos(am));
      const cy = pyRound(f * ry * Math.sin(am));
      const ax = pyRound(rx * Math.cos(a2));
      const ay = pyRound(ry * Math.sin(a2));
      const dcx = cx - px, dcy = cy - py, dax = ax - cx, day = ay - cy;
      const nb2 = nbitsSigned(dcx, dcy, dax, day) - 2;
      w.bit(1);                                // edge record
      w.bit(0);                                // curved
      w.ub(nb2, 4);
      w.sb(dcx, nb2 + 2); w.sb(dcy, nb2 + 2);
      w.sb(dax, nb2 + 2); w.sb(day, nb2 + 2);
      px = ax; py = ay;
    }
    for (let i = 0; i < 6; i++) w.bit(0);
    w.flush();
  }

  function geometryKey(shape) {
    const pts = (shape.points || []).map(p => [pyRound(p[0] * 20), pyRound(p[1] * 20)]);
    return JSON.stringify([
      shape.type,
      pyRound((shape.w || 0) * 20),
      pyRound((shape.h || 0) * 20),
      pts,
      shape.fill || null,
      shape.stroke || null,
      pyRound((shape.strokeWidth || 0) * 20)
    ]);
  }

  function shapeFromKey(key) {
    const [type, wTw, hTw, pts, fill, stroke, strokeW] = JSON.parse(key);
    return {
      type, w: wTw / 20, h: hTw / 20, fill: fill, stroke: stroke,
      strokeWidth: strokeW / 20,
      points: pts.map(p => [p[0] / 20, p[1] / 20])
    };
  }

  function defineShape3(shapeId, shape) {
    const body = [];
    const wTw = pyRound((shape.w || 0) * 20);
    const hTw = pyRound((shape.h || 0) * 20);
    body.push(...u16le(shapeId));
    body.push(...rectTag(-Math.floor(wTw / 2), Math.floor(wTw / 2),
                         -Math.floor(hTw / 2), Math.floor(hTw / 2)));

    const fill = shape.fill;
    const stroke = shape.stroke;
    const strokeW = pyRound((shape.strokeWidth || 0) * 20);
    const nfill = fill ? 1 : 0;
    const nline = (stroke && strokeW > 0) ? 1 : 0;

    body.push(nfill);
    if (fill) { body.push(0x00, ...parseColor(fill)); }
    body.push(nline);
    if (nline) { body.push(...u16le(Math.max(strokeW, 1)), ...parseColor(stroke)); }

    body.push((nfill << 4) | nline);

    const w = new BitWriter();
    const st = shape.type;
    if (st === 'rect') {
      pathRecords(w, rectPts(wTw, hTw), nfill, nline, true);
    } else if (st === 'ellipse') {
      ellipseCurveRecords(w, Math.floor(wTw / 2), Math.floor(hTw / 2), nfill, nline);
    } else if (st === 'line' || st === 'poly') {
      const pts = (shape.points || []).map(p => [pyRound(p[0] * 20), pyRound(p[1] * 20)]);
      if (pts.length) pathRecords(w, pts, nfill, nline, st === 'poly' && !!fill);
    }
    body.push(...w.data);
    return tag(TAG_DEFINESHAPE3, body);
  }

  function placeObject2(depth, charId, tx, ty, rotation, sx, sy) {
    const body = [];
    body.push(0x06);                           // HasCharacter | HasMatrix
    body.push(...u16le(depth));
    body.push(...u16le(charId));
    body.push(...matrix(tx, ty, rotation, sx, sy));
    return tag(TAG_PLACEOBJECT2, body);
  }

  function exportProject(project) {
    const stage = project.stage || { w: 550, h: 400 };
    const fps = Math.trunc(project.fps === undefined ? 24 : project.fps);
    const frames = project.frames || [];

    const shapes = new Map();                  // geometry key -> shape id (insertion order kept)
    let nextId = 1;
    for (const frameShapes of frames) {
      for (const shape of frameShapes) {
        const key = geometryKey(shape);
        if (!shapes.has(key)) shapes.set(key, nextId++);
      }
    }

    let body = tag(TAG_SETBACKGROUNDCOLOR, [0xFF, 0xFF, 0xFF]);
    for (const [key, id] of shapes) {
      body = body.concat(defineShape3(id, shapeFromKey(key)));
    }
    for (const frameShapes of frames) {
      for (const shape of frameShapes) {
        body = body.concat(placeObject2(
          (shape.depth || 0) + 1,
          shapes.get(geometryKey(shape)),
          pyRound(shape.x * 20),
          pyRound(shape.y * 20),
          shape.rotation ? +shape.rotation : 0,
          (shape.scaleX === undefined ? 1 : +shape.scaleX) || 1e-6,
          (shape.scaleY === undefined ? 1 : +shape.scaleY) || 1e-6
        ));
      }
      body = body.concat(tag(TAG_SHOWFRAME, []));
    }
    body = body.concat(tag(TAG_END, []));

    const header = [0x46, 0x57, 0x53, 9, 0, 0, 0, 0];    // 'FWS', version 9, length placeholder
    header.push(...rectTag(0, Math.trunc(stage.w) * 20, 0, Math.trunc(stage.h) * 20));
    header.push(...u16le(fps << 8));
    header.push(...u16le(frames.length));

    const total = header.length + body.length;
    header[4] = total & 255; header[5] = (total >> 8) & 255;
    header[6] = (total >> 16) & 255; header[7] = (total >>> 24) & 255;

    return new Uint8Array(header.concat(body));
  }

  const api = { exportProject, parseColor, matrix, rectTag, defineShape3, placeObject2, pyRound };
  root.SWFExporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* CLI: node swf_exporter.js character.json character.swf */
if (typeof require !== 'undefined' && typeof process !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.log('usage: node swf_exporter.js character.json character.swf');
    process.exit(1);
  }
  const project = JSON.parse(fs.readFileSync(src, 'utf-8'));
  const data = module.exports.exportProject(project);
  fs.writeFileSync(dst, data);
  console.log(dst + ': ' + data.length + ' bytes, ' + (project.frames ? project.frames.length : 0) + ' frames');
}
