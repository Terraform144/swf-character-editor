# SWF Character Editor - Pure Vanilla Edition

No server. No Python. No install. No network. Just open the file.

## Run

Double-click `editor.html` (or drag it into any modern browser - Chrome, Edge, Firefox).

Draw shapes, animate on the timeline, hit **Export SWF**: the .swf is encoded
entirely in your browser and downloaded like any file.

## Files

| File | Role |
|---|---|
| `editor.html` | The app: draw tools, paintbrush, point editing, timeline, tweening, playback, export |
| `brush.js` | Paintbrush nib geometry (round / flat / calligraphy / taper) |
| `anim.js` | Keyframe interpolation core (transforms, w/h, per-point tweening) |
| `simplify.js` | Shape simplification: jitter smoothing + Ramer-Douglas-Peucker |
| `swf_exporter.js` | Full SWF encoder in JavaScript (shapes, matrices, animation) |

Keep the files in the same folder.

## Point editing (Points tool, key A)

Select a shape, switch to **Points**: every shape exposes draggable points -
rect corners, ellipse extremes, line endpoints, and every outline vertex of
polylines and brush strokes. Drag points to reshape; **right-click** (or
Alt+click) a vertex to delete it, **double-click** on an edge to insert one.
Point edits auto-keyframe, and points interpolate between keyframes, so
shapes and brush strokes can morph across the animation (matching point
counts tween pairwise).

## Zooming

**Zoom tool** (`Z`): click to zoom in on that point, Alt / Shift / right-click
to zoom out. Or use the toolbar `+` / `-` / `1:1` buttons, the keys `+` `-` `0`,
and Ctrl+wheel anywhere on the stage. When zoomed in, the stage area scrolls
to pan. Range 25% - 800%.

## Simplifying shapes

Select a line, poly, or brush stroke, set a tolerance (px), and press
**Simplify**: a smoothing pass removes jitter, then Ramer-Douglas-Peucker
drops every point that lies within the tolerance of the simplified outline -
smaller SWFs, easier point editing, same-looking shapes. Open paths keep
their endpoints; closed outlines stay closed.

## Compatibility

`swf_exporter.js` is byte-for-byte identical to the reference Python exporter
(`../swf_exporter.py`), verified by `../test_vanilla.py` on shapes, tweened
animation, and brush strokes.

## Using the exported SWFs in an AIR game

Each exported SWF has the animation on its root timeline:

```as3
var loader:Loader = new Loader();
loader.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void {
    var hero:MovieClip = loader.content as MovieClip;   // plays and loops
    hero.gotoAndStop(1);                                // or scrub/stop as needed
});
loader.load(new URLRequest("app:/assets/Hero.swf"));
```

See `../AIRAssetLoader.as` for a complete example.

## Node CLI (optional)

The exporter also works from the command line:

    node swf_exporter.js character.json character.swf

where `character.json` uses the "baked" model documented at the top of the file.
