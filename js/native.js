/* Native shell integration (Android via Capacitor). Everything here is a no-op in a browser. */
(function (global) {
  'use strict';
  var Cap = global.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  function plugin(name) { try { return isNative ? Cap.registerPlugin(name) : null; } catch (e) { return null; } }

  var App = plugin('App'), StatusBar = plugin('StatusBar'), BuildInfo = plugin('BuildInfo');
  var debugBuild = null;

  global.NativeShell = {
    isNative: isNative,
    /** Resolves true for debug builds (test ads), false for release builds. */
    isDebug: function () {
      if (!isNative) return Promise.resolve(true);
      if (debugBuild !== null) return Promise.resolve(debugBuild);
      if (!BuildInfo) return Promise.resolve(false);
      return BuildInfo.isDebug().then(function (r) { debugBuild = !!(r && r.debug); return debugBuild; }, function () { debugBuild = false; return false; });
    },
    versionName: function () {
      if (!App) return Promise.resolve('web');
      return App.getInfo().then(function (i) { return i.version + ' (' + i.build + ')'; }, function () { return ''; });
    },
    /** handler() returns true when it consumed the back press; otherwise the app exits. */
    onBack: function (handler) {
      if (!App) return;
      App.addListener('backButton', function () { if (!handler()) App.exitApp(); });
    },
    onPause: function (fn) { if (App) App.addListener('pause', fn); },
    onResume: function (fn) { if (App) App.addListener('resume', fn); },
    styleBars: function (color) {
      if (!StatusBar) return;
      try { StatusBar.setStyle({ style: 'DARK' }); StatusBar.setBackgroundColor && StatusBar.setBackgroundColor({ color: color }); } catch (e) { /* older WebView */ }
    }
  };
})(this);
