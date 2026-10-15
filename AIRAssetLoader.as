// AIRAssetLoader.as
// Loading SWF characters exported by the editor into an AIR / AS3 game.
// Each exported SWF has the animation on its ROOT timeline, so the
// loaded content itself is a self-contained MovieClip that plays/loops.

package {
    import flash.display.Loader;
    import flash.display.MovieClip;
    import flash.events.Event;
    import flash.net.URLRequest;
    import flash.system.ApplicationDomain;
    import flash.system.LoaderContext;

    public class AIRAssetLoader {

        private var _loader:Loader;

        public function AIRAssetLoader() {
            _loader = new Loader();
            // allow the loaded SWF's content to be used by the game code
            var ctx:LoaderContext = new LoaderContext(
                false,
                ApplicationDomain.currentDomain
            );
            _loader.contentLoaderInfo.addEventListener(Event.COMPLETE, onComplete);
            _loader.load(new URLRequest("app:/assets/Hero.swf"), ctx);
        }

        private function onComplete(event:Event):void {
            // The whole animated character as a playing MovieClip:
            var hero:MovieClip = _loader.content as MovieClip;

            // Now it behaves like any MovieClip:
            hero.x = 100;
            hero.y = 240;
            hero.play();               // loops the walk cycle
            // hero.gotoAndStop(1);    // pose manually
            // hero.stop();
            // hero.addFrameScript(...)  // hook events per frame if needed
            // hero.scaleX = 2; hero.scaleY = 2;
            // hero.rotation = 45;
        }
    }
}

// Multiple SWFs can be loaded in parallel and cached:
//
//   function loadCharacter(name:String, onReady:Function):void {
//       var l:Loader = new Loader();
//       l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void {
//           var cls:Class = function():MovieClip { return l.content as MovieClip; };
//           // simplest caching: duplicate by re-loading, or keep N loaders
//           onReady(l.content as MovieClip);
//       });
//       l.load(new URLRequest("app:/assets/" + name + ".swf"));
//   }
//
// Notes:
// - app:/ works for files packaged inside the AIR app; use File/FileStream
//   or file:// URLs for files in ApplicationStorageDirectory.
// - To pause: mc.stop(); to scrub: mc.gotoAndStop(n).
// - The exported SWF is version 9 / AS3-safe (PlaceObject2, DefineShape3).
