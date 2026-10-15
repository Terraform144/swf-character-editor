# SWF Character Editor

A browser-based editor for drawing and animating vector characters, exported as
SWF files for use as game assets in AIR SDK / AS3 games. No Flash, no Animate,
no dependencies.

Two editions, same features:

| Edition | Location | Requirements |
|---|---|---|
| Server | `editor.html` + `editor_server.py` | Python 3 |
| Pure Vanilla | `PureVanilla_version/editor.html` | None - double-click it |

## Features

- Draw tools: select/move, rectangle, ellipse, line, freehand pencil
- Paintbrush with 4 nib patterns (round, flat, calligraphy, taper), size 1-80 px
- Points tool (`A`): drag points on any shape (including brush strokes),
  right-click to delete a vertex, double-click an edge to insert one
- Simplify: jitter smoothing + Ramer-Douglas-Peucker point reduction with a
  tolerance control
- Layers and keyframes with auto-keying, linear tweening of position,
  rotation, scale, w/h and - per point - shape morphing
- Playback preview, zoom 25-800% (tool, toolbar buttons, keys, Ctrl+wheel)
- Project save/load as JSON
- SWF export: pure vector (DefineShape3 + PlaceObject2), frame-by-frame
  timeline, deduplicated geometry, byte-identical between the Python and JS
  encoders

## Run

Server edition:

    python editor_server.py
    -> http://localhost:8765

Pure vanilla edition: open `PureVanilla_version/editor.html` in any modern
browser. Everything, including the SWF encoder, runs client-side.

## Using exported SWFs in an AIR game

Each character exports as one SWF with the animation on its root timeline:

```as3
var loader:Loader = new Loader();
loader.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void {
    var hero:MovieClip = loader.content as MovieClip;   // plays and loops
    hero.gotoAndStop(1);                                // or scrub as needed
});
loader.load(new URLRequest("app:/assets/Hero.swf"));
```

See `AIRAssetLoader.as` for a complete example.

## Files

| File | Role |
|---|---|
| `editor.html` | Editor app (server edition) |
| `editor_server.py` | Local server: serves the editor, `POST /export` -> .swf |
| `swf_exporter.py` | Reference SWF encoder (Python) |
| `PureVanilla_version/` | Serverless edition: editor + JS encoder (`swf_exporter.js`) |
| `brush.js` / `anim.js` / `simplify.js` | Shared pure modules: brush geometry, keyframe interpolation, shape simplification |
| `AIRAssetLoader.as` | AS3 loading example for AIR |
| `gen_square_swf.py` | Minimal hand-built SWF demo (no compiler) |

## Tests

    node test_anim.js          # keyframe interpolation incl. per-point tweening
    node test_brush.js         # brush nib geometry
    node test_simplify.js      # smoothing + Ramer-Douglas-Peucker
    python test_export.py      # export -> parse back with pyswf
    python test_vanilla.py     # Python vs JS encoder byte-identity

`test_vanilla.py` verifies that `PureVanilla_version/swf_exporter.js`
produces byte-identical SWF output to `swf_exporter.py` on shapes, tweened
animation, point morphing, and brush strokes.

`pyswf` (used by the parser tests) is a Python 2 era library; it needs a few
small py3 compatibility patches on install (iteritems, xrange, reduce,
bits/8, ord) - see the test scripts.

## Notes

- Exported SWFs are version 9, AS3-safe, and load with a plain `Loader`.
- View exported SWFs with Ruffle; the browser Flash plugin is dead since 2021.
- Known limits: no undo/redo, linear tweening only, point-tweening requires
  equal point counts on both keyframes.
