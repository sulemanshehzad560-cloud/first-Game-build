/* Jade Rush — app controller: screens, solo timed play, duels, persistence, online sync. */
(function () {
  'use strict';
  var M = window.Mahjong, A = window.GameAudio, Net = window.NovaNet;
  var $ = function (id) { return document.getElementById(id); };
  var TURN_MS = 15000, COMBO_MS = 5000, HINT_COST_MS = 10000;
  var COLORS = ['#4fd1a5', '#ff7a59'];
  var PRIVACY_URL = 'https://sulemanshehzad560-cloud.github.io/first-Game-build/privacy.html';
  var Shell = window.NativeShell || { isNative: false, onBack: function () {}, onPause: function () {}, onResume: function () {}, versionName: function () { return Promise.resolve('web'); }, styleBars: function () {} };
  var Ads = window.GameAds || { boardFinished: function () {}, between: function (l, next) { next(); }, hasPrivacyOptions: function () { return false; } };

  // ------------------------------------------------------------- storage
  var SAVE_KEY = 'jaderush.v1';
  var store = { level: 1, stars: {}, best: {}, sound: true, daily: {}, streak: { last: '', n: 0 }, wins: { ai: 0, online: 0 }, aiLevel: 1, duel: 'race', size: 'small', seenHowto: false, theme: 'jade', vibrate: true, done: false };
  try { Object.assign(store, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ } }
  function totalStars() { var s = 0; for (var k in store.stars) s += store.stars[k]; return s; }
  function dayKey(offset) { var d = new Date(Date.now() + (offset || 0) * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  A.setEnabled(store.sound);

  // Battery saver: automatic on phones with 2 GB of RAM or less (or 2 cores), or switched on in Settings.
  function autoLite() { return (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2); }
  window.JadeLite = store.lite == null ? !!autoLite() : !!store.lite;

  // ------------------------------------------------------------- tile sets, juice
  var THEMES = window.MahjongTiles.THEMES;
  var MAX = M.MAX_LEVEL;
  // Drawn rather than a text glyph: Android's system font has no '❚'.
  var PAUSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  var fmt = function (n) { return n.toLocaleString('en-US'); };
  // Line icons (24px grid, stroke = currentColor) for buttons, settings rows and stat cards.
  var ICON_PATHS = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
    home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/>',
    sound: '<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    vibrate: '<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 9v6M19.5 9v6"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-13 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6.5 9.5-8.5"/>',
    palette: '<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.6-.9 1.2-1.8-.5-1 .1-2.2 1.3-2.2H17a3 3 0 0 0 3-3c0-4.9-3.6-9-8-9z"/><circle cx="8" cy="11" r="1.1"/><circle cx="11" cy="7.8" r="1.1"/><circle cx="15" cy="8.6" r="1.1"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4M12 16.8h.01"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    ad: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M8 15l2-6 2 6M8.7 13h2.6M15 9v6h1.2a2 2 0 0 0 0-6z"/>',
    score: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 10a2.5 2 0 0 1 5 0c0 2.6-5 1.4-5 4a2.5 2 0 0 0 5 0"/>',
    clock: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 3.5h4"/>',
    combo: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
    bonus: '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="8.5"/>',
    tiles: '<rect x="4" y="5" width="7" height="9" rx="1.5"/><rect x="13" y="5" width="7" height="9" rx="1.5"/><path d="M6 17h12"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
    share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.7 0-3.4 3-5.1 3.6-8.8 2.5 1.2 3.4 3.4 3.4 5 .9-.6 1.6-1.6 1.8-3 1.9 1.4 3.2 3.9 3.2 6.8 0 3.3-2.4 5.7-6 5.7z"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  };
  function icon(name, size) {
    return '<svg class="ico" viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
  }
  function currentTheme() {
    var t = THEMES.filter(function (x) { return x.id === store.theme; })[0];
    return t && totalStars() >= t.stars ? t : THEMES[0];
  }
  function applyTheme() {
    var t = currentTheme(), st = document.documentElement.style;
    st.setProperty('--bg0', t.bg[0]); st.setProperty('--bg1', t.bg[1]);
    st.setProperty('--glowA', t.bg[2]); st.setProperty('--glowB', t.bg[3]); st.setProperty('--accent', t.accent);
    st.setProperty('--accent-soft', hexA(t.accent, 0.28)); st.setProperty('--accent-glow', hexA(t.accent, 0.55));
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t.bg[0];
    board.setTheme(t); demo.setTheme(t); sky.setTheme(t);
  }
  function buzz(pattern) {
    if (!store.vibrate) return;
    // Native haptics (iPhone has no navigator.vibrate); stronger patterns map to heavier taps.
    var total = Array.isArray(pattern) ? pattern.reduce(function (a, b, i) { return i % 2 ? a : a + b; }, 0) : pattern;
    if (window.NativeShell && window.NativeShell.haptic(total >= 40 ? 'heavy' : total >= 15 ? 'medium' : 'light')) return;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ } }
  }
  function hexA(h, a) { var v = parseInt(h.slice(1), 16); return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')'; }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The scene behind every screen: night sky, moon, stars, three mountain ridges with mist, and paper sky
  // lanterns drifting up, all tinted by the active tile set. It leans with the phone (or the pointer) and a
  // tap on the open sky releases a new lantern. Static layers are cached; battery saver draws one still frame.
  var sky = (function () {
    var c = $('bg'), g = c.getContext('2d'), W = 0, H = 0, dpr = 1, theme = THEMES[0], drawn = false;
    var layers = [], skyCan = null, moonCan = null, moonA = 1, lantern = null, lanterns = [], stars = [], lastDraw = 0;
    var tilt = { x: 0, y: 0, tx: 0, ty: 0 }, moonState = null;
    function mix(a, b, t) {
      var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
      var r = (x >> 16 & 255) * (1 - t) + (y >> 16 & 255) * t, gg = (x >> 8 & 255) * (1 - t) + (y >> 8 & 255) * t, bl = (x & 255) * (1 - t) + (y & 255) * t;
      return 'rgb(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(bl) + ')';
    }
    function canvas(w, h) { var k = document.createElement('canvas'); k.width = Math.max(1, Math.round(w * dpr)); k.height = Math.max(1, Math.round(h * dpr)); var x = k.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [k, x]; }
    function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
    function build() {
      var r = rnd(7), M = 40;
      // sky, moon and the fixed stars
      var s = canvas(W + M, H + M), k = s[1], top = mix(theme.bg[0], '#000000', 0.62);
      var gr = k.createLinearGradient(0, 0, 0, H + M);
      gr.addColorStop(0, top); gr.addColorStop(0.45, mix(theme.bg[0], '#000000', 0.25)); gr.addColorStop(0.78, theme.bg[1]); gr.addColorStop(1, mix(theme.bg[1], theme.bg[3], 0.35));
      k.fillStyle = gr; k.fillRect(0, 0, W + M, H + M);
      // the moon is its own sprite so it can set behind the game screen's panels
      var mr = Math.min(W, H) * 0.06, mm = canvas(mr * 14, mr * 14), mk = mm[1], mc = mr * 7;
      var halo = mk.createRadialGradient(mc, mc, mr * 0.5, mc, mc, mr * 7);
      halo.addColorStop(0, hexA(theme.bg[3], 0.3)); halo.addColorStop(1, hexA(theme.bg[3], 0));
      mk.fillStyle = halo; mk.fillRect(0, 0, mr * 14, mr * 14);
      var moon = mk.createRadialGradient(mc - mr * 0.3, mc - mr * 0.3, mr * 0.1, mc, mc, mr);
      moon.addColorStop(0, '#fffaf0'); moon.addColorStop(1, mix('#fff1d0', theme.bg[3], 0.35));
      mk.fillStyle = moon; mk.beginPath(); mk.arc(mc, mc, mr, 0, 6.283); mk.fill();
      mk.fillStyle = 'rgba(160,140,110,.18)';
      [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12]].forEach(function (cr) { mk.beginPath(); mk.arc(mc + cr[0] * mr, mc + cr[1] * mr, cr[2] * mr, 0, 6.283); mk.fill(); });
      moonCan = { c: mm[0], s: mr * 14, x: W * 0.13, y: H * 0.16 };
      stars = [];
      for (var n = 0; n < Math.round(W * H / 5000); n++) {
        var st = { x: r() * (W + M), y: Math.pow(r(), 1.6) * H * 0.6, r: 0.4 + r() * 1.3, p: r() * 6.28, tw: r() < 0.3 };
        if (!st.tw) { k.fillStyle = 'rgba(255,248,230,' + (0.25 + r() * 0.5) + ')'; k.beginPath(); k.arc(st.x, st.y, st.r, 0, 6.283); k.fill(); }
        else stars.push(st);
      }
      skyCan = s[0];
      // three ridges, far to near, each with a band of mist above it
      layers = [];
      [[0.62, 0.16, 0.28, 18], [0.72, 0.13, 0.55, 30], [0.84, 0.1, 0.82, 46]].forEach(function (L, idx) {
        var lw = W + M * 2, lc = canvas(lw, H), x = lc[1], base = H * L[0], amp = H * L[1];
        var ph = [r() * 6, r() * 6, r() * 6], col = mix(theme.bg[0], '#000000', L[2]);
        var mist = x.createLinearGradient(0, base - amp * 1.4, 0, base + amp * 0.2);
        mist.addColorStop(0, hexA(theme.bg[2], 0)); mist.addColorStop(0.7, hexA(theme.bg[2], 0.07 + idx * 0.02)); mist.addColorStop(1, hexA(theme.bg[2], 0));
        x.fillStyle = mist; x.fillRect(0, base - amp * 1.4, lw, amp * 1.8);
        x.beginPath(); x.moveTo(0, H);
        for (var px = 0; px <= lw; px += 6) {
          var t = px / lw * 6.283;
          var y = base - amp * (0.55 * Math.sin(t * 1.3 + ph[0]) + 0.3 * Math.sin(t * 3.1 + ph[1]) + 0.15 * Math.abs(Math.sin(t * 7.7 + ph[2])));
          x.lineTo(px, y);
        }
        x.lineTo(lw, H); x.closePath();
        var fill = x.createLinearGradient(0, base - amp, 0, H);
        fill.addColorStop(0, col); fill.addColorStop(1, mix(theme.bg[0], '#000000', Math.min(0.95, L[2] + 0.2)));
        x.fillStyle = fill; x.fill();
        // rim light from the moon on the ridge line
        x.strokeStyle = hexA(theme.bg[3], 0.08 + idx * 0.03); x.lineWidth = 1.2; x.stroke();
        layers.push({ c: lc[0], depth: L[3] });
      });
      // one lantern sprite, scaled for every lantern
      var ls = canvas(64, 96), lx = ls[1];
      var glow = lx.createRadialGradient(32, 50, 2, 32, 50, 32);
      glow.addColorStop(0, hexA(theme.bg[3], 0.55)); glow.addColorStop(1, hexA(theme.bg[3], 0));
      lx.fillStyle = glow; lx.fillRect(0, 0, 64, 96);
      var body = lx.createLinearGradient(20, 0, 44, 0);
      body.addColorStop(0, '#d9452b'); body.addColorStop(0.5, '#ffcf6e'); body.addColorStop(1, '#d9452b');
      lx.fillStyle = body; lx.beginPath(); lx.ellipse(32, 50, 12, 16, 0, 0, 6.283); lx.fill();
      lx.fillStyle = 'rgba(255,250,220,.75)'; lx.beginPath(); lx.ellipse(32, 52, 4, 7, 0, 0, 6.283); lx.fill();
      lx.fillStyle = '#4a1a10'; lx.fillRect(26, 33, 12, 3); lx.fillRect(27, 64, 10, 3);
      lantern = ls[0];
      drawn = false;
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, window.JadeLite ? 1 : 1.5);
      W = innerWidth; H = innerHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      var want = window.JadeLite ? 5 : 14;
      while (lanterns.length < want) lanterns.push(newLantern(Math.random() * H * 1.2));
      lanterns.length = want;
    }
    function newLantern(y, x, z) {
      z = z || 0.25 + Math.random() * 0.75;
      return { x: x == null ? Math.random() * W : x, y: y == null ? H + 40 : y, z: z, p: Math.random() * 6.28, v: 0.006 + z * 0.014, born: performance.now() };
    }
    function drawLanterns(now, near, dt) {
      for (var k = 0; k < lanterns.length; k++) {
        var l = lanterns[k];
        if ((l.z >= 0.6) !== near) continue;
        l.y -= l.v * dt;
        if (l.y < -60) { if (l.spawned) { lanterns.splice(k, 1); k--; continue; } var nl = newLantern(); l.x = nl.x; l.y = nl.y; l.z = nl.z; l.v = nl.v; }
        var s = 0.35 + l.z * 0.7, sway = Math.sin(now / 1400 + l.p) * 10 * l.z;
        var px = l.x + sway + tilt.x * 26 * l.z, py = l.y + tilt.y * 14 * l.z;
        g.globalAlpha = Math.min(1, 0.45 + l.z * 0.6) * (0.85 + 0.15 * Math.sin(now / 180 + l.p * 3));
        g.drawImage(lantern, px - 32 * s, py - 48 * s, 64 * s, 96 * s);
      }
      g.globalAlpha = 1;
    }
    function frame(now) {
      var still = reduced || window.JadeLite;
      if (!skyCan) { if (still && drawn && moonState === $('game').hidden) return; build(); }
      if (still && drawn && moonState === $('game').hidden) return;
    moonState = $('game').hidden;
      // behind a game board, 25 frames a second is plenty
      if (!still && !$('game').hidden && now - lastDraw < 40) return;
      var dt = lastDraw ? Math.min(100, now - lastDraw) : 16; lastDraw = now; drawn = true;
      tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
      g.drawImage(skyCan, -20 - tilt.x * 6, -20 - tilt.y * 4, W + 40, H + 40);
      // the moon hangs low over the ridges on the menus and sets while a board is up
      moonA += (($('game').hidden ? 1 : 0) - moonA) * (still ? 1 : 0.05);
      if (moonA > 0.01) {
        g.globalAlpha = moonA;
        g.drawImage(moonCan.c, moonCan.x - moonCan.s / 2 - tilt.x * 10, moonCan.y - moonCan.s / 2 + (1 - moonA) * 60 - tilt.y * 6, moonCan.s, moonCan.s);
        g.globalAlpha = 1;
      }
      for (var k = 0; k < stars.length; k++) {
        var st = stars[k];
        g.fillStyle = 'rgba(255,248,230,' + (0.35 + 0.45 * Math.sin(now / 600 + st.p)) + ')';
        g.beginPath(); g.arc(st.x - 20 - tilt.x * 6, st.y - 20 - tilt.y * 4, st.r, 0, 6.283); g.fill();
      }
      g.drawImage(layers[0].c, -40 - tilt.x * layers[0].depth, -tilt.y * 6, W + 80, H);
      drawLanterns(now, false, still ? 0 : dt);
      g.drawImage(layers[1].c, -40 - tilt.x * layers[1].depth, -tilt.y * 8, W + 80, H);
      g.drawImage(layers[2].c, -40 - tilt.x * layers[2].depth, -tilt.y * 10, W + 80, H);
      drawLanterns(now, true, still ? 0 : dt);
      if (still && $('game').hidden === false) release();
    }
    // Battery saver keeps only the painted screen: the cached layers are dropped once the still frame
    // without the moon (game screen) has been drawn, and rebuilt on demand when the moon must come back.
    function release() {
      [skyCan, moonCan && moonCan.c].concat(layers.map(function (l) { return l.c; })).forEach(function (k) { if (k) { k.width = 0; k.height = 0; } });
      skyCan = null; layers = []; moonCan = null;
    }
    var resizeTimer = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
    window.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { tilt.tx = (e.clientX / W - 0.5) * 2; tilt.ty = (e.clientY / H - 0.5) * 2; } });
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      tilt.tx = Math.max(-1, Math.min(1, e.gamma / 25)); tilt.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    });
    resize();
    return {
      frame: frame,
      setTheme: function (t) { theme = t; build(); },
      resize: resize,
      release: function (x, y) {
        if (reduced || window.JadeLite) return false;   // a still sky cannot carry a lantern away
        if (lanterns.filter(function (l) { return l.spawned; }).length > 12) return;
        var l = newLantern(y + 20, x, 0.95); l.spawned = true; l.v = 0.05; lanterns.push(l);
        drawn = false;
      }
    };
  })();

  // Confetti for wins.
  var confetti = (function () {
    var c = $('confetti'), g = c.getContext('2d'), parts = [], dirty = false;
    function resize() { var dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    window.addEventListener('resize', resize); resize();
    return {
      burst: function (n) {
        if (reduced) return;
        var t = currentTheme(), cols = [t.accent, t.bg[2], t.bg[3], '#ff6fae', '#47cdff', '#ffffff', '#7cffcb'];
        if (window.JadeLite) n = Math.round(n * 0.4);
        for (var k = 0; k < n; k++) parts.push({ x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 0.9, vy: -0.4 - Math.random() * 0.7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: cols[k % cols.length], life: 2600 + Math.random() * 1200, age: 0 });
      },
      frame: function (dt) {
        if (!parts.length) { if (dirty) { g.clearRect(0, 0, innerWidth, innerHeight); dirty = false; } return; }
        dirty = true; g.clearRect(0, 0, innerWidth, innerHeight);
        for (var k = parts.length - 1; k >= 0; k--) {
          var p = parts[k]; p.age += dt;
          if (p.age > p.life) { parts.splice(k, 1); continue; }
          p.vy += 0.0012 * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          g.save(); g.globalAlpha = Math.min(1, (p.life - p.age) / 500);
          g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.age / 120));
          g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
        }
      }
    };
  })();

  function banner(text) {
    var el = $('banner');
    el.textContent = text; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(banner.t); banner.t = setTimeout(function () { el.hidden = true; }, 1250);
  }
  function setHeat(combo) {
    var w = $('board-wrap');
    w.classList.toggle('heat-1', combo >= 3 && combo < 6);
    w.classList.toggle('heat-2', combo >= 6 && combo < 9);
    w.classList.toggle('heat-3', combo >= 9);
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function countUp(root) {
    root.querySelectorAll('[data-to]').forEach(function (el) {
      var to = Number(el.dataset.to), pre = el.dataset.pre || '', t0 = performance.now();
      (function step(now) {
        var t = Math.min(1, (now - t0) / 900), v = Math.round(to * (1 - Math.pow(1 - t, 3)));
        el.textContent = pre + v;
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  function setTitle(main, sub, color) {
    var h = $('game-title'); h.textContent = main;
    if (sub) { var sm = document.createElement('small'); sm.textContent = sub; h.insertBefore(sm, h.firstChild); }
    $('game').style.setProperty('--chapter', color || 'var(--accent)');
  }

  // ------------------------------------------------------------- ui helpers
  var screens = ['home', 'levels', 'lobby', 'friends', 'game'];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    if (id === 'home') refreshHome();
    if (id === 'game') board.resize();
  }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function modal(opts) {
    $('modal-title').textContent = opts.title;
    $('modal-sheet').className = 'sheet' + (opts.kind ? ' sheet-' + opts.kind : '');
    var eb = $('modal-eyebrow'); eb.hidden = !opts.eyebrow; eb.textContent = opts.eyebrow || '';
    var body = $('modal-body'); body.innerHTML = '';
    if (typeof opts.body === 'string') { var p = document.createElement('p'); p.textContent = opts.body; body.appendChild(p); }
    else if (opts.body) body.appendChild(opts.body);
    var st = $('modal-stars'); st.hidden = opts.stars == null;
    if (opts.stars != null) st.innerHTML = [1, 2, 3].map(function (k) { return '<span class="' + (k <= opts.stars ? 'on' : '') + '">★</span>'; }).join('');
    var act = $('modal-actions'); act.innerHTML = '';
    modal.back = opts.back || null;
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = (a.primary ? 'primary' : 'ghost') + (a.cls ? ' ' + a.cls : '');
      if (a.icon) b.innerHTML = icon(a.icon, a.primary ? 22 : 20) + '<span></span>';
      (a.icon ? b.lastChild : b).textContent = a.label;
      var run = a.run;
      if (opts.adGate != null && run) run = function () { Ads.between(opts.adGate, a.run); };
      b.addEventListener('click', function () { closeModal(); if (run) run(); });
      act.appendChild(b);
    });
    $('modal').hidden = false;
    countUp(body);
    var first = act.querySelector('.primary') || act.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeModal() { $('modal').hidden = true; }
  function resultGrid(pairs) {
    var d = document.createElement('div'); d.className = 'result-grid';
    pairs.forEach(function (p) {
      var c = document.createElement('div'); c.innerHTML = (p[2] ? icon(p[2], 18) : '') + '<span class="label"></span><b></b>';
      c.querySelector('.label').textContent = p[0]; c.lastChild.textContent = p[1];
      var m = /^([+]?)(\d+)$/.exec(String(p[1]));
      if (m && !reduced) { c.lastChild.dataset.to = m[2]; c.lastChild.dataset.pre = m[1]; c.lastChild.textContent = m[1] + '0'; }
      d.appendChild(c);
    });
    return d;
  }
  function chipGroup(label, options, value, onPick) {
    var wrap = document.createElement('div'); wrap.className = 'opt-group';
    var l = document.createElement('span'); l.textContent = label; wrap.appendChild(l);
    var row = document.createElement('div'); row.className = 'size-pick'; row.setAttribute('role', 'radiogroup');
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = o[1];
      b.setAttribute('aria-checked', String(o[0] === value));
      b.addEventListener('click', function () {
        row.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true'); onPick(o[0]);
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }
  function floatText(text, x, y, big, color) {
    var el = document.createElement('div');
    el.className = 'float' + (big ? ' big' : ''); el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (color) el.style.color = color;
    $('fx-layer').appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }

  // ------------------------------------------------------------- home
  // The lantern hint only makes sense when the sky moves.
  function refreshSkyHint() { var h = document.querySelector('.sky-hint'); if (h) h.hidden = !!(reduced || window.JadeLite); }
  function refreshHome() {
    refreshSkyHint();
    var d = store.daily[dayKey()];
    var cleared = store.done ? MAX : store.level - 1;
    $('continue-label').textContent = 'Level ' + fmt(store.level);
    $('continue-eyebrow').textContent = store.done ? 'Journey complete' : 'Journey · ' + fmt(MAX) + ' levels';
    var unlocked = THEMES.filter(function (t) { return totalStars() >= t.stars; }).length;
    $('themes-meta').textContent = unlocked + ' of ' + THEMES.length + ' unlocked';
    $('continue-meta').textContent = fmt(cleared) + ' cleared · ' + fmt(totalStars()) + ' ★ collected';
    $('levels-meta').textContent = fmt(cleared) + ' / ' + fmt(MAX);
    $('home-stars').textContent = '★ ' + fmt(totalStars());
    var streak = store.streak.n > 1 && (store.streak.last === dayKey() || store.streak.last === dayKey(-1)) ? store.streak.n : 0;
    $('home-streak').hidden = !streak; $('home-streak').lastChild.textContent = streak + '-day streak';
    $('journey-fill').style.width = (cleared / MAX * 100).toFixed(2) + '%';
    $('daily-meta').textContent = d ? 'Done today · ' + '★★★'.slice(0, d)
      : store.streak.n > 1 && store.streak.last === dayKey(-1) ? store.streak.n + '-day streak' : 'New every day';
    $('ai-meta').textContent = store.wins.ai ? store.wins.ai + ' wins' : '3 levels';
  }
  // One continuous trail of medallions winding down the screen. Built in blocks of 100 levels (each with its own
  // SVG path) so the browser skips laying out the blocks that are off screen.
  var ROW = 88;
  function trailX(L) { return 50 + 30 * Math.sin((L - 1) * 0.62); }
  function renderLevelGrid() {
    var grid = $('level-grid'), html = '', last = Math.min(MAX, Math.ceil((store.level + 20) / 100) * 100);
    for (var b = 1; b <= last; b += 100) {
      var end = Math.min(last, b + 99), rows = '', all = '', done = '', reach = store.done ? end : Math.min(end, store.level);
      for (var L = b; L <= end; L++) {
        var x = trailX(L), y = (L - b) * ROW + 44, s = store.stars[L] || 0, locked = L > store.level;
        rows += '<div class="lvl-row"><button class="lvl' + (L === store.level && !store.done ? ' current' : '') + (L % 100 === 0 ? ' milestone' : '') + '" style="--x:' + x.toFixed(1) + '%" data-level="' + L + '"' +
          (locked ? ' disabled aria-label="Level ' + L + ', locked"' : '') + '>' + L + (locked ? '' : '<small>' + ('★★★'.slice(0, s) || '') + '</small>') + '</button></div>';
        var seg = L === b ? 'M' + x.toFixed(1) + ' ' + y : ' C' + trailX(L - 1).toFixed(1) + ' ' + (y - ROW / 2) + ' ' + x.toFixed(1) + ' ' + (y - ROW / 2) + ' ' + x.toFixed(1) + ' ' + y;
        all += seg; if (L <= reach) done += seg;
      }
      html += '<div class="level-grid"><svg viewBox="0 0 100 ' + (end - b + 1) * ROW + '" preserveAspectRatio="none" aria-hidden="true"><path class="trail" vector-effect="non-scaling-stroke" d="' + all + '"/>' +
        (done ? '<path class="trail-done" vector-effect="non-scaling-stroke" d="' + done + '"/>' : '') + '</svg>' + rows + '</div>';
    }
    if (last < MAX) html += '<p class="level-more">' + fmt(MAX - last) + ' more levels ahead, up to Level ' + fmt(MAX) + '</p>';
    grid.innerHTML = html;
    $('levels-stars').textContent = '★ ' + fmt(totalStars());
    var cur = grid.querySelector('.current'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------- shared board state
  var board = new window.TileBoard($('board'));
  // The felt table hugs the tiles: the canvas sits 18px inside the wrap, the table adds 16px around the board.
  board.onLayout = function (b) {
    var t = $('tray').style, pad = 16;
    t.left = (18 + b.x - pad) + 'px'; t.top = (18 + b.y - pad) + 'px';
    t.width = (b.w + pad * 2) + 'px'; t.height = (b.h + pad * 2) + 'px';
  };
  var G = { mode: null };
  function isTurns() { return G.duel === 'turns'; }
  function midpoint(a, b) { var r1 = board.rect(a), r2 = board.rect(b); return [(r1.x + r2.x + r1.w) / 2, (r1.y + r2.y + r1.h) / 2]; }

  function baseState(gen) {
    var n = gen.layout.n;
    return { lay: gen.layout, kinds: gen.kinds.slice(), present: new Uint8Array(n).fill(1), left: n, sel: -1, over: false, gen: gen };
  }
  function mountBoard(showFree) {
    $('modal').hidden = true;
    show('game');
    board.set(G.lay, G.kinds, G.present, showFree);
  }

  // ------------------------------------------------------------- timed play (journey, daily, online race)
  function startTimed(gen, cfg) {
    G = baseState(gen);
    Object.assign(G, cfg, {
      score: 0, combo: 0, bestCombo: 0, lastMatch: 0, usedHint: false,
      limit: Math.round(gen.layout.n * gen.spec.secPerTile) * 1000,
      hints: cfg.duel === 'race' ? 1 : gen.spec.hints,
      shuffles: cfg.duel === 'race' ? 2 : gen.spec.shuffles,
      rival: { left: gen.layout.n, done: false, out: false, score: 0 }
    });
    G.timeLeft = G.limit;
    if (cfg.mode === 'journey') setTitle(cfg.title, 'of ' + fmt(MAX), null);
    else setTitle(cfg.title, cfg.mode === 'daily' ? dayKey() : 'Race', null);
    var pausable = cfg.mode !== 'online';
    $('btn-quit').innerHTML = pausable ? PAUSE_ICON : '←'; $('btn-quit').setAttribute('aria-label', pausable ? 'Pause' : 'Leave race');
    G.shownScore = 0; setHeat(0); $('score').textContent = '0'; $('combo-bar').style.width = '0';
    $('hud-solo').hidden = false; $('hud-duel').hidden = true;
    $('rival').hidden = cfg.duel !== 'race';
    $('btn-hint').hidden = false; $('btn-shuffle').hidden = false;
    $('emotes').hidden = cfg.duel !== 'race'; $('goal').hidden = cfg.duel === 'race';
    $('goal').textContent = gen.spec.showFree ? 'Match free tiles in pairs. Dimmed tiles are blocked.' : 'Free tiles are no longer highlighted. Look closely.';
    board.accent = currentTheme().accent;
    mountBoard(gen.spec.showFree && cfg.duel !== 'race');
    updateTimedHud();
  }

  function startLevel(level) {
    level = Math.max(1, Math.min(MAX, level));
    startTimed(M.generateLevel(level), { mode: 'journey', level: level, title: 'Level ' + fmt(level) });
    if (level < MAX) setTimeout(function () { M.generateLevel(level + 1); }, 500);
    if (level === 1 && !store.seenHowto) { store.seenHowto = true; save(); G.paused = true; howTo(function () { G.paused = false; }); }
  }
  function startDaily() { startTimed(M.generateDaily(dayKey()), { mode: 'daily', title: 'Daily board' }); }

  function updateTimedHud() {
    var cb = $('combo'), c = Math.max(1, G.combo);
    if (cb.textContent !== '×' + c) { cb.textContent = '×' + c; if (c > 1) bump(cb); }
    cb.className = c >= 10 ? 't4' : c >= 7 ? 't3' : c >= 5 ? 't2' : c >= 3 ? 't1' : '';
    if ($('left').textContent !== String(G.left)) { $('left').textContent = G.left; bump($('left')); }
    $('hint-count').textContent = G.hints; $('btn-hint').disabled = G.hints <= 0;
    $('shuffle-count').textContent = G.shuffles; $('btn-shuffle').disabled = G.shuffles <= 0;
    if (G.duel === 'race') {
      var n = G.lay.n;
      $('rival-fill').style.width = (100 * (n - G.rival.left) / n) + '%';
      $('rival-text').textContent = G.rival.done ? 'Cleared' : G.rival.out ? 'Out · ' + G.rival.left + ' left' : G.rival.left + ' left';
    }
    drawClock();
  }
  function drawClock() {
    var frac = G.timeLeft / G.limit;
    $('clock-fill').style.width = (100 * frac) + '%';
    $('clock-text').textContent = fmtTime(G.timeLeft);
    $('clock-fill').parentNode.classList.toggle('low', frac < 0.2);
  }

  function tickTimed(dt) {
    if (G.over || G.paused || !G.limit || isTurns()) return;
    if (G.mode !== 'online' && !$('modal').hidden) return;
    var before = Math.ceil(G.timeLeft / 1000);
    G.timeLeft -= dt;
    var after = Math.ceil(G.timeLeft / 1000);
    if (after !== before) { drawClock(); if (after <= 10 && after > 0) A.tick(); }
    if (G.timeLeft <= 0) { G.timeLeft = 0; drawClock(); timedFail('Out of time'); }
  }

  function timedMatch(a, b) {
    var now = performance.now(), kind = G.kinds[a];
    G.combo = now - G.lastMatch < COMBO_MS ? Math.min(G.combo + 1, 12) : 1;
    G.lastMatch = now; G.bestCombo = Math.max(G.bestCombo, G.combo);
    var pts = 10 * G.combo + (kind >= 27 ? 10 : 0);
    G.score += pts;
    var mp = midpoint(a, b);
    floatText('+' + pts, mp[0], mp[1], G.combo >= 4);
    var tier = { 3: 'Nice!', 5: 'Great!', 7: 'Amazing!', 9: 'Incredible!', 12: 'Legendary!' }[G.combo];
    if (tier) banner(tier);
    setHeat(G.combo);
    $('btn-shuffle').classList.remove('attention');
    if (G.duel === 'race') Net.send({ t: 'prog', left: G.left, score: G.score });
    updateTimedHud();
    if (G.left === 0) { timedWin(); return; }
    if (!M.freePairs(G.lay, G.present, G.kinds).length) {
      if (G.shuffles > 0) { toast('No moves left. Shuffle!'); $('btn-shuffle').classList.add('attention'); }
      else timedFail('No moves left');
    }
  }

  function timedWin() {
    G.over = true; G.won = true;
    var secs = Math.floor(G.timeLeft / 1000), bonus = secs * 5;
    G.score += bonus;
    var frac = G.timeLeft / G.limit;
    var stars = frac >= 0.4 && !G.usedHint ? 3 : frac >= 0.2 ? 2 : 1;
    A.win();
    var grid = resultGrid([['Score', G.score, 'score'], ['Time left', fmtTime(G.timeLeft), 'clock'], ['Best combo', '×' + G.bestCombo, 'combo'], ['Time bonus', '+' + bonus, 'bonus']]);
    confetti.burst(stars === 3 ? 220 : 120); setHeat(0); buzz([20, 40, 20, 40, 60]);
    if (G.duel === 'race') {
      Net.send({ t: 'done', score: G.score });
      store.wins.online++; save();
      modal({ kind: 'result', eyebrow: 'Online race', title: 'You won the race!', body: grid, back: leaveGame, actions: [{ label: 'Menu', icon: 'home', run: leaveGame }, { label: 'Rematch', icon: 'restart', primary: true, run: rematch }] });
      return;
    }
    var title = stars === 3 ? 'Flawless' : 'Board cleared';
    if (G.mode === 'daily') {
      var d = dayKey(), prev = store.daily[d] || 0;
      store.daily[d] = Math.max(prev, stars);
      if (!prev) store.streak = { last: d, n: store.streak.last === dayKey(-1) ? store.streak.n + 1 : 1 };
      save();
      Ads.boardFinished();
      modal({ kind: 'result', eyebrow: 'Daily board · ' + dayKey(), title: title, stars: stars, body: grid, adGate: 99, back: function () { closeModal(); show('home'); }, actions: [{ label: 'Menu', icon: 'home', run: function () { show('home'); } }, { label: 'Play journey', icon: 'play', primary: true, run: function () { startLevel(store.level); } }] });
      return;
    }
    var L = G.level, newBest = G.score > (store.best[L] || 0);
    if (stars > (store.stars[L] || 0)) store.stars[L] = stars;
    if (newBest) store.best[L] = G.score;
    var finale = L === MAX && !store.done;
    if (L === store.level) { if (L < MAX) store.level++; else store.done = true; }
    save();
    if (newBest) title += ' · new best';
    Ads.boardFinished();
    if (finale) {
      confetti.burst(400);
      var wrap = document.createElement('div'), msg = document.createElement('p');
      msg.className = 'finale';
      msg.textContent = 'You cleared all ' + fmt(MAX) + ' levels of Jade Rush with ' + fmt(totalStars()) + ' ★. Replay any level from the map to chase three stars.';
      wrap.appendChild(msg); wrap.appendChild(grid);
      modal({ kind: 'result', eyebrow: 'Level ' + fmt(MAX), title: 'Journey complete!', stars: stars, body: wrap, back: function () { closeModal(); show('home'); },
        actions: [{ label: 'Menu', icon: 'home', run: function () { show('home'); } }, { label: 'Level map', icon: 'trophy', primary: true, run: function () { renderLevelGrid(); show('levels'); } }] });
      return;
    }
    var next = L < MAX ? { label: 'Next level', icon: 'play', primary: true, run: function () { startLevel(L + 1); } } : { label: 'Level map', icon: 'trophy', primary: true, run: function () { renderLevelGrid(); show('levels'); } };
    modal({ kind: 'result', eyebrow: 'Level ' + fmt(L), title: title, stars: stars, body: grid, adGate: L, back: function () { closeModal(); show('home'); }, actions: [{ label: 'Replay', icon: 'restart', run: function () { startLevel(L); } }, next] });
  }

  function timedFail(reason) {
    if (G.over) return;
    G.over = true; A.lose();
    if (G.duel === 'race') {
      Net.send({ t: 'out', left: G.left, score: G.score });
      if (G.rival.out) resolveRace();
      else modal({ kind: 'fail', eyebrow: 'Online race', title: reason, body: 'You have ' + G.left + ' tiles left. Waiting to see how your rival does…', actions: [{ label: 'Leave', icon: 'home', run: leaveGame }] });
      return;
    }
    var cleared = G.lay.n - G.left;
    Ads.boardFinished();
    var meter = document.createElement('div'); meter.className = 'fail-meter';
    meter.innerHTML = '<p></p><div class="fail-bar"><i></i></div>';
    meter.firstChild.textContent = 'You cleared ' + cleared + ' of ' + G.lay.n + ' tiles.';
    meter.querySelector('i').style.width = Math.round(100 * cleared / G.lay.n) + '%';
    modal({
      kind: 'fail', eyebrow: G.mode === 'daily' ? 'Daily board' : 'Level ' + fmt(G.level), title: reason, adGate: G.level || 99, back: function () { closeModal(); show('home'); },
      body: meter,
      actions: [{ label: 'Menu', icon: 'home', run: function () { show('home'); } }, { label: 'Retry', icon: 'restart', primary: true, run: function () { G.mode === 'daily' ? startDaily() : startLevel(G.level); } }]
    });
  }

  function resolveRace() {
    var me = G.left, them = G.rival.left;
    var win = me < them || (me === them && G.score > G.rival.score), draw = me === them && G.score === G.rival.score;
    if (win) { store.wins.online++; save(); A.win(); }
    modal({
      kind: win ? 'result' : 'fail', eyebrow: 'Online race',
      title: draw ? 'Dead heat' : win ? 'You win on tiles' : 'Rival wins on tiles',
      body: resultGrid([['Your tiles left', me, 'tiles'], ['Rival tiles left', them, 'tiles'], ['Your score', G.score, 'score'], ['Rival score', G.rival.score, 'score']]),
      actions: [{ label: 'Menu', icon: 'home', run: leaveGame }, { label: 'Rematch', icon: 'restart', primary: true, run: rematch }]
    });
  }

  function useHint() {
    if (G.over || isTurns()) return;
    if (G.hints <= 0) { toast('No hints left on this board.'); return; }
    var pairs = M.freePairs(G.lay, G.present, G.kinds);
    if (!pairs.length) { toast('No moves left. Shuffle!'); return; }
    var pick = null, sol = G.gen.solution;
    for (var k = 0; k < sol.length && !pick; k++) {
      var a = sol[k][0], b = sol[k][1];
      if (G.present[a] && G.present[b] && G.kinds[a] === G.kinds[b] && M.isFree(G.lay, G.present, a) && M.isFree(G.lay, G.present, b)) pick = [a, b];
    }
    pick = pick || pairs[0];
    G.hints--; G.usedHint = true;
    G.timeLeft = Math.max(1000, G.timeLeft - HINT_COST_MS);
    board.showHint(pick, 3500);
    toast('Hint used: −10 seconds', 1500);
    updateTimedHud();
  }

  function useShuffle() {
    if (G.over || isTurns()) return;
    if (G.shuffles <= 0) { toast('No shuffles left on this board.'); return; }
    var next = M.reshuffle(G.lay, G.present, G.kinds, Math.random);
    if (!next) { timedFail('No moves left'); return; }
    var old = G.kinds;
    G.kinds = next; board.kinds = next; G.sel = -1; board.sel = -1; board.hint = []; board.partners = [];
    board.flipFrom(old); buzz([8, 30, 8, 30, 8]);
    G.gen = Object.assign({}, G.gen, { solution: [] });
    G.shuffles--; A.shuffle(); board.invalidate();
    $('btn-shuffle').classList.remove('attention');
    updateTimedHud();
  }

  // ------------------------------------------------------------- take-turns duel
  function startTurns(cfg) {
    var gen = M.generateDuel(cfg.seed, cfg.size);
    G = baseState(gen);
    Object.assign(G, cfg, { duel: 'turns', turn: cfg.first, scores: [0, 0], moveNo: 0, reshuffles: 0, turnEnd: performance.now() + TURN_MS });
    G.names = cfg.mode === 'local' ? ['Jade', 'Ember'] : cfg.mode === 'ai' ? ['You', 'Computer'] : cfg.me === 0 ? ['You', 'Rival'] : ['Rival', 'You'];
    setTitle(cfg.mode === 'online' ? matchLabel() : cfg.mode === 'ai' ? 'Vs computer' : 'Pass & play', cfg.mode === 'ai' ? ['Easy', 'Normal', 'Hard'][cfg.aiLevel] : 'Take turns', null);
    $('btn-quit').innerHTML = cfg.mode === 'online' ? '←' : PAUSE_ICON; $('btn-quit').setAttribute('aria-label', cfg.mode === 'online' ? 'Leave match' : 'Pause');
    $('hud-solo').hidden = true; $('hud-duel').hidden = false;
    $('btn-hint').hidden = true; $('btn-shuffle').hidden = true;
    $('emotes').hidden = cfg.mode !== 'online'; $('goal').hidden = cfg.mode === 'online';
    $('goal').textContent = 'One match per turn, 15 seconds each. Winds and dragons score 2.';
    $('pname-0').textContent = G.names[0]; $('pname-1').textContent = G.names[1];
    mountBoard(true);
    updateDuelHud();
    maybeAi();
  }

  function updateDuelHud() {
    $('pscore-0').textContent = G.scores[0]; $('pscore-1').textContent = G.scores[1];
    $('chip-0').classList.toggle('active', G.turn === 0 && !G.over);
    $('chip-1').classList.toggle('active', G.turn === 1 && !G.over);
    $('turn-fill').parentNode.className = 'turn-clock p' + G.turn;
    var who = G.names[G.turn];
    $('turn-note').textContent = G.over ? 'Game over' : who === 'You' ? 'Your turn' : G.mode === 'local' ? who + '’s turn' : who + ' is thinking…';
    board.accent = COLORS[G.turn];
    board.partners = []; board.invalidate();
  }

  function tickTurns(now) {
    if (!isTurns() || G.over) return;
    if (G.paused) return;
    var rem = G.turnEnd - now;
    $('turn-fill').style.width = Math.max(0, 100 * rem / TURN_MS) + '%';
    if (rem > 0) return;
    if (G.mode === 'online') {
      if (G.turn !== G.me) return; // the active player's device decides when time is up
      Net.send({ t: 'pass', k: G.moveNo });
    }
    passTurn();
  }

  function passTurn() {
    toast(G.names[G.turn] === 'You' ? 'Time’s up. Turn passed.' : G.names[G.turn] + ' ran out of time.', 1500);
    G.sel = -1; board.sel = -1; G.moveNo++;
    nextTurn();
  }

  function nextTurn() {
    G.turn = 1 - G.turn; G.turnEnd = performance.now() + TURN_MS;
    updateDuelHud();
    maybeAi();
  }

  function turnsMatch(a, b, remote) {
    var kind = G.kinds[a], pts = M.points(kind), p = G.turn;
    if (G.mode === 'online' && !remote) Net.send({ t: 'match', a: a, b: b, k: G.moveNo });
    G.scores[p] += pts; G.moveNo++;
    var mp = midpoint(a, b);
    floatText('+' + pts, mp[0], mp[1], pts > 1, COLORS[p]);
    if (G.left === 0) { turnsOver(); return; }
    if (!M.freePairs(G.lay, G.present, G.kinds).length) {
      var next = M.reshuffle(G.lay, G.present, G.kinds, M.mulberry32(M.hash(G.seed, 'reshuffle', G.reshuffles++)));
      if (!next) { turnsOver(); return; }
      G.kinds = next; board.kinds = next; A.shuffle();
      toast('No moves left. The board was reshuffled.');
    }
    nextTurn();
  }

  function turnsOver() {
    G.over = true; updateDuelHud();
    var s = G.scores, winner = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    var title = winner < 0 ? 'Draw' : G.mode === 'local' ? G.names[winner] + ' wins!' : winner === G.me ? 'You win!' : G.names[winner] + ' wins';
    if (winner === G.me || G.mode === 'local') { A.win(); confetti.burst(160); } else A.lose();
    if (winner === G.me && G.mode === 'ai') store.wins.ai++;
    if (winner === G.me && G.mode === 'online') store.wins.online++;
    save();
    if (G.mode !== 'online') Ads.boardFinished();
    modal({
      kind: winner === G.me || G.mode === 'local' ? 'result' : 'fail', eyebrow: G.mode === 'ai' ? 'Vs computer' : G.mode === 'local' ? 'Pass & play' : 'Online duel',
      title: title, adGate: G.mode === 'online' ? null : 99, back: leaveGame,
      body: resultGrid([[G.names[0], s[0] + ' pts', 'user'], [G.names[1], s[1] + ' pts', 'user']]),
      actions: [{ label: 'Menu', icon: 'home', run: leaveGame }, { label: 'Rematch', icon: 'restart', primary: true, run: rematch }]
    });
  }

  function maybeAi() {
    if (G.mode !== 'ai' || G.over || G.turn === G.me) return;
    var token = G, delay = [2200, 1500, 1000][G.aiLevel] + Math.random() * 900;
    setTimeout(function step() {
      if (G !== token || G.over || G.turn === G.me) return;
      if (G.paused || !$('modal').hidden) { setTimeout(step, 400); return; }
      var pr = M.aiPick(G.lay, G.present, G.kinds, G.aiLevel);
      if (!pr) { passTurn(); return; }
      G.sel = pr[0]; board.sel = pr[0]; board.invalidate(); A.select();
      setTimeout(function () { if (G === token && !G.over) applyMatch(pr[0], pr[1], true); }, 450);
    }, delay);
  }

  // ------------------------------------------------------------- input
  function applyMatch(a, b, remote) {
    G.present[a] = 0; G.present[b] = 0; G.left -= 2;
    G.sel = -1; board.sel = -1;
    var turns = isTurns(), kind = G.kinds[a];
    var nextCombo = !turns && performance.now() - G.lastMatch < COMBO_MS ? G.combo + 1 : 1;
    var power = turns ? M.points(kind) : Math.min(4, 1 + (nextCombo - 1) * 0.3);
    board.matched(a, b, turns ? COLORS[G.turn] : currentTheme().accent, power, function () {
      A.slam(power, turns ? M.points(kind) : G.combo);
      buzz(power > 2 ? [25, 30, 25] : 22);
    });
    if (isTurns()) turnsMatch(a, b, remote); else timedMatch(a, b);
  }

  function onTileTap(i) {
    if (G.over || !G.lay || board.busy()) return;
    if (isTurns() && G.mode !== 'local' && G.turn !== G.me) { toast('Wait for your turn.', 1100); return; }
    if (!M.isFree(G.lay, G.present, i)) { A.blocked(); board.wrong(i); buzz([15, 40, 15]); return; }
    if (G.sel === i) { G.sel = -1; board.sel = -1; board.partners = []; board.invalidate(); return; }
    if (G.sel >= 0 && G.kinds[G.sel] === G.kinds[i]) { applyMatch(G.sel, i, false); return; }
    G.sel = i; board.sel = i; board.hover = -1; board.invalidate(); A.select(); buzz(6);
    board.partners = board.showFree ? M.freeTiles(G.lay, G.present).filter(function (j) { return j !== i && G.kinds[j] === G.kinds[i]; }) : [];
  }

  function rematch() {
    if (G.mode === 'online') {
      if (!Net.conn) { toast('Your rival has left the room.'); return; }
      if (Net.isHost) hostStart(); else { Net.send({ t: 'rematch' }); toast('Rematch requested. Waiting for the host…'); }
      return;
    }
    startTurns({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: 0, first: 1 - G.first, seed: Math.floor(Math.random() * 1e9) });
  }

  function leaveGame() {
    if (G.mode === 'online') Net.close();
    G = { mode: null };
    show('home');
  }

  // ------------------------------------------------------------- online
  var lobby = { duel: store.duel, size: store.size };
  var DUEL_DESC = {
    race: 'Same board for both of you, side by side. First to clear it wins.',
    turns: 'One shared board. Take turns making one match each. Highest score wins.'
  };
  function matchLabel() { return /^[A-Z0-9]{5}$/.test(Net.code || '') ? 'Room ' + Net.code : 'Vs ' + Net.code; }
  function onlineSupported() { return Net.available() && typeof RTCPeerConnection === 'function'; }
  function setLobbyStatus(msg, isError) { var s = $('lobby-status'); s.textContent = msg; s.classList.toggle('error', !!isError); }
  function syncLobbyChips() {
    document.querySelectorAll('#pick-duel .chip').forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.v === lobby.duel)); });
    document.querySelectorAll('#pick-size .chip').forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.v === lobby.size)); });
    $('duel-desc').textContent = DUEL_DESC[lobby.duel];
  }
  function openLobby() {
    show('lobby'); $('host-box').hidden = true; syncLobbyChips();
    if (!onlineSupported()) setLobbyStatus('Online play is not available here. Open the game from its own web address with an internet connection.', true);
    else setLobbyStatus('');
  }

  function startOnline(m, me) {
    if (m.duel === 'race') {
      startTimed(M.generateDuel(m.seed, m.size), { mode: 'online', duel: 'race', me: me, size: m.size, title: matchLabel() });
    } else {
      startTurns({ mode: 'online', size: m.size, seed: m.seed, first: m.first, me: me });
    }
  }
  function hostStart() {
    var prevFirst = G && G.mode === 'online' && typeof G.first === 'number' ? G.first : 1;
    var m = { t: 'start', duel: lobby.duel, size: lobby.size, seed: Math.floor(Math.random() * 1e9), first: 1 - prevFirst };
    Net.send(m);
    startOnline(m, 0);
  }

  Net.onStatus = function (state, info) {
    if (state === 'hosting') {
      // the code as five ivory tiles
      $('room-code').innerHTML = String(info).split('').map(function (ch) { return '<span class="code-tile">' + ch + '</span>'; }).join('');
      $('room-code').setAttribute('aria-label', 'Room code ' + info);
      $('host-box').hidden = false; setLobbyStatus('Waiting for a friend to join…');
    }
    else if (state === 'connecting') setLobbyStatus('Connecting to room ' + info + '…');
    else if (state === 'connected') { setLobbyStatus('Connected!'); if (Net.isHost) { G = { mode: null }; hostStart(); } }
    else if (state === 'closed') {
      if (G.mode === 'online' && !$('game').hidden) {
        G.over = true;
        modal({ title: 'Rival left', body: 'The other player disconnected.', actions: [{ label: 'Menu', primary: true, run: leaveGame }] });
      }
    } else if (state === 'error') { if (!$('lobby').hidden) setLobbyStatus(info, true); else toast(info, 3500); }
  };

  Net.onMessage = function (m) {
    if (m.t === 'start' && !Net.isHost && (m.duel === 'race' || m.duel === 'turns') && (m.size === 'small' || m.size === 'big')) {
      startOnline(m, 1);
    } else if (G.mode !== 'online') {
      return;
    } else if (m.t === 'match' && isTurns() && !G.over && m.k === G.moveNo && G.turn !== G.me) {
      var a = m.a, b = m.b;
      if (G.present[a] && G.present[b] && a !== b && G.kinds[a] === G.kinds[b] && M.isFree(G.lay, G.present, a) && M.isFree(G.lay, G.present, b)) applyMatch(a, b, true);
    } else if (m.t === 'pass' && isTurns() && !G.over && m.k === G.moveNo && G.turn !== G.me) {
      passTurn();
    } else if (m.t === 'prog' && G.duel === 'race') {
      G.rival.left = m.left | 0; G.rival.score = m.score | 0; updateTimedHud();
    } else if (m.t === 'done' && G.duel === 'race') {
      G.rival.done = true; G.rival.left = 0; updateTimedHud();
      if (!G.won) {
        G.over = true; A.lose();
        modal({ kind: 'fail', eyebrow: 'Online race', title: 'Rival cleared it first', body: 'You had ' + G.left + ' tiles left.', actions: [{ label: 'Menu', icon: 'home', run: leaveGame }, { label: 'Rematch', icon: 'restart', primary: true, run: rematch }] });
      }
    } else if (m.t === 'out' && G.duel === 'race') {
      G.rival.out = true; G.rival.left = m.left | 0; G.rival.score = m.score | 0; updateTimedHud();
      if (G.over) resolveRace(); else toast('Your rival is out. Clear the board to win!', 3000);
    } else if (m.t === 'rematch' && Net.isHost && G.over) {
      hostStart();
    } else if (m.t === 'emote' && typeof m.e === 'string') {
      showEmote(m.e.slice(0, 4), false);
    }
  };

  function showEmote(e, mine) {
    var w = $('board-wrap').getBoundingClientRect();
    floatText(e, w.width * (mine ? 0.3 : 0.7), w.height * 0.45, true, mine ? COLORS[G.me || 0] : COLORS[1 - (G.me || 0)]);
    A.pop();
  }
  function copyText(text, label) {
    var done = function () { toast(label + ' copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text, 4000); });
    else toast(text, 4000);
  }

  // ------------------------------------------------------------- facebook friends
  var Social = window.Social || null, Presence = Net.presence;
  var friendsState = { available: false, busy: false, presence: 'offline', error: '' };

  function avatar(url, name) {
    var el;
    if (url) { el = document.createElement('img'); el.src = url; el.alt = ''; el.referrerPolicy = 'no-referrer'; }
    else { el = document.createElement('span'); el.textContent = (name || '?').trim().charAt(0).toUpperCase(); }
    el.className = 'avatar';
    return el;
  }

  function openFriends() {
    show('friends');
    renderFriends();
    if (Social && Social.user) probeFriends();
  }

  function renderFriends() {
    var body = $('friends-body'); body.innerHTML = '';
    $('btn-friends-refresh').hidden = !(Social && Social.user);
    if (!friendsState.available) {
      var p = document.createElement('p'); p.className = 'muted center';
      p.textContent = 'Facebook friends are available in the Jade Rush Android app. You can still play anyone online with a room code.';
      body.appendChild(p);
      return;
    }
    if (!Social.user) {
      var card = document.createElement('div'); card.className = 'panel fb-intro';
      card.innerHTML = '<div class="fb-art" aria-hidden="true"><span>東</span><span>中</span><span>發</span></div><h3>Play with your friends</h3>' +
        '<p class="muted">Sign in with Facebook to see which of your friends play Jade Rush, check who is online and invite them to a duel.</p>' +
        '<button class="fb-btn" id="btn-fb-login"><span class="fb-mark" aria-hidden="true">f</span>Continue with Facebook</button>' +
        '<p class="fine">We only use your name, profile picture and the friends who also play. Nothing is posted to Facebook.</p>';
      body.appendChild(card);
      if (friendsState.error) { var e = document.createElement('p'); e.className = 'status error'; e.textContent = friendsState.error; body.appendChild(e); }
      $('btn-fb-login').addEventListener('click', function () {
        if (friendsState.busy) return;
        friendsState.busy = true; friendsState.error = ''; this.textContent = 'Signing in…';
        Social.login().then(function (user) {
          friendsState.busy = false; Presence.start(user.id); renderFriends(); probeFriends();
          if (Social.friendsDeclined) toast('Allow friends access to see who plays.', 3200);
        }, function (err) {
          friendsState.busy = false;
          friendsState.error = err && err.message === 'cancelled' ? '' : 'Facebook sign-in failed. ' + ((err && err.message) || 'Please try again.');
          renderFriends();
        });
      });
      return;
    }

    var me = document.createElement('div'); me.className = 'me-card';
    me.appendChild(avatar(Social.user.picture, Social.user.name));
    var who = document.createElement('div'); who.className = 'me-text';
    var nm = document.createElement('b'); nm.textContent = Social.user.name;
    var st = document.createElement('small');
    st.textContent = friendsState.presence === 'online' ? 'Online · friends can invite you' : friendsState.presence === 'elsewhere' ? 'Signed in on another device' : 'Connecting…';
    st.className = friendsState.presence === 'online' ? 'on' : '';
    who.appendChild(nm); who.appendChild(st); me.appendChild(who);
    var out = document.createElement('button'); out.className = 'link small-link'; out.textContent = 'Sign out';
    out.addEventListener('click', function () { Presence.stop(); friendsState.presence = 'offline'; Social.logout().then(renderFriends); });
    me.appendChild(out);
    body.appendChild(me);

    var opts = document.createElement('div'); opts.className = 'panel compact';
    opts.appendChild(chipGroup('Duel', [['race', 'Race'], ['turns', 'Take turns']], lobby.duel, function (v) { lobby.duel = store.duel = v; save(); }));
    opts.appendChild(chipGroup('Board', [['small', 'Compact'], ['big', 'Grand']], lobby.size, function (v) { lobby.size = store.size = v; save(); }));
    body.appendChild(opts);

    var h = document.createElement('h3'); h.className = 'section-label'; h.innerHTML = 'Friends who play <span></span>';
    h.lastChild.textContent = Social.friends.length ? Social.friends.filter(function (f) { return f.status === 'online'; }).length + ' online' : '';
    body.appendChild(h);
    if (!Social.friends.length) {
      var empty = document.createElement('div'); empty.className = 'panel empty';
      empty.innerHTML = '<p class="muted">None of your Facebook friends play Jade Rush yet. Friends appear here once they sign in with Facebook in the app.</p>';
      var room = document.createElement('button'); room.className = 'ghost'; room.textContent = 'Use a room code instead';
      room.addEventListener('click', openLobby);
      empty.appendChild(room); body.appendChild(empty);
      return;
    }
    var list = document.createElement('div'); list.className = 'friend-list';
    Social.friends.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'friend ' + f.status;
      row.appendChild(avatar(f.picture, f.name));
      var t = document.createElement('div'); t.className = 'friend-text';
      var n = document.createElement('b'); n.textContent = f.name;
      var s2 = document.createElement('small'); s2.textContent = f.status === 'online' ? 'Online' : f.status === 'checking' ? 'Checking…' : 'Offline';
      t.appendChild(n); t.appendChild(s2); row.appendChild(t);
      var b = document.createElement('button'); b.className = 'primary invite-btn'; b.textContent = f.inviting ? 'Waiting…' : 'Invite';
      b.disabled = f.status !== 'online' || !!f.inviting;
      b.addEventListener('click', function () { inviteFriend(f); });
      row.appendChild(b);
      list.appendChild(row);
    });
    body.appendChild(list);
    var note = document.createElement('p'); note.className = 'fine center';
    note.textContent = 'Friends show as online while Jade Rush is open on their phone.';
    body.appendChild(note);
  }

  function probeFriends() {
    if (!Social || !Social.user || !Social.friends.length) return;
    var queue = Social.friends.slice(), running = 0;
    Social.friends.forEach(function (f) { if (f.status !== 'online') f.status = 'checking'; });
    renderFriends();
    var next = function () {
      while (running < 4 && queue.length) {
        var f = queue.shift(); running++;
        (function (f) {
          var wait = Presence.ready ? Presence.probe(f.id) : new Promise(function (r) { setTimeout(function () { r(Presence.probe(f.id)); }, 1500); });
          wait.then(function (online) {
            f.status = online ? 'online' : 'offline'; running--;
            if (!$('friends').hidden) renderFriends();
            next();
          });
        })(f);
      }
    };
    next();
  }

  function inviteFriend(f) {
    if (f.inviting) return;
    f.inviting = true; renderFriends();
    var duel = lobby.duel, size = lobby.size;
    Presence.invite(f.id, { t: 'invite', from: { name: Social.user.first }, duel: duel, size: size }).then(function (c) {
      var timer = setTimeout(function () { finish(); toast(f.first + ' didn\u2019t answer.'); try { c.close(); } catch (e) { /* closed */ } }, 30000);
      var finish = function () { clearTimeout(timer); c.off('data', onReply); f.inviting = false; if (!$('friends').hidden) renderFriends(); };
      var onReply = function (m) {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'accept') { finish(); G = { mode: null }; Net.adopt(c, true, f.first); }
        else if (m.t === 'decline' || m.t === 'busy') { finish(); toast(m.t === 'busy' ? f.first + ' is in a game right now.' : f.first + ' declined.'); try { c.close(); } catch (e) { /* closed */ } }
      };
      c.on('data', onReply);
      toast('Invite sent to ' + f.first + '.');
    }, function () {
      f.inviting = false; f.status = 'offline'; renderFriends(); toast(f.first + ' is not online.');
    });
  }

  function handleInvite(c, m) {
    var name = String((m.from && m.from.name) || 'A friend').slice(0, 40);
    var duel = m.duel === 'turns' ? 'turns' : 'race', size = m.size === 'big' ? 'big' : 'small';
    var playing = !$('game').hidden && G.lay && !G.over;
    if (playing || !$('modal').hidden) { c.send({ t: 'busy' }); setTimeout(function () { try { c.close(); } catch (e) { /* closed */ } }, 300); return; }
    A.pop(); buzz([30, 60, 30]);
    var body = document.createElement('p');
    body.textContent = (duel === 'race' ? 'A race' : 'A take-turns duel') + ' on the ' + (size === 'big' ? 'Grand' : 'Compact') + ' board.';
    var decline = function () { c.send({ t: 'decline' }); setTimeout(function () { try { c.close(); } catch (e) { /* closed */ } }, 300); };
    modal({
      title: name + ' invites you to play', body: body, back: function () { closeModal(); decline(); },
      actions: [{ label: 'Decline', run: decline }, { label: 'Play', primary: true, run: function () {
        c.send({ t: 'accept' }); lobby.duel = duel; lobby.size = size; Net.adopt(c, false, name);
      } }]
    });
    c.on('close', function () { if (!$('modal').hidden && $('modal-title').textContent.indexOf(name) === 0 && !Net.conn) closeModal(); });
  }

  function initFriends() {
    if (!Social) return;
    Social.available().then(function (ok) {
      friendsState.available = ok;
      $('btn-lobby-friends').hidden = !ok;
      if (!ok) return;
      $('online-meta').textContent = 'Friends or room code';
      Presence.onInvite = handleInvite;
      Presence.onStatus = function (state) { friendsState.presence = state; if (!$('friends').hidden) renderFriends(); };
      Social.onChange = function () { if (!$('friends').hidden) renderFriends(); };
      Social.restore().then(function (user) { if (user) Presence.start(user.id); });
    });
    Shell.onResume(function () { if (Social.user && !Presence.peer) Presence.start(Social.user.id); });
  }

  // ------------------------------------------------------------- pause & settings
  function canPause() { return !$('game').hidden && G.lay && !G.over && (G.mode === 'journey' || G.mode === 'daily' || G.mode === 'local' || G.mode === 'ai'); }
  function pauseGame() {
    if (!canPause() || !$('modal').hidden) return;
    var turnLeft = isTurns() ? G.turnEnd - performance.now() : 0;
    G.paused = true;
    var resume = function () { G.paused = false; if (isTurns()) G.turnEnd = performance.now() + turnLeft; };
    var restart = function () {
      G.paused = false;
      if (G.mode === 'journey') startLevel(G.level); else if (G.mode === 'daily') startDaily();
      else startTurns({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: G.me, first: G.first, seed: Math.floor(Math.random() * 1e9) });
    };
    var info = document.createElement('div'); info.className = 'pause-info';
    if (!isTurns()) info.appendChild(resultGrid([['Time left', fmtTime(G.timeLeft), 'clock'], ['Tiles left', G.left, 'tiles']]));
    else info.appendChild(resultGrid([[G.names[0], G.scores[0] + ' pts', 'user'], [G.names[1], G.scores[1] + ' pts', 'user']]));
    modal({
      kind: 'pause', eyebrow: $('game-title').lastChild.textContent, title: 'Paused', body: info, back: function () { closeModal(); resume(); },
      actions: [
        { label: 'Resume', icon: 'play', primary: true, cls: 'resume-btn', run: resume },
        { label: 'Quit', icon: 'home', cls: 'pause-opt', run: function () { G.paused = false; leaveGame(); } },
        { label: 'Restart', icon: 'restart', cls: 'pause-opt', run: restart },
        // stays paused while Settings is open; coming back re-opens this menu with the same turn time
        { label: 'Settings', icon: 'gear', cls: 'pause-opt', run: function () { openSettings(function () { resume(); pauseGame(); }); } }
      ]
    });
  }

  function toggleRow(label, on, onChange, ico) {
    var row = document.createElement('button'); row.type = 'button'; row.className = 'setting-row';
    row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(on));
    row.innerHTML = '<em class="row-ico">' + icon(ico || 'gear') + '</em><span></span><i class="switch" aria-hidden="true"></i>';
    row.querySelector('span').textContent = label;
    row.addEventListener('click', function () { on = !on; row.setAttribute('aria-checked', String(on)); onChange(on); });
    return row;
  }
  function linkRow(label, fn, ico) {
    var row = document.createElement('button'); row.type = 'button'; row.className = 'setting-row link-row';
    row.innerHTML = '<em class="row-ico">' + icon(ico || 'help') + '</em><span></span><i aria-hidden="true">›</i>'; row.querySelector('span').textContent = label;
    row.addEventListener('click', fn);
    return row;
  }
  function openSettings(after) {
    if (typeof after !== 'function') after = null;
    var done = function () { refreshHome(); if (after) after(); };
    var box = document.createElement('div'); box.className = 'settings';
    var group = function (name) { var h = document.createElement('p'); h.className = 'settings-group'; h.textContent = name; box.appendChild(h); };
    group('Game feel');
    box.appendChild(toggleRow('Sound effects', store.sound, function (v) { store.sound = v; A.setEnabled(v); save(); if (v) A.select(); }, 'sound'));
    box.appendChild(toggleRow('Vibration', store.vibrate, function (v) { store.vibrate = v; save(); buzz(20); }, 'vibrate'));
    box.appendChild(toggleRow('Battery saver (fewer effects)', window.JadeLite, function (v) {
      store.lite = v; window.JadeLite = v; save(); refreshSkyHint(); board.resize(); demo.resize(); sky.resize();
    }, 'leaf'));
    group('More');
    box.appendChild(linkRow('Tile sets', function () { closeModal(); openThemes(done); }, 'palette'));
    box.appendChild(linkRow('How to play', function () { closeModal(); howTo(done); }, 'help'));
    box.appendChild(linkRow('Privacy policy', function () { window.open(PRIVACY_URL, '_blank'); }, 'shield'));
    if (Ads.hasPrivacyOptions()) box.appendChild(linkRow('Ad privacy choices', function () { Ads.showPrivacyOptions(); }, 'ad'));
    var ver = document.createElement('p'); ver.className = 'version'; ver.textContent = 'Jade Rush';
    Shell.versionName().then(function (v) { ver.textContent = 'Jade Rush ' + (v === 'web' ? '· web' : v); });
    box.appendChild(ver);
    modal({ kind: 'settings', title: 'Settings', body: box, back: function () { closeModal(); done(); }, actions: [{ label: 'Done', primary: true, run: done }] });
  }

  // ------------------------------------------------------------- tile sets
  var previewCache = {};
  function drawPreview(canvas, theme, rect) {
    var r = rect || canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, window.JadeLite ? 1.5 : 2.5);
    // the renderer sizes its canvas from layout when created; an offscreen canvas measures 0, so size it after
    var pb = new window.TileBoard(canvas), g = canvas.getContext('2d');
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    pb.setTheme(theme); pb.dpr = dpr;
    pb.fh = r.height * 0.8; pb.fw = pb.fh / 1.3; pb.dz = pb.fw * 0.1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var total = pb.fw * 3 + 8, x0 = (r.width - total) / 2;
    [31, 4, 9].forEach(function (kind, k) {
      pb.drawTile(g, { x: x0 + k * (pb.fw + 4), y: 2 + (k === 1 ? 0 : pb.dz * 0.6), w: pb.fw, h: pb.fh }, kind, { variant: k });
    });
  }
  function openThemes(after) {
    if (typeof after !== 'function') after = null;
    var stars = totalStars(), cur = currentTheme(), box = document.createElement('div');
    box.style.display = 'grid'; box.style.gap = '12px';
    var p = document.createElement('p'); p.className = 'themes-intro'; p.textContent = 'Six woods, each with its own table and night sky. Earn stars to unlock them.';
    var grid = document.createElement('div'); grid.className = 'themes';
    THEMES.forEach(function (t) {
      var locked = stars < t.stars, b = document.createElement('button');
      b.className = 'theme-card'; b.type = 'button'; b.disabled = locked;
      b.setAttribute('aria-pressed', String(t.id === cur.id));
      b.innerHTML = '<canvas></canvas><b></b><small></small>' + (locked ? '<span class="unlock"><i></i></span>' : '');
      b.style.setProperty('--wood', t.face[0]); b.style.setProperty('--wood2', t.body[1]);
      b.querySelector('b').textContent = t.name;
      b.querySelector('small').innerHTML = locked ? icon('lock', 13) + ' ' + fmt(stars) + ' / ' + t.stars + ' ★' : t.id === cur.id ? '✓ In use' : 'Tap to use';
      if (locked) b.querySelector('.unlock i').style.width = Math.round(100 * stars / t.stars) + '%';
      b.addEventListener('click', function () { store.theme = t.id; save(); applyTheme(); A.select(); openThemes(after); });
      grid.appendChild(b);
    });
    box.appendChild(p); box.appendChild(grid);
    var finish = function () { refreshHome(); if (after) after(); };
    modal({ kind: 'themes', eyebrow: '★ ' + fmt(stars) + ' collected', title: 'Tile sets', body: box, back: function () { closeModal(); finish(); }, actions: [{ label: 'Done', primary: true, run: finish }] });
    // One preview per frame, each drawn once and then copied from a cache, so opening (or re-opening after
    // switching sets) never blocks the app for long on slow phones.
    var cvs = grid.querySelectorAll('canvas'), k = 0;
    (function nextPreview() {
      if (k >= cvs.length || !cvs[k].isConnected) return;
      var c = cvs[k], t = THEMES[k], r = c.getBoundingClientRect(), key = t.id + ':' + Math.round(r.width) + 'x' + Math.round(r.height);
      if (!previewCache[key]) { var off = document.createElement('canvas'); off.style.width = r.width + 'px'; off.style.height = r.height + 'px'; drawPreview(off, t, r); previewCache[key] = off; }
      var src = previewCache[key];
      c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
      k++; requestAnimationFrame(nextPreview);
    })();
  }

  // ------------------------------------------------------------- how to play
  // An illustrated, swipeable card deck. The art is built from mini tiles in HTML, so it is crisp and cheap.
  function howTo(after) {
    if (typeof after !== 'function') after = null;
    var t = function (g, cls) { return '<span class="mt' + (cls ? ' ' + cls : '') + '">' + g + '</span>'; };
    var cards = [
      ['Match the pairs', 'Tap two identical tiles to clear them. Clear the whole board to win.',
        '<div class="art art-match">' + t('東', 'red pick') + '<i class="art-plus">+</i>' + t('東', 'red pick') + '<i class="art-burst"></i></div>'],
      ['Only free tiles', 'A tile is free when nothing sits on it and its left or right side is open. Blocked tiles look dimmed early on.',
        '<div class="art art-free"><div class="art-row">' + t('中', 'red ok') + t('發', 'green no') + t('北', 'ok') + '</div><div class="art-top">' + t('西', 'ok') + '</div></div>'],
      ['Chain combos', 'Make your next match within 5 seconds to grow the multiplier, up to ×12.',
        '<div class="art art-combo"><b>×2</b><b>×5</b><b>×9</b><b class="hot">×12</b></div>'],
      ['Beat the clock', 'Clear the board before the fuse burns out. Hints cost 10 seconds and shuffles are limited.',
        '<div class="art art-clock"><div class="art-fuse"><i></i></div><div class="art-chips"><span>? Hint −10s</span><span>⇄ Shuffle</span></div></div>'],
      ['Duel your friends', 'Race on the same board, or take turns on one board: 15 seconds a turn, winds and dragons score 2.',
        '<div class="art art-duel"><span class="p p0">You</span><i>VS</i><span class="p p1">Rival</span></div>']
    ];
    var box = document.createElement('div'); box.className = 'howto-deck';
    var track = document.createElement('div'); track.className = 'howto-track';
    var dots = document.createElement('div'); dots.className = 'howto-dots';
    cards.forEach(function (c, k) {
      var card = document.createElement('section'); card.className = 'howto-card';
      card.innerHTML = c[2] + '<h3></h3><p></p>';
      card.querySelector('h3').textContent = (k + 1) + '. ' + c[0]; card.querySelector('p').textContent = c[1];
      track.appendChild(card);
      var d = document.createElement('button'); d.type = 'button'; d.setAttribute('aria-label', 'Card ' + (k + 1));
      d.addEventListener('click', function () { track.scrollTo({ left: k * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' }); });
      dots.appendChild(d);
    });
    var mark = function () {
      var k = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      dots.querySelectorAll('button').forEach(function (d, n) { d.classList.toggle('on', n === k); });
    };
    track.addEventListener('scroll', mark, { passive: true });
    box.appendChild(track); box.appendChild(dots);
    modal({ kind: 'howto', eyebrow: 'Swipe through', title: 'How to play', body: box, back: function () { closeModal(); if (after) after(); },
      actions: [{ label: 'Got it', icon: 'play', primary: true, run: after }] });
    mark();
  }

  // ------------------------------------------------------------- wiring
  $('btn-continue').addEventListener('click', function () { startLevel(store.level); });
  $('btn-levels').addEventListener('click', function () { show('levels'); renderLevelGrid(); });
  $('btn-daily').addEventListener('click', startDaily);
  $('btn-local').addEventListener('click', function () {
    var size = store.size;
    modal({
      kind: 'setup', eyebrow: 'Two players · one phone', title: 'Pass & play', body: chipGroup('Board', [['small', 'Compact'], ['big', 'Grand']], size, function (v) { size = v; }),
      actions: [{ label: 'Cancel' }, { label: 'Start duel', icon: 'play', primary: true, run: function () { store.size = size; save(); startTurns({ mode: 'local', size: size, first: 0, me: 0, seed: Math.floor(Math.random() * 1e9) }); } }]
    });
  });
  $('btn-ai').addEventListener('click', function () {
    var size = store.size, lvl = store.aiLevel, box = document.createElement('div');
    box.style.display = 'grid'; box.style.gap = '14px';
    box.appendChild(chipGroup('Difficulty', [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']], lvl, function (v) { lvl = v; }));
    box.appendChild(chipGroup('Board', [['small', 'Compact'], ['big', 'Grand']], size, function (v) { size = v; }));
    modal({
      kind: 'setup', eyebrow: 'Take turns against the AI', title: 'Vs computer', body: box,
      actions: [{ label: 'Cancel' }, { label: 'Start duel', icon: 'play', primary: true, run: function () { store.size = size; store.aiLevel = lvl; save(); startTurns({ mode: 'ai', size: size, aiLevel: lvl, first: 0, me: 0, seed: Math.floor(Math.random() * 1e9) }); } }]
    });
  });
  $('btn-online').addEventListener('click', openLobby);
  $('btn-lobby-friends').addEventListener('click', openFriends);
  $('btn-friends-refresh').addEventListener('click', function () {
    if (!Social || !Social.user) return;
    Social.refresh().then(probeFriends, function () { toast('Couldn\u2019t reach Facebook. Check your connection.'); });
  });
  $('btn-howto').addEventListener('click', function () { howTo(); });
  $('btn-settings').addEventListener('click', function () { openSettings(); });
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!$('friends').hidden) { openLobby(); return; }
      if (!$('lobby').hidden) Net.close();
      show('home');
    });
  });
  $('level-grid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-level]'); if (b && !b.disabled) startLevel(Number(b.dataset.level));
  });
  $('btn-quit').addEventListener('click', function () {
    if (canPause()) { pauseGame(); return; }
    if (G.mode === 'online' && !G.over) modal({ title: 'Leave the match?', body: 'Your rival wins if you leave.', actions: [{ label: 'Stay' }, { label: 'Leave', primary: true, run: leaveGame }] });
    else leaveGame();
  });
  $('btn-hint').addEventListener('click', useHint);
  $('btn-shuffle').addEventListener('click', useShuffle);
  $('board').addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !G.lay || G.over || board.busy()) return;
    board.setHover(board.hit(e.clientX, e.clientY));
    $('board').style.cursor = board.hover >= 0 ? 'pointer' : 'default';
  });
  $('board').addEventListener('pointerleave', function () { board.setHover(-1); });
  $('btn-themes').addEventListener('click', function () { openThemes(); });
  document.addEventListener('pointerdown', function (e) {
    // A tap on the open sky behind the home screen lets a lantern go.
    if (e.target === $('bg') && !$('home').hidden) { A.unlock(); if (sky.release(e.clientX, e.clientY) !== false) { A.chime(); buzz(8); } return; }
    var q = e.target.closest && e.target.closest('.qtile');
    if (q && !reduced) { q.classList.remove('hop'); void q.offsetWidth; q.classList.add('hop'); A.select(); buzz(6); }
    var b = e.target.closest && e.target.closest('.cta, .duel-opt, .primary, .ghost, .chip, .theme-card');
    if (!b || b.disabled || reduced) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), sp = document.createElement('span');
    sp.className = 'ripple'; sp.style.width = sp.style.height = s + 'px';
    sp.style.left = (e.clientX - r.left - s / 2) + 'px'; sp.style.top = (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(sp); setTimeout(function () { sp.remove(); }, 600);
  });
  $('board').addEventListener('pointerdown', function (e) {
    A.unlock();
    var i = board.hit(e.clientX, e.clientY);
    if (i >= 0) onTileTap(i);
  });
  ['pick-duel', 'pick-size'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      if (id === 'pick-duel') lobby.duel = store.duel = c.dataset.v; else lobby.size = store.size = c.dataset.v;
      save(); syncLobbyChips();
    });
  });
  $('btn-host').addEventListener('click', function () { if (!onlineSupported()) return; setLobbyStatus('Creating room…'); Net.host(); });
  $('join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!onlineSupported()) return;
    var code = $('join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { setLobbyStatus('Room codes are 5 letters or numbers.', true); return; }
    Net.join(code);
  });
  $('btn-copy-code').addEventListener('click', function () { copyText(Net.code, 'Room code'); });
  // In the app the page lives at https://localhost, so a link is useless there: share the code instead.
  $('btn-copy-link').addEventListener('click', function () {
    var msg = Shell.isNative ? 'Play Jade Rush with me! Open Online duel, tap Join a room and enter ' + Net.code + '.'
      : location.origin + location.pathname + '?room=' + Net.code;
    if (Shell.isNative && navigator.share) navigator.share({ text: msg }).catch(function () { copyText(msg, 'Invite'); });
    else copyText(msg, Shell.isNative ? 'Invite' : 'Invite link');
  });
  $('emotes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-emote]'); if (!b) return;
    Net.send({ t: 'emote', e: b.dataset.emote }); showEmote(b.dataset.emote, true);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || $('modal').hidden) return;
    if (modal.back) modal.back(); else closeModal();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
  Shell.onPause(pauseGame);
  Shell.onBack(function () {
    if (!$('modal').hidden) { if (modal.back) modal.back(); else closeModal(); return true; }
    if (!$('game').hidden) { $('btn-quit').click(); return true; }
    if (!$('friends').hidden) { openLobby(); return true; }
    if (!$('levels').hidden || !$('lobby').hidden) { if (!$('lobby').hidden) Net.close(); show('home'); return true; }
    return false;
  });
  window.addEventListener('pointerdown', function () { A.unlock(); }, { once: true });
  if (window.ResizeObserver) new ResizeObserver(function () { board.resize(); }).observe($('board-wrap'));
  else window.addEventListener('resize', function () { board.resize(); });

  // ------------------------------------------------------------- home demo
  var demo = new window.TileBoard($('demo')), D = { n: 0, next: 0 };
  function newDemo() {
    var spec = { cols: 5, rows: 3, layers: 2, carve: 0, stack: 0.7, target: 0 };
    var g = M.generate(spec, 'demo-' + (D.n++ % 9));
    D.g = g; D.present = new Uint8Array(g.layout.n).fill(1); D.sol = g.solution.slice(); D.step = 0;
    demo.set(g.layout, g.kinds, D.present, false);
    D.next = performance.now() + 1200;
  }
  function stepDemo(now) {
    if (now < D.next) return;
    if (!D.sol.length) { newDemo(); return; }
    var pr = D.sol[0];
    if (D.step === 0) { demo.sel = pr[0]; demo.invalidate(); D.step = 1; D.next = now + 420; }
    else { D.present[pr[0]] = 0; D.present[pr[1]] = 0; demo.sel = -1; demo.matched(pr[0], pr[1]); D.sol.shift(); D.step = 0; D.next = now + (D.sol.length ? 650 : 1600); }
  }

  // ------------------------------------------------------------- loop & boot
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(250, now - last); last = now;
    sky.frame(now);
    confetti.frame(dt);
    if (!$('home').hidden) { stepDemo(now); demo.frame(now); }
    if (!$('game').hidden && G.lay && !isTurns() && G.limit) {
      if (G.shownScore !== G.score) {
        G.shownScore += Math.max(1, Math.ceil((G.score - G.shownScore) * 0.18));
        if (G.shownScore > G.score) G.shownScore = G.score;
        $('score').textContent = G.shownScore;
      }
      var win = G.lastMatch ? 1 - (now - G.lastMatch) / COMBO_MS : 0;
      $('combo-bar').style.width = Math.max(0, win * 100) + '%';
      $('combo').parentNode.style.setProperty('--combo', Math.max(0, win).toFixed(3));
      if (win <= 0 && G.combo > 0 && !G.over) { G.combo = 0; setHeat(0); updateTimedHud(); }
    }
    if (!$('game').hidden && G.lay) { tickTimed(dt); tickTurns(now); board.frame(now); }
    requestAnimationFrame(loop);
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 24px "Noto Serif SC"', '萬中發東南西北').then(function () { board.clearSprites(); demo.clearSprites(); }, function () {});
  }

  window.JadeRush = { state: function () { return G; }, board: board }; // read-only hook for automated tests

  initFriends();
  applyTheme();
  Shell.styleBars(currentTheme().bg[0]);
  show('home');
  var hideLoader = function () { var l = $('loader'); if (l && !l.classList.contains('done')) { l.classList.add('done'); setTimeout(function () { l.remove(); }, 500); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(hideLoader, 250); });
  setTimeout(hideLoader, 1500);
  demo.resize(); newDemo();
  requestAnimationFrame(loop);
  var room = new URLSearchParams(location.search).get('room');
  if (room && /^[A-Za-z0-9]{5}$/.test(room)) {
    openLobby(); $('join-code').value = room.toUpperCase();
    if (onlineSupported()) Net.join(room);
  }
})();
