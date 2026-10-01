/* Canvas renderer for a layered Mahjong board: 3D tiles, selection, hints, match effects. */
(function (global) {
  'use strict';
  var T = global.MahjongTiles;
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEPTH = 0.26; // tile thickness as a fraction of half-tile width
  var ASPECT = 1.3; // tile height / width

  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function TileBoard(canvas, opts) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.opts = opts || {};
    this.stat = document.createElement('canvas'); this.sg = this.stat.getContext('2d');
    this.lay = null; this.kinds = null; this.present = null;
    this.sel = -1; this.hint = []; this.hintUntil = 0; this.showFree = false;
    this.flash = []; this.fx = []; this.particles = []; this.sprites = new Map();
    this.dirty = true; this.accent = '#e8b64c';
  }

  TileBoard.prototype.set = function (lay, kinds, present, showFree) {
    this.lay = lay; this.kinds = kinds; this.present = present; this.showFree = !!showFree;
    this.sel = -1; this.hint = []; this.flash = []; this.fx = []; this.particles = [];
    this.resize();
  };

  TileBoard.prototype.resize = function () {
    var rect = this.c.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    this.dpr = dpr; this.W = rect.width; this.H = rect.height;
    this.c.width = this.stat.width = Math.max(1, Math.round(rect.width * dpr));
    this.c.height = this.stat.height = Math.max(1, Math.round(rect.height * dpr));
    if (this.lay) {
      var L = this.lay, spanX = L.maxX - L.minX, spanY = L.maxY - L.minY, layers = L.maxZ + 1;
      var u = Math.min(rect.width / (spanX + layers * DEPTH + 0.2), rect.height / (spanY * ASPECT + layers * DEPTH + 0.2));
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

  TileBoard.prototype.sprite = function (kind) {
    if (this.sprites.has(kind)) return this.sprites.get(kind);
    var pad = this.fw * 0.1, w = this.fw - pad * 2, h = this.fh - pad * 2, dpr = this.dpr;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    var g = c.getContext('2d'); g.scale(dpr, dpr);
    T.drawFace(g, kind, w, h);
    var s = { c: c, pad: pad, w: w, h: h };
    this.sprites.set(kind, s);
    return s;
  };

  TileBoard.prototype.drawTile = function (g, i, r, kind, state) {
    var dz = this.dz, rad = this.fw * 0.12;
    // Thickness: green back, then ivory body, then the face.
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = dz * 1.6; g.shadowOffsetX = -dz * 0.4; g.shadowOffsetY = dz * 0.6;
    rr(g, r.x - dz, r.y + dz, r.w, r.h, rad); g.fillStyle = '#145a45'; g.fill();
    g.restore();
    rr(g, r.x - dz * 0.55, r.y + dz * 0.55, r.w, r.h, rad); g.fillStyle = '#cfc3a6'; g.fill();
    rr(g, r.x, r.y, r.w, r.h, rad);
    var face = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    face.addColorStop(0, '#fffaf0'); face.addColorStop(1, '#ece2cc');
    g.fillStyle = face; g.fill();
    g.strokeStyle = 'rgba(120,100,60,0.35)'; g.lineWidth = 1; g.stroke();
    var s = this.sprite(kind);
    g.drawImage(s.c, r.x + s.pad, r.y + s.pad, s.w, s.h);
    if (state === 'blocked') { rr(g, r.x, r.y, r.w, r.h, rad); g.fillStyle = 'rgba(14,42,37,0.38)'; g.fill(); }
    if (state === 'selected') {
      rr(g, r.x, r.y, r.w, r.h, rad); g.fillStyle = 'rgba(232,182,76,0.28)'; g.fill();
      g.strokeStyle = this.accent; g.lineWidth = Math.max(2, this.fw * 0.06); g.stroke();
    }
  };

  TileBoard.prototype.renderStatic = function () {
    var g = this.sg, L = this.lay;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (!L) return;
    var free = null;
    if (this.showFree) { free = new Uint8Array(L.n); for (var f = 0; f < L.n; f++) free[f] = this.present[f] && global.Mahjong.isFree(L, this.present, f) ? 1 : 0; }
    for (var k = 0; k < L.order.length; k++) {
      var i = L.order[k];
      if (!this.present[i]) continue;
      var state = i === this.sel ? 'selected' : free && !free[i] ? 'blocked' : '';
      this.drawTile(g, i, this.rect(i), this.kinds[i], state);
    }
    this.dirty = false;
  };

  TileBoard.prototype.invalidate = function () { this.dirty = true; };
  TileBoard.prototype.clearSprites = function () { this.sprites.clear(); this.dirty = true; };

  TileBoard.prototype.showHint = function (pair, ms) { this.hint = pair; this.hintUntil = performance.now() + (ms || 3000); };
  TileBoard.prototype.wrong = function (i) { this.flash.push({ i: i, t0: performance.now() }); };

  /** Animate a matched pair lifting off the board. Call after clearing present[]. */
  TileBoard.prototype.matched = function (a, b, color) {
    var now = performance.now(), self = this;
    [a, b].forEach(function (i) {
      var r = self.rect(i);
      self.fx.push({ i: i, kind: self.kinds[i], r: r, t0: now });
      if (!reducedMotion) for (var p = 0; p < 14; p++) {
        var ang = Math.random() * 6.283, sp = (0.04 + Math.random() * 0.12) * self.fw / 10;
        self.particles.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.02, t0: now, life: 450 + Math.random() * 400, color: color || '#e8b64c' });
      }
    });
    this.hint = []; this.dirty = true;
  };

  TileBoard.prototype.frame = function (now) {
    var g = this.g;
    if (this.dirty) this.renderStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.drawImage(this.stat, 0, 0);
    if (!this.lay) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var rad = this.fw * 0.12, k, r;

    if (this.hint.length && now < this.hintUntil) {
      var pulse = 0.5 + 0.5 * Math.sin(now / 140);
      for (k = 0; k < this.hint.length; k++) {
        if (!this.present[this.hint[k]]) continue;
        r = this.rect(this.hint[k]);
        rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
        g.strokeStyle = 'rgba(255,240,190,' + (0.45 + pulse * 0.55) + ')'; g.lineWidth = 3; g.stroke();
        g.fillStyle = 'rgba(255,230,150,' + pulse * 0.18 + ')'; g.fill();
      }
    }
    for (k = this.flash.length - 1; k >= 0; k--) {
      var fl = this.flash[k], q = (now - fl.t0) / 350;
      if (q >= 1 || !this.present[fl.i]) { this.flash.splice(k, 1); continue; }
      r = this.rect(fl.i);
      var jx = reducedMotion ? 0 : Math.sin(q * 30) * (1 - q) * 4;
      rr(g, r.x + jx, r.y, r.w, r.h, rad);
      g.strokeStyle = 'rgba(226,81,63,' + (1 - q) + ')'; g.lineWidth = 3; g.stroke();
    }
    for (k = this.fx.length - 1; k >= 0; k--) {
      var e = this.fx[k], t = (now - e.t0) / 420;
      if (t >= 1) { this.fx.splice(k, 1); continue; }
      var sc = 1 + t * 0.25, rw = e.r.w * sc, rh = e.r.h * sc;
      g.save(); g.globalAlpha = 1 - t;
      this.drawTile(g, e.i, { x: e.r.x + (e.r.w - rw) / 2, y: e.r.y + (e.r.h - rh) / 2 - t * this.fh * 0.4, w: rw, h: rh }, e.kind, 'selected');
      g.restore();
    }
    for (k = this.particles.length - 1; k >= 0; k--) {
      var p = this.particles[k], age = now - p.t0;
      if (age > p.life) { this.particles.splice(k, 1); continue; }
      var a = 1 - age / p.life;
      g.fillStyle = p.color; g.globalAlpha = a;
      g.beginPath(); g.arc(p.x + p.vx * age, p.y + p.vy * age + 0.00004 * age * age, Math.max(0.6, this.fw * 0.04 * a), 0, 6.283); g.fill();
      g.globalAlpha = 1;
    }
  };

  global.TileBoard = TileBoard;
})(this);
