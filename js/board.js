/* Canvas renderer for a layered Mahjong board.
   Seen from above: each tile is a carved wooden block with only a thin front edge showing,
   and stacked layers sit slightly higher. Tiles are pre-rendered sprites: a soft cast shadow,
   a varnished wood body with grain, and symbols carved and painted into the top. Matches play a
   "slam": both tiles lift, rush together, collide with a hit-stop, then fuse and vanish. */
(function (global) {
  'use strict';
  var T = global.MahjongTiles;
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEPTH = 0.2;  // visible edge (and per-layer rise) as a fraction of half-tile width
  var VARIANTS = 6; // distinct grain patterns per tile set
  var ASPECT = 1.3; // tile height / width
  var M = 3;        // sprite margin in CSS px

  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function easeOutBack(t) { var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function easeInCubic(t) { return t * t * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function hexA(h, a) { var v = parseInt(h.slice(1), 16); return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')'; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function tint(src, color) {
    var c = canvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  var grain = null;
  function grainPattern(g) {
    if (!grain) {
      grain = canvas(96, 96);
      var gg = grain.getContext('2d'), img = gg.createImageData(96, 96);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 128 + (Math.random() - 0.5) * 120;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      gg.putImageData(img, 0, 0);
      gg.globalAlpha = 0.25; gg.strokeStyle = '#6b5b3a';
      for (var k = 0; k < 6; k++) { gg.beginPath(); gg.moveTo(Math.random() * 96, 0); gg.bezierCurveTo(Math.random() * 96, 32, Math.random() * 96, 64, Math.random() * 96, 96); gg.stroke(); }
    }
    return g.createPattern(grain, 'repeat');
  }

  function TileBoard(canvasEl) {
    this.c = canvasEl; this.g = canvasEl.getContext('2d');
    this.stat = document.createElement('canvas'); this.sg = this.stat.getContext('2d');
    this.lay = null; this.kinds = null; this.present = null;
    this.theme = T.THEMES[0]; this.accent = this.theme.accent;
    this.sel = -1; this.hover = -1; this.partners = []; this.hint = []; this.hintUntil = 0; this.showFree = false;
    this.flash = []; this.fx = []; this.rings = []; this.flashes = []; this.particles = []; this.sprites = new Map();
    this.entry = null; this.flip = null; this.dirty = true; this.shake = 0;
    this.fw = 40; this.fh = 52; this.dz = 6; this.dpr = 1;
  }

  TileBoard.prototype.set = function (lay, kinds, present, showFree, animate) {
    this.lay = lay; this.kinds = kinds; this.present = present; this.showFree = !!showFree;
    this.sel = -1; this.hover = -1; this.partners = []; this.hint = []; this.flash = [];
    this.fx = []; this.rings = []; this.flashes = []; this.particles = []; this.flip = null; this.shake = 0;
    this.resize();
    if (animate !== false && !reducedMotion) {
      var stagger = Math.min(14, 900 / lay.n), delays = new Float32Array(lay.n);
      lay.order.forEach(function (i, k) { delays[i] = k * stagger + lay.z[i] * 80; });
      this.entry = { t0: performance.now(), delays: delays, end: performance.now() + lay.n * stagger + lay.maxZ * 80 + 450 };
    } else this.entry = null;
  };

  TileBoard.prototype.setTheme = function (theme) { this.theme = theme; this.accent = theme.accent; this.sprites.clear(); this.dirty = true; };

  TileBoard.prototype.resize = function () {
    var rect = this.c.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    this.dpr = dpr; this.W = rect.width; this.H = rect.height;
    this.c.width = this.stat.width = Math.max(1, Math.round(rect.width * dpr));
    this.c.height = this.stat.height = Math.max(1, Math.round(rect.height * dpr));
    if (this.lay) {
      var L = this.lay, spanX = L.maxX - L.minX, spanY = L.maxY - L.minY, layers = L.maxZ + 1;
      var u = Math.min(rect.width / (spanX + 0.5), rect.height / (spanY * ASPECT + (layers + 1) * DEPTH + 0.5));
      this.ux = u; this.uy = u * ASPECT; this.dz = u * DEPTH;
      this.fw = 2 * u; this.fh = 2 * this.uy;
      var bw = spanX * u, bh = spanY * this.uy + (layers + 1) * this.dz;
      this.ox = (rect.width - bw) / 2; this.oy = (rect.height - bh) / 2;
    }
    this.sprites.clear();
    this.dirty = true;
  };

  TileBoard.prototype.rect = function (i) {
    var L = this.lay;
    return {
      x: this.ox + (L.x[i] - L.minX) * this.ux,
      y: this.oy + (L.maxZ - L.z[i]) * this.dz + (L.y[i] - L.minY) * this.uy,
      w: this.fw, h: this.fh
    };
  };

  TileBoard.prototype.hit = function (clientX, clientY) {
    if (!this.lay) return -1;
    var b = this.c.getBoundingClientRect(), px = clientX - b.left, py = clientY - b.top, o = this.lay.order;
    for (var k = o.length - 1; k >= 0; k--) {
      var i = o[k];
      if (!this.present[i]) continue;
      var r = this.rect(i);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h + this.dz) return i;
    }
    return -1;
  };

  TileBoard.prototype.isFree = function (i) { return global.Mahjong.isFree(this.lay, this.present, i); };

  // ---------------------------------------------------------------- sprites
  function woodGrain(g, x, y, w, h, th, seed) {
    var rand = global.Mahjong.mulberry32(seed), k;
    var base = g.createLinearGradient(x, y, x + w, y + h);
    base.addColorStop(0, th.face[0]); base.addColorStop(1, th.face[1]);
    g.fillStyle = base; g.fillRect(x, y, w, h);
    // Long grain lines run down the tile, bending around an occasional knot.
    var knot = rand() < 0.35 ? { x: x + w * (0.2 + rand() * 0.6), y: y + h * (0.2 + rand() * 0.6), r: w * (0.06 + rand() * 0.08) } : null;
    var lines = 26, phase = rand() * 10, freq = 0.8 + rand() * 1.2;
    for (k = 0; k < lines; k++) {
      var lx = x - w * 0.1 + (k / lines) * w * 1.2 + (rand() - 0.5) * w * 0.03;
      g.beginPath();
      for (var t = 0; t <= 1.0001; t += 0.05) {
        var yy = y + t * h, xx = lx + Math.sin(t * freq * 3 + phase + k * 0.15) * w * 0.035;
        if (knot) { var dy = yy - knot.y, dx = xx - knot.x, dist = Math.hypot(dx, dy) + 0.001, push = Math.max(0, knot.r * 2.2 - dist) * 0.6; xx += dx / dist * push; }
        if (t === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.strokeStyle = hexA(th.grain, k % 3 === 0 ? 0.32 : 0.14 + rand() * 0.1);
      g.lineWidth = (k % 3 === 0 ? 1.1 : 0.6) * Math.max(1, w / 50);
      g.stroke();
    }
    if (knot) {
      for (k = 4; k >= 1; k--) {
        g.beginPath(); g.ellipse(knot.x, knot.y, knot.r * k * 0.45, knot.r * k * 0.7, 0, 0, 6.283);
        g.strokeStyle = hexA(th.grain, 0.18 + 0.1 * (4 - k)); g.lineWidth = Math.max(0.6, w / 70); g.stroke();
      }
      g.fillStyle = hexA(th.grain, 0.45); g.beginPath(); g.ellipse(knot.x, knot.y, knot.r * 0.3, knot.r * 0.45, 0, 0, 6.283); g.fill();
    }
    // Fine pores.
    g.globalAlpha = 0.07; g.fillStyle = grainPattern(g); g.fillRect(x, y, w, h); g.globalAlpha = 1;
  }

  TileBoard.prototype.base = function (variant) {
    variant = (variant || 0) % VARIANTS;
    var key = 'base' + variant;
    if (this.sprites.has(key)) return this.sprites.get(key);
    var th = this.theme, S = this.dpr, fw = this.fw, fh = this.fh, d = this.dz, rad = fw * 0.13;
    var W = fw + M * 2, H = fh + d + M * 2, c = canvas(W * S, H * S), g = c.getContext('2d');
    g.scale(S, S);
    var fx = M, fy = M, k;
    // Front edge: the wood body, then a strip of the dyed back layer at the very bottom.
    var step = Math.max(0.35, d / 30);
    for (k = d; k >= 0; k -= step) {
      var t = k / d;
      g.fillStyle = t > 0.6 ? T.mix(th.back[0], th.back[1], (t - 0.6) / 0.4) : T.mix(th.body[0], th.body[1], t / 0.6);
      rr(g, fx, fy + k, fw, fh, rad); g.fill();
    }
    g.save(); g.globalCompositeOperation = 'source-atop';
    var shade = g.createLinearGradient(0, fy + fh - rad, 0, fy + fh + d);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shade; g.fillRect(0, 0, W, H);
    g.restore();
    // Top surface: wood grain under a satin varnish.
    g.save();
    rr(g, fx, fy, fw, fh, rad); g.clip();
    woodGrain(g, fx, fy, fw, fh, th, 9173 + variant * 7919);
    var b = fw * 0.07;
    // Rounded (routed) edge: light catches the top rim, the lower rim rolls into shade.
    g.beginPath();
    rr(g, fx, fy, fw, fh, rad);
    g.moveTo(fx + b + rad * 0.6, fy + b);
    g.arcTo(fx + b, fy + b, fx + b, fy + fh - b, rad * 0.6); g.arcTo(fx + b, fy + fh - b, fx + fw - b, fy + fh - b, rad * 0.6);
    g.arcTo(fx + fw - b, fy + fh - b, fx + fw - b, fy + b, rad * 0.6); g.arcTo(fx + fw - b, fy + b, fx + b, fy + b, rad * 0.6); g.closePath();
    var bev = g.createLinearGradient(0, fy, 0, fy + fh);
    bev.addColorStop(0, 'rgba(255,245,220,0.55)'); bev.addColorStop(0.5, 'rgba(255,245,220,0.08)'); bev.addColorStop(1, 'rgba(40,20,5,0.35)');
    g.fillStyle = bev; g.fill('evenodd');
    var varnish = g.createRadialGradient(fx + fw * 0.35, fy + fh * 0.2, 0, fx + fw * 0.35, fy + fh * 0.2, fh * 0.8);
    varnish.addColorStop(0, 'rgba(255,250,235,0.28)'); varnish.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = varnish; g.fillRect(fx, fy, fw, fh);
    var glint = g.createLinearGradient(0, fy + b * 0.2, 0, fy + b * 1.6);
    glint.addColorStop(0, 'rgba(255,255,255,0.55)'); glint.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glint; g.fillRect(fx + rad, fy + b * 0.2, fw - rad * 2, b * 1.4);
    g.restore();
    rr(g, fx + 0.5, fy + 0.5, fw - 1, fh - 1, rad);
    g.strokeStyle = 'rgba(40,20,5,0.4)'; g.lineWidth = 1; g.stroke();
    var spr = { c: c, w: W, h: H, dim: tint(c, 'rgba(8,12,22,0.42)') };
    this.sprites.set(key, spr);
    return spr;
  };

  TileBoard.prototype.shadow = function () {
    if (this.sprites.has('shadow')) return this.sprites.get('shadow');
    var S = this.dpr, fw = this.fw, fh = this.fh, blur = fw * 0.22, pad = blur * 2;
    var W = fw + pad * 2, H = fh + pad * 2, c = canvas(W * S, H * S), g = c.getContext('2d');
    g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = blur * S; g.shadowOffsetX = 2000 * S;
    rr(g, pad - 2000, pad, fw, fh, fw * 0.14); g.fillStyle = '#000'; g.fill();
    var s = { c: c, w: W, h: H, pad: pad };
    this.sprites.set('shadow', s);
    return s;
  };

  /** Symbols carved into the face: lit lip, groove shadow and enamel paint. */
  TileBoard.prototype.face = function (kind) {
    if (this.sprites.has(kind)) return this.sprites.get(kind);
    var S = this.dpr, pad = this.fw * 0.11, w = this.fw - pad * 2, h = this.fh - pad * 2, dark = this.theme.pal === 'dark';
    var paint = canvas(w * S, h * S), pg = paint.getContext('2d');
    pg.scale(S, S);
    T.drawFace(pg, kind, w, h, this.theme.pal);
    pg.globalCompositeOperation = 'source-atop';
    var enamel = pg.createLinearGradient(0, 0, 0, h);
    enamel.addColorStop(0, 'rgba(255,255,255,0.22)'); enamel.addColorStop(0.5, 'rgba(255,255,255,0)'); enamel.addColorStop(1, 'rgba(0,0,0,0.15)');
    pg.fillStyle = enamel; pg.fillRect(0, 0, w, h);
    var out = canvas(paint.width, paint.height), og = out.getContext('2d'), o = Math.max(0.6, this.fw * 0.014) * S;
    // Carved into wood: a lit lip below the cut, a dark burned edge above it, then the paint.
    og.globalAlpha = dark ? 0.3 : 0.55; og.drawImage(tint(paint, '#fff3d6'), 0, o);
    og.globalAlpha = dark ? 0.7 : 0.5; og.drawImage(tint(paint, '#2a1406'), 0, -o * 0.8);
    og.globalAlpha = 1; og.drawImage(paint, 0, 0);
    var rim = tint(paint, '#1a0c03'), rg = rim.getContext('2d');
    rg.globalCompositeOperation = 'destination-out'; rg.drawImage(paint, 0, o * 1.3);
    og.globalAlpha = 0.55; og.drawImage(rim, 0, 0);
    var s = { c: out, pad: pad, w: w, h: h };
    this.sprites.set(kind, s);
    return s;
  };

  // ---------------------------------------------------------------- drawing
  /** Cast shadow for a tile whose face sits at r (scaled by r.w / fw). */
  TileBoard.prototype.drawShadow = function (g, r, o) {
    var sh = this.shadow(), sc = r.w / this.fw, lift = (o && o.lift) || 0, d = this.dz;
    g.save();
    g.globalAlpha = (o && o.alpha != null ? o.alpha : 1) * Math.max(0.35, 0.8 - lift / (this.fw * 1.5));
    var grow = 1 + lift / this.fw * 0.25;
    var w = sh.w * sc * grow, h = sh.h * sc * grow;
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2 + d * 1.6 + lift * 0.5;
    g.drawImage(sh.c, cx - w / 2, cy - h / 2, w, h);
    g.restore();
  };

  /** o: { state, lift, scaleX, alpha, rot, glow, white, noShadow } */
  TileBoard.prototype.drawTile = function (g, r, kind, o) {
    o = o || {};
    if (!o.noShadow) this.drawShadow(g, r, o);
    var base = this.base(o.variant), sc = r.w / this.fw, lift = o.lift || 0;
    var x = r.x, y = r.y - lift, rad = r.w * 0.13;
    g.save();
    if (o.alpha != null) g.globalAlpha = o.alpha;
    var cx = x + r.w / 2, cy = y + r.h / 2;
    if (o.rot) { g.translate(cx, cy); g.rotate(o.rot); g.translate(-cx, -cy); }
    if (o.scaleX != null && o.scaleX !== 1) { g.translate(cx, 0); g.scale(Math.max(0.02, o.scaleX), 1); g.translate(-cx, 0); }
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = r.w * 0.45; }
    var bx = x - M * sc, by = y - M * sc;
    g.drawImage(base.c, bx, by, base.w * sc, base.h * sc);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    var f = this.face(kind);
    g.drawImage(f.c, x + f.pad * sc, y + f.pad * sc, f.w * sc, f.h * sc);
    if (o.state === 'blocked') g.drawImage(base.dim, bx, by, base.w * sc, base.h * sc);
    if (o.white) { rr(g, x, y, r.w, r.h, rad); g.fillStyle = 'rgba(255,255,255,' + o.white + ')'; g.fill(); }
    if (o.state === 'selected' || o.state === 'hover') {
      rr(g, x - 1, y - 1, r.w + 2, r.h + 2, rad + 1);
      g.shadowColor = this.accent; g.shadowBlur = o.state === 'selected' ? 14 : 6;
      g.strokeStyle = o.state === 'selected' ? this.accent : hexA(this.accent, 0.75);
      g.lineWidth = Math.max(2, r.w * (o.state === 'selected' ? 0.065 : 0.04)); g.stroke();
    }
    g.restore();
  };

  TileBoard.prototype.drawAll = function (g, now, skip) {
    var L = this.lay, e = this.entry, f = this.flip, free = null, k, i;
    if (this.showFree) { free = new Uint8Array(L.n); for (i = 0; i < L.n; i++) free[i] = this.present[i] && this.isFree(i) ? 1 : 0; }
    // Draw layer by layer: a layer's shadows land on the layer below, then its tiles cover them.
    var z = -1, batch = [];
    var flush = function (self) {
      batch.forEach(function (it) { self.drawShadow(g, it.r, it.o); });
      batch.forEach(function (it) { it.o.noShadow = true; self.drawTile(g, it.r, it.kind, it.o); });
      batch = [];
    };
    for (k = 0; k < L.order.length; k++) {
      i = L.order[k];
      if (!this.present[i] || (skip && skip[i])) continue;
      if (L.z[i] !== z) { flush(this); z = L.z[i]; }
      var r = this.rect(i), o = { state: free && !free[i] ? 'blocked' : '', variant: i }, kind = this.kinds[i];
      if (e) {
        var t = clamp01((now - e.t0 - e.delays[i]) / 420);
        if (t <= 0) continue;
        r = { x: r.x, y: r.y - (1 - easeOutBack(t)) * this.fh * 0.9, w: r.w, h: r.h };
        o.alpha = Math.min(1, t * 2.5);
      }
      if (f) {
        var ft = clamp01((now - f.t0 - k * 4) / 480);
        o.scaleX = Math.abs(Math.cos(Math.PI * ft));
        if (ft < 0.5) kind = f.old[i];
      }
      batch.push({ r: r, o: o, kind: kind });
    }
    flush(this);
  };

  TileBoard.prototype.renderStatic = function () {
    var g = this.sg;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.lay) {
      var skip = {};
      if (this.sel >= 0) skip[this.sel] = 1;
      if (this.hover >= 0) skip[this.hover] = 1;
      this.drawAll(g, 0, skip);
    }
    this.dirty = false;
  };

  TileBoard.prototype.invalidate = function () { this.dirty = true; };
  TileBoard.prototype.clearSprites = function () { this.sprites.clear(); this.dirty = true; };
  TileBoard.prototype.setHover = function (i) {
    if (i >= 0 && (i === this.sel || !this.isFree(i))) i = -1;
    if (i !== this.hover) { this.hover = i; this.dirty = true; }
  };
  TileBoard.prototype.showHint = function (pair, ms) { this.hint = pair; this.hintUntil = performance.now() + (ms || 3000); };
  TileBoard.prototype.wrong = function (i) { this.flash.push({ i: i, t0: performance.now() }); };
  TileBoard.prototype.flipFrom = function (oldKinds) { if (!reducedMotion) this.flip = { t0: performance.now(), old: oldKinds }; this.dirty = true; };
  TileBoard.prototype.busy = function () { return !!(this.entry || this.flip); };

  // ---------------------------------------------------------------- slam
  var RISE = 110, RUSH = 150, HOLD = 70, FUSE = 170;

  /** Slam a matched pair together. Call after clearing present[]. onImpact fires at the collision. */
  TileBoard.prototype.matched = function (a, b, color, power, onImpact) {
    var ra = this.rect(a), rb = this.rect(b);
    var ca = [ra.x + ra.w / 2, ra.y + ra.h / 2], cb = [rb.x + rb.w / 2, rb.y + rb.h / 2];
    // Always meet side by side, so the pair slams face to face whatever their positions.
    var u = cb[0] >= ca[0] ? [1, 0] : [-1, 0], ext = this.fw / 2;
    var mx = (ca[0] + cb[0]) / 2, my = (ca[1] + cb[1]) / 2 - this.fh * 0.2;
    this.fx.push({
      ka: this.kinds[a], kb: this.kinds[b], va: a, vb: b, ca: ca, cb: cb, u: u, m: [mx, my], ext: ext,
      t0: performance.now(), color: color || this.accent, power: power || 1, onImpact: onImpact, hit: false
    });
    if (this.hover === a || this.hover === b) this.hover = -1;
    this.hint = []; this.partners = []; this.dirty = true;
  };

  TileBoard.prototype.impact = function (e, now) {
    var x = e.m[0], y = e.m[1], u = e.u, p = e.power, fw = this.fw, th = this.theme;
    if (e.onImpact) e.onImpact();
    if (reducedMotion) { this.rings.push({ x: x, y: y, t0: now, color: e.color, w: 1 }); return; }
    this.shake = Math.min(16, this.shake + 5 + p * 3);
    this.flashes.push({ x: x, y: y, t0: now, r: fw * (1.1 + p * 0.25) });
    this.rings.push({ x: x, y: y, t0: now, color: '#ffffff', w: 1.2 });
    this.rings.push({ x: x, y: y, t0: now + 60, color: e.color, w: 0.9 });
    var perp = [-u[1], u[0]];
    for (var k = 0; k < 26 + p * 8; k++) {
      var side = k % 2 ? 1 : -1, spread = (Math.random() - 0.5) * 1.4;
      var vx = (perp[0] * side + u[0] * spread) * (0.25 + Math.random() * 0.55) * fw / 40;
      var vy = (perp[1] * side + u[1] * spread) * (0.25 + Math.random() * 0.55) * fw / 40 - 0.1;
      this.particles.push({ kind: 'spark', x: x, y: y, vx: vx, vy: vy, t0: now, life: 280 + Math.random() * 320, color: k % 3 ? '#fff4c2' : e.color, g: 0.0009 });
    }
    var chipCols = [th.face[0], th.face[1], th.body[0], th.body[1]];
    for (k = 0; k < 12; k++) {
      var ang = Math.random() * 6.283, sp = (0.1 + Math.random() * 0.3) * fw / 40;
      this.particles.push({ kind: 'chip', x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.25 * fw / 40, t0: now, life: 650 + Math.random() * 350, color: chipCols[k % 4], size: fw * (0.05 + Math.random() * 0.07), rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.03, g: 0.0016 });
    }
    for (k = 0; k < 7; k++) {
      var a2 = Math.random() * 6.283;
      this.particles.push({ kind: 'dust', x: x + Math.cos(a2) * fw * 0.2, y: y + Math.sin(a2) * fw * 0.2, vx: Math.cos(a2) * 0.03, vy: Math.sin(a2) * 0.03 - 0.02, t0: now, life: 600 + Math.random() * 300, color: th.face[1], size: fw * (0.25 + Math.random() * 0.2), g: 0 });
    }
  };

  TileBoard.prototype.drawSlam = function (g, e, now) {
    var t = now - e.t0, u = e.u, fw = this.fw, fh = this.fh, self = this;
    var lift = 0, pa, pb, rot = 0, scale = 1, squash = 1, white = 0, alpha = 1;
    var back = fw * 0.12, ta = [e.m[0] - u[0] * e.ext, e.m[1] - u[1] * e.ext], tb = [e.m[0] + u[0] * e.ext, e.m[1] + u[1] * e.ext];
    var sa = [e.ca[0] - u[0] * back, e.ca[1] - u[1] * back - fh * 0.08], sb = [e.cb[0] + u[0] * back, e.cb[1] + u[1] * back - fh * 0.08];
    if (t < RISE) {
      var q = easeOutCubic(t / RISE);
      pa = [e.ca[0] + (sa[0] - e.ca[0]) * q, e.ca[1] + (sa[1] - e.ca[1]) * q];
      pb = [e.cb[0] + (sb[0] - e.cb[0]) * q, e.cb[1] + (sb[1] - e.cb[1]) * q];
      lift = this.dz * 1.6 * q; scale = 1 + 0.06 * q; rot = 0.1 * q;
    } else if (t < RISE + RUSH) {
      var r = easeInCubic((t - RISE) / RUSH);
      pa = [sa[0] + (ta[0] - sa[0]) * r, sa[1] + (ta[1] - sa[1]) * r];
      pb = [sb[0] + (tb[0] - sb[0]) * r, sb[1] + (tb[1] - sb[1]) * r];
      lift = this.dz * 1.6; scale = 1.06; rot = 0.1 * (1 - r);
      // Motion trail.
      [0.18, 0.36].forEach(function (lag, n) {
        var rl = easeInCubic(Math.max(0, (t - RISE) / RUSH - lag));
        var w = fw * scale, h = fh * scale;
        [[sa, ta, e.ka, e.va], [sb, tb, e.kb, e.vb]].forEach(function (s) {
          var px = s[0][0] + (s[1][0] - s[0][0]) * rl, py = s[0][1] + (s[1][1] - s[0][1]) * rl;
          self.drawTile(g, { x: px - w / 2, y: py - h / 2, w: w, h: h }, s[2], { lift: lift, alpha: 0.22 / (n + 1), noShadow: true, variant: s[3] });
        });
      });
    } else {
      if (!e.hit) { e.hit = true; this.impact(e, now); }
      pa = ta; pb = tb; lift = this.dz * 1.6;
      var h2 = t - RISE - RUSH;
      if (h2 < HOLD) { squash = 1 - 0.12 * Math.sin(Math.PI * h2 / HOLD); white = 0.5 * (1 - h2 / HOLD) + 0.2; scale = 1.06; }
      else {
        var f = clamp01((h2 - HOLD) / FUSE);
        scale = 1.06 * (1 - easeInCubic(f)); white = 0.2 + 0.6 * f; alpha = 1 - f * 0.5;
        pa = [ta[0] + (e.m[0] - ta[0]) * f, ta[1] + (e.m[1] - ta[1]) * f];
        pb = [tb[0] + (e.m[0] - tb[0]) * f, tb[1] + (e.m[1] - tb[1]) * f];
        rot = -0.4 * f;
      }
    }
    var w = fw * scale, h = fh * scale;
    if (w < 1) return;
    var sx = 1 - (1 - squash) * Math.abs(u[0]), sy = 1 - (1 - squash) * Math.abs(u[1]);
    [[pa, e.ka, -1, e.va], [pb, e.kb, 1, e.vb]].forEach(function (s) {
      var ww = w * sx, hh = h * sy;
      self.drawTile(g, { x: s[0][0] - ww / 2, y: s[0][1] - hh / 2, w: ww, h: hh }, s[1], { lift: lift, rot: rot * s[2], white: white, alpha: alpha, glow: hexA(e.color, 0.85), variant: s[3] });
    });
  };

  // ---------------------------------------------------------------- frame
  TileBoard.prototype.frame = function (now) {
    var g = this.g;
    if (this.entry && now > this.entry.end) { this.entry = null; this.dirty = true; }
    if (this.flip && now > this.flip.t0 + 480 + this.lay.n * 4) { this.flip = null; this.dirty = true; }
    var animating = this.entry || this.flip;
    if (!animating && this.dirty) this.renderStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (!this.lay) return;
    var sx = 0, sy = 0;
    if (this.shake > 0.3) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= 0.86; } else this.shake = 0;
    if (animating) { g.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr); this.drawAll(g, now, null); }
    else g.drawImage(this.stat, sx * this.dpr, sy * this.dpr);
    g.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    var rad = this.fw * 0.12, k, r, pulse = 0.5 + 0.5 * Math.sin(now / 150);

    if (!animating) {
      for (k = 0; k < this.partners.length; k++) {
        var pi = this.partners[k];
        if (!this.present[pi] || pi === this.hover) continue;
        r = this.rect(pi);
        rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
        g.strokeStyle = hexA(this.accent, 0.35 + pulse * 0.45); g.lineWidth = 2.5; g.stroke();
      }
      if (this.hover >= 0 && this.present[this.hover]) this.drawTile(g, this.rect(this.hover), this.kinds[this.hover], { state: 'hover', lift: this.dz * 0.9, variant: this.hover });
      if (this.sel >= 0 && this.present[this.sel]) {
        var bob = reducedMotion ? 0 : Math.sin(now / 220) * this.dz * 0.3;
        this.drawTile(g, this.rect(this.sel), this.kinds[this.sel], { state: 'selected', lift: this.dz * 1.8 + bob, glow: hexA(this.accent, 0.7), variant: this.sel });
      }
    }
    if (this.hint.length && now < this.hintUntil) {
      for (k = 0; k < this.hint.length; k++) {
        if (!this.present[this.hint[k]]) continue;
        r = this.rect(this.hint[k]);
        rr(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, rad + 3);
        g.save(); g.shadowColor = '#fff1a8'; g.shadowBlur = 16;
        g.strokeStyle = 'rgba(255,241,168,' + (0.5 + pulse * 0.5) + ')'; g.lineWidth = 3.5; g.stroke(); g.restore();
      }
    }
    for (k = this.flash.length - 1; k >= 0; k--) {
      var fl = this.flash[k], q = (now - fl.t0) / 380;
      if (q >= 1 || !this.present[fl.i]) { this.flash.splice(k, 1); continue; }
      r = this.rect(fl.i);
      var jx = reducedMotion ? 0 : Math.sin(q * 32) * (1 - q) * 5;
      rr(g, r.x + jx, r.y, r.w, r.h, rad);
      g.fillStyle = 'rgba(255,60,60,' + 0.25 * (1 - q) + ')'; g.fill();
      g.strokeStyle = 'rgba(255,70,60,' + (1 - q) + ')'; g.lineWidth = 3; g.stroke();
    }
    // Dust sits behind the slam; sparks and chips fly in front.
    this.drawParticles(g, now, 'dust');
    for (k = this.fx.length - 1; k >= 0; k--) {
      var e = this.fx[k];
      if (now - e.t0 > RISE + RUSH + HOLD + FUSE) { this.fx.splice(k, 1); continue; }
      this.drawSlam(g, e, now);
    }
    for (k = this.flashes.length - 1; k >= 0; k--) {
      var fs = this.flashes[k], fq = (now - fs.t0) / 220;
      if (fq >= 1) { this.flashes.splice(k, 1); continue; }
      var fg = g.createRadialGradient(fs.x, fs.y, 0, fs.x, fs.y, fs.r * (0.6 + fq));
      fg.addColorStop(0, 'rgba(255,255,255,' + 0.95 * (1 - fq) + ')'); fg.addColorStop(0.35, 'rgba(255,240,190,' + 0.5 * (1 - fq) + ')'); fg.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = fg; g.fillRect(fs.x - fs.r * 2, fs.y - fs.r * 2, fs.r * 4, fs.r * 4);
    }
    for (k = this.rings.length - 1; k >= 0; k--) {
      var rg = this.rings[k], rq = (now - rg.t0) / 480;
      if (rq < 0) continue;
      if (rq >= 1) { this.rings.splice(k, 1); continue; }
      g.strokeStyle = hexA(rg.color, 0.85 * (1 - rq)); g.lineWidth = 5 * (1 - rq) * rg.w + 0.5;
      g.beginPath(); g.ellipse(rg.x, rg.y, this.fw * (0.3 + easeOutCubic(rq) * 1.8) * rg.w, this.fw * (0.2 + easeOutCubic(rq) * 1.2) * rg.w, 0, 0, 6.283); g.stroke();
    }
    this.drawParticles(g, now, 'spark');
    this.drawParticles(g, now, 'chip');
  };

  TileBoard.prototype.drawParticles = function (g, now, kind) {
    for (var k = this.particles.length - 1; k >= 0; k--) {
      var p = this.particles[k];
      if (p.kind !== kind) continue;
      var age = now - p.t0;
      if (age > p.life) { this.particles.splice(k, 1); continue; }
      var a = 1 - age / p.life, x = p.x + p.vx * age, y = p.y + p.vy * age + p.g * age * age;
      if (kind === 'spark') {
        var vy = p.vy + 2 * p.g * age;
        g.strokeStyle = hexA(p.color, a); g.lineWidth = Math.max(1, this.fw * 0.035 * a); g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * 22, y - vy * 22); g.stroke();
      } else if (kind === 'chip') {
        g.save(); g.translate(x, y); g.rotate(p.rot + p.vr * age); g.globalAlpha = Math.min(1, a * 1.5);
        g.fillStyle = p.color; g.beginPath();
        g.moveTo(-p.size, -p.size * 0.4); g.lineTo(p.size * 0.6, -p.size * 0.7); g.lineTo(p.size, p.size * 0.5); g.lineTo(-p.size * 0.3, p.size * 0.6);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.6; g.stroke();
        g.restore();
      } else {
        var sz = p.size * (1 + (1 - a) * 1.5);
        var dg = g.createRadialGradient(x, y, 0, x, y, sz);
        dg.addColorStop(0, hexA(p.color, 0.28 * a)); dg.addColorStop(1, hexA(p.color, 0));
        g.fillStyle = dg; g.fillRect(x - sz, y - sz, sz * 2, sz * 2);
      }
    }
  };

  global.TileBoard = TileBoard;
})(this);
