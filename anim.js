/* Animation core: keyframe interpolation, including per-point tweening.
   Pure functions, no DOM - testable under Node.

   A layer is { keyframes: [ { frame: 1-based, shapes: [...] } ] }.
   Shapes match between keyframes by id. Interpolated between the surrounding
   keyframes: x, y, rotation, scaleX, scaleY, w, h, and points (pairwise,
   when both snapshots have the same point count).
*/
(function (root) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function surroundingKFs(layer, f) {
    let prev = null, next = null;
    for (const kf of layer.keyframes) {
      if (kf.frame <= f && (!prev || kf.frame > prev.frame)) prev = kf;
      if (kf.frame > f && (!next || kf.frame < next.frame)) next = kf;
    }
    return [prev, next];
  }

  // interpolated shape list of a layer at frame f (draw order = array order).
  // All returned objects and point arrays are fresh copies - safe to mutate.
  function layerStateAt(layer, f) {
    if (!layer.keyframes.length) return [];
    const [prev, next] = surroundingKFs(layer, f);
    if (!prev) return clone(next ? next.shapes : []);   // hold backwards
    if (!next) return clone(prev.shapes);               // hold after last kf
    const t = (f - prev.frame) / (next.frame - prev.frame);
    const out = [];
    for (const ps of prev.shapes) {
      const ns = next.shapes.find(s => s.id === ps.id);
      if (ns) {
        const o = Object.assign({}, ps, {
          x: lerp(ps.x, ns.x, t), y: lerp(ps.y, ns.y, t),
          rotation: lerp(ps.rotation || 0, ns.rotation || 0, t),
          scaleX: lerp(ps.scaleX ?? 1, ns.scaleX ?? 1, t),
          scaleY: lerp(ps.scaleY ?? 1, ns.scaleY ?? 1, t)
        });
        if (ps.w !== undefined && ns.w !== undefined) o.w = lerp(ps.w, ns.w, t);
        if (ps.h !== undefined && ns.h !== undefined) o.h = lerp(ps.h, ns.h, t);
        if (ps.points && ns.points && ps.points.length === ns.points.length) {
          o.points = ps.points.map((p, i) =>
            [lerp(p[0], ns.points[i][0], t), lerp(p[1], ns.points[i][1], t)]);
        } else if (ps.points) {
          o.points = ps.points.map(p => [p[0], p[1]]);
        }
        out.push(o);
      } else {
        out.push(clone(ps));                            // held until next kf
      }
    }
    return out;
  }

  const api = { layerStateAt, surroundingKFs, lerp, clone };
  root.Anim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
