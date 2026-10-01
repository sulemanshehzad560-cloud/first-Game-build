/* Canvas renderer for a layered Mahjong board: glossy 3D tiles, hover lift, selection,
   matched pairs that fly together and burst, cascading entry and flip-shuffles. */
(function (global) {
  'use strict';
  var T = global.MahjongTiles;
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEPTH = 0.26; // tile thickness as a fraction of half-tile width
  var ASPECT = 1.3; // tile height / width
  var BURST = ['#ffd166', '#ff5fa2', '#38d6ff', '#7cffcb', '#b388ff', '#ff8a3d'];

  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function easeOutBack(t) { var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function easeIn(t) { return t * t; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

  function TileBoard(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.stat = document.createElement('canvas'); this.sg = this.stat.getContext('2d');
    this.lay = null; this.kinds = null; this.present = null;
    this.theme = T.THEMES[0]; this.accent = this.theme.accent;
    this.sel = -1; this.hover = -1; this.partners = []; this.hint = []; this.hintUntil = 0; this.showFree = false;
    this.flash = []; this.fx = []; this.rings = []; this.particles = []; this.sprites = new Map();
    this.entry = null; this.flip = null; this.dirty = true; this.freeCache = null;
  }

  TileBoard.prototype.set = function (lay, kinds, present, showFree, animate) {
    this.lay = lay; this.kinds = kinds; this.present = present; this.showFree = !!showFree;
    this.sel = -1; this.hover = -1; this.partners = []; this.hint = []; this.flash = []; this.fx = []; this.rings = []; this.particles = [];
    this.flip = null;
    this.resize();
    if (animate !== false && !reducedMotion) {
      var stagger = Math.min(14, 900 / lay.n), delays = new Float32Array(lay.n);
      lay.order.forEach(function (i, k) { delays[i] = k * stagger + lay.z[i] * 80; });
      this.entry = { t0: performance.now(), delays: delays, end: performance.now() + lay.n * stagger + lay.maxZ * 80 + 450 };
    } else this.entry = null;
  };

  TileBoard.prototype.setTheme = function (theme) {
    this.theme = theme; this.accent = theme.accent; this.sprites.clear(); this.dirty = true;
  };

  TileBoard.prototype.resize = function () {
    var rect = this.c.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    this.dpr = dpr; this.W = rect.width; this.H = rect.height;
    this.c.width = this.stat.width = Math.max(1, Math.round(rect.width * dpr));
    this.c.height = this.stat.height = Math.max(1, Math.round(rect.height * dpr));
    if (this.lay) {
      var L = this.lay, spanX = L.maxX - L.minX, spanY = L.maxY - L.minY, layers = L.maxZ + 1;
      var u = Math.min(rect.width / (spanX + layers * DEPTH + 0.4), rect.height / (spanY * ASPECT + layers * DEPTH + 0.4));
      this.ux = u; this.uy = u * ASPECT; this.dz = u * DEPTH;
      this.fw = 2 * u; this.fh = 2 * this.uy;
      var bw = spanX * u + layers * this.dz, bh = spanY * this.uy + layers * this.dz;
      this.ox = (rect.width - bw) / 2; this.oy = (rect.height - bh) / 2;
      this.sprites.clear();
    }
    this.dirty = true;
  };

  TileBoard.prototype.rect = function (i) {
    var L = this.lay;
    return {
      x: this.ox + this.dz + (L.x[i] - L.minX) * this.ux + L.z[i] * this.dz,
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
      if (px >= r.x - this.dz && px <= r.x + r.w && py >= r.y && py <= r.y + r.h + this.dz) return i;
    }
    return -1;
  };

  TileBoard.prototype.isFree = function (i) { return global.Mahjong.isFree(this.lay, this.present, i); };

  TileBoard.prototype.sprite = function (kind) {
    if (this.sprites.has(kind)) return this.sprites.get(kind);
    var pad = this.fw * 0.1, w = this.fw - pad * 2, h = this.fh - pad * 2, dpr = this.dpr;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    var g = c.getContext('2d'); g.scale(dpr, dpr);
    T.drawFace(g, kind, w, h, this.theme.pal);
    var s = { c: c, pad: pad, w: w, h: h };
    this.sprites.set(kind, s);
    return s;
  };

  /** o: { state: ''|'blocked'|'selected'|'hover', lift, scaleX, alpha, glow } */
  TileBoard.prototype.drawTile = function (g, r, kind, o) {
    o = o || {};
    var th = this.theme, lift = o.lift || 0, d = this.dz + lift, rad = r.w * 0.13;
    var x = r.x + lift * 0.5, y = r.y - lift;
    g.save();
    if (o.alpha != null) g.globalAlpha = o.alpha;
    if (o.scaleX != null && o.scaleX !== 1) { var cx = x + r.w / 2; g.translate(cx, 0); g.scale(Math.max(0.02, o.scaleX), 1); g.translate(-cx, 0); }
    // Back and body: two layers of thickness under the face, like a real bone-and-bamboo tile.
    g.save();
    g.shadowColor = o.glow || 'rgba(0,0,0,0.45)'; g.shadowBlur = o.glow ? this.fw * 0.5 : d * 1.8;
    g.shadowOffsetX = o.glow ? 0 : -d * 0.4; g.shadowOffsetY = o.glow ? 0 : d * 0.7;
    rr(g, x - d, y + d, r.w, r.h, rad);
    var back = g.createLinearGradient(x - d, y + d, x - d + r.w, y + d + r.h);
    back.addColorStop(0, th.back[0]); back.addColorStop(1, th.back[1]);
    g.fillStyle = back; g.fill();
    g.restore();
    rr(g, x - d * 0.5, y + d * 0.5, r.w, r.h, rad); g.fillStyle = th.body; g.fill();
    rr(g, x, y, r.w, r.h, rad);
    var face = g.createLinearGradient(x, y, x + r.w, y + r.h);
    face.addColorStop(0, th.face[0]); face.addColorStop(1, th.face[1]);
    g.fillStyle = face; g.fill();
    g.strokeStyle = th.edge; g.lineWidth = 1; g.stroke();
    var s = this.sprite(kind);
    g.drawImage(s.c, x + s.pad, y + s.pad, s.w, s.h);
    // Gloss across the top of the face.
    rr(g, x + r.w * 0.06, y + r.h * 0.04, r.w * 0.88, r.h * 0.4, rad * 0.8);
    var gloss = g.createLinearGradient(0, y, 0, y + r.h * 0.44);
    gloss.addColorStop(0, 'rgba(255,255,255,0.42)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gloss; g.fill();
    if (o.state === 'blocked') { rr(g, x, y, r.w, r.h, rad); g.fillStyle = th.pal === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(20,30,40,0.36)'; g.fill(); }
    if (o.state === 'selected' || o.state === 'hover') {
      rr(g, x, y, r.w, r.h, rad);
      if (o.state === 'selected') { g.fillStyle = hexA(this.accent, 0.22); g.fill(); }
      g.strokeStyle = o.state === 'selected' ? this.accent : hexA(this.accent, 0.7);
      g.lineWidth = Math.max(2, r.w * (o.state === 'selected' ? 0.07 : 0.045)); g.stroke();
    }
    g.restore();
  };

  function hexA(h, a) {
    var v = parseInt(h.slice(1), 16);
    return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')';
  }

  TileBoard.prototype.computeFree = function () {
    var L = this.lay, f = new Uint8Array(L.n);
    for (var i = 0; i < L.n; i++) f[i] = this.present[i] && this.isFree(i) ? 1 : 0;
    return f;
  };

  TileBoard.prototype.drawAll = function (g, now, skip) {
    var L = this.lay, free = this.showFree ? this.computeFree() : null, e = this.entry, f = this.flip;
    for (var k = 0; k < L.order.length; k++) {
      var i = L.order[k];
      if (!this.present[i] || (skip && skip[i])) continue;
      var r = this.rect(i), o = { state: free && !free[i] ? 'blocked' : '' }, kind = this.kinds[i];
      if (e) {
        var t = clamp01((now - e.t0 - e.delays[i]) / 420);
        if (t <= 0) continue;
        var eb = easeOutBack(t);
        r = { x: r.x, y: r.y - (1 - eb) * this.fh * 0.9, w: r.w, h: r.h };
        o.alpha = Math.min(1, t * 2.5);
      }
      if (f) {
        var ft = clamp01((now - f.t0 - k * 4) / 480);
        o.scaleX = Math.abs(Math.cos(Math.PI * ft));
        if (ft < 0.5) kind = f.old[i];
      }
      this.drawTile(g, r, kind, o);
    }
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

  /** Animate a matched pair flying together and bursting. Call after clearing present[]. */
  TileBoard.prototype.matched = function (a, b, color) {
    this.fx.push({ a: a, b: b, ka: this.kinds[a], kb: this.kinds[b], ra: this.rect(a), rb: this.rect(b), t0: performance.now(), color: color || this.accent });
    if (this.hover === a || this.hover === b) this.hover = -1;
    this.hint = []; this.partners = []; this.dirty = true;
  };

  TileBoard.prototype.burst = function (x, y, color, now) {
    this.rings.push({ x: x, y: y, t0: now, color: color });
    if (reducedMotion) return;
    for (var p = 0; p < 30; p++) {
      var ang = Math.random() * 6.283, sp = (0.08 + Math.random() * 0.22) * this.fw / 12;
      this.particles.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.04, t0: now, life: 500 + Math.random() * 500,
        color: p % 3 === 0 ? color : BURST[p % BURST.length], star: p % 5 === 0, rot: Math.random() * 6.283, size: this.fw * (0.05 + Math.random() * 0.05)
      });
    }
  };

  function star(g, x, y, r, rot) {
    g.beginPath();
    for (var k = 0; k < 10; k++) {
      var a = rot + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath(); g.fill();
  }

  TileBoard.prototype.frame = function (now) {
    var g = this.g;
    if (this.entry && now > this.entry.end) { this.entry = null; this.dirty = true; }
    if (this.flip && now > this.flip.t0 + 480 + this.lay.n * 4) { this.flip = null; this.dirty = true; }
    var animating = this.entry || this.flip;
    if (!animating && this.dirty) this.renderStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (!this.lay) return;
    if (animating) { g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.drawAll(g, now, null); }
    else g.drawImage(this.stat, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var rad = this.fw * 0.13, k, r, pulse = 0.5 + 0.5 * Math.sin(now / 150);

    if (!animating) {
      // Matching partners of the selected tile (assist on early levels).
      for (k = 0; k < this.partners.length; k++) {
        var pi = this.partners[k];
        if (!this.present[pi] || pi === this.hover) continue;
        r = this.rect(pi);
        rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
        g.strokeStyle = hexA(this.accent, 0.35 + pulse * 0.45); g.lineWidth = 2.5; g.stroke();
      }
      if (this.hover >= 0 && this.present[this.hover]) {
        this.drawTile(g, this.rect(this.hover), this.kinds[this.hover], { state: 'hover', lift: this.dz * 0.6 });
      }
      if (this.sel >= 0 && this.present[this.sel]) {
        var bob = reducedMotion ? 0 : Math.sin(now / 220) * this.dz * 0.25;
        this.drawTile(g, this.rect(this.sel), this.kinds[this.sel], { state: 'selected', lift: this.dz * 1.1 + bob, glow: hexA(this.accent, 0.8) });
      }
    }

    if (this.hint.length && now < this.hintUntil) {
      for (k = 0; k < this.hint.length; k++) {
        if (!this.present[this.hint[k]]) continue;
        r = this.rect(this.hint[k]);
        rr(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, rad + 3);
        g.save(); g.shadowColor = '#fff1a8'; g.shadowBlur = 16;
        g.strokeStyle = 'rgba(255,241,168,' + (0.5 + pulse * 0.5) + ')'; g.lineWidth = 3.5; g.stroke();
        g.restore();
      }
    }
    for (k = this.flash.length - 1; k >= 0; k--) {
      var fl = this.flash[k], q = (now - fl.t0) / 380;
      if (q >= 1 || !this.present[fl.i]) { this.flash.splice(k, 1); continue; }
      r = this.rect(fl.i);
      var jx = reducedMotion ? 0 : Math.sin(q * 32) * (1 - q) * 5;
      rr(g, r.x + jx, r.y, r.w, r.h, rad);
      g.fillStyle = 'rgba(255,70,70,' + 0.25 * (1 - q) + ')'; g.fill();
      g.strokeStyle = 'rgba(255,80,70,' + (1 - q) + ')'; g.lineWidth = 3; g.stroke();
    }
    // Matched pairs glide to their midpoint, then burst.
    for (k = this.fx.length - 1; k >= 0; k--) {
      var e = this.fx[k], t = clamp01((now - e.t0) / (reducedMotion ? 60 : 260));
      var mx = (e.ra.x + e.rb.x) / 2, my = (e.ra.y + e.rb.y) / 2 - this.fh * 0.25;
      if (t >= 1) { this.fx.splice(k, 1); this.burst(mx + this.fw / 2, my + this.fh / 2, e.color, now); continue; }
      var p = easeIn(t), sc = 1 + 0.15 * Math.sin(t * Math.PI);
      [[e.ra, e.ka], [e.rb, e.kb]].forEach(function (pair) {
        var ra = pair[0], w = ra.w * sc, h = ra.h * sc;
        var x = ra.x + (mx - ra.x) * p - (w - ra.w) / 2, y = ra.y + (my - ra.y) * p - (h - ra.h) / 2;
        this.drawTile(g, { x: x, y: y, w: w, h: h }, pair[1], { state: 'selected', lift: this.dz, glow: hexA(e.color, 0.9) });
      }, this);
    }
    for (k = this.rings.length - 1; k >= 0; k--) {
      var rg = this.rings[k], rq = (now - rg.t0) / 500;
      if (rq >= 1) { this.rings.splice(k, 1); continue; }
      g.strokeStyle = hexA(rg.color, 0.9 * (1 - rq)); g.lineWidth = 4 * (1 - rq) + 1;
      g.beginPath(); g.arc(rg.x, rg.y, this.fw * (0.3 + rq * 1.4), 0, 6.283); g.stroke();
    }
    for (k = this.particles.length - 1; k >= 0; k--) {
      var pt = this.particles[k], age = now - pt.t0;
      if (age > pt.life) { this.particles.splice(k, 1); continue; }
      var a = 1 - age / pt.life, px = pt.x + pt.vx * age, py = pt.y + pt.vy * age + 0.00025 * age * age;
      g.globalAlpha = a; g.fillStyle = pt.color;
      if (pt.star) star(g, px, py, pt.size * 1.6, pt.rot + age / 200);
      else { g.beginPath(); g.arc(px, py, pt.size * (0.5 + a * 0.5), 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
    }
  };

  TileBoard.prototype.busy = function () { return !!(this.entry || this.flip); };

  global.TileBoard = TileBoard;
})(this);
