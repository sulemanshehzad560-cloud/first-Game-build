/* Canvas board renderer: tiles, orbs, wave-by-wave burst animation, particles. */
(function (global) {
  'use strict';

  var ORB = { puzzle: '#ffb547', 0: '#3ee6d3', 1: '#ff5d8f' };
  var spriteCache = new Map();
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function snap(b) { return { n: b.n.slice(), o: b.o.slice(), lit: b.lit.slice() }; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function orbSprite(color, r) {
    var key = color + '|' + r;
    if (spriteCache.has(key)) return spriteCache.get(key);
    var size = Math.ceil(r * 4), c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d'), m = size / 2;
    var glow = g.createRadialGradient(m, m, r * 0.6, m, m, r * 2);
    glow.addColorStop(0, hexA(color, 0.45)); glow.addColorStop(1, hexA(color, 0));
    g.fillStyle = glow; g.fillRect(0, 0, size, size);
    var body = g.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.1, m, m, r);
    body.addColorStop(0, '#ffffff'); body.addColorStop(0.25, mix(color, '#ffffff', 0.45));
    body.addColorStop(0.75, color); body.addColorStop(1, mix(color, '#000000', 0.35));
    g.fillStyle = body; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    spriteCache.set(key, c);
    return c;
  }

  function hexToRgb(h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
  function hexA(h, a) { var c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  var LAYOUTS = [
    [], [[0, 0]], [[-1, 0], [1, 0]], [[0, -1], [-0.87, 0.5], [0.87, 0.5]], [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  ];

  function BoardView(canvas, opts) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.opts = opts || {};
    this.mode = 'puzzle'; this.turn = 0;
    this.view = null; this.topo = null; this.anim = null;
    this.particles = []; this.litAt = null; this.ripples = [];
    this.hint = -1; this.shake = 0; this.cs = 0; this.ox = 0; this.oy = 0;
  }

  BoardView.prototype.setBoard = function (board, mode) {
    this.topo = board.t; this.mode = mode; this.view = snap(board);
    this.litAt = new Float64Array(board.t.size);
    this.anim = null; this.particles.length = 0; this.ripples.length = 0; this.hint = -1;
    this.layout();
  };

  BoardView.prototype.sync = function (board) { this.view = snap(board); };

  BoardView.prototype.layout = function () {
    var rect = this.c.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    this.dpr = dpr; this.W = rect.width; this.H = rect.height;
    this.c.width = Math.round(rect.width * dpr); this.c.height = Math.round(rect.height * dpr);
    if (!this.topo) return;
    this.cs = Math.floor(Math.min(rect.width / this.topo.w, rect.height / this.topo.h));
    this.ox = (rect.width - this.cs * this.topo.w) / 2;
    this.oy = (rect.height - this.cs * this.topo.h) / 2;
  };

  BoardView.prototype.cellAt = function (clientX, clientY) {
    if (!this.topo) return -1;
    var r = this.c.getBoundingClientRect();
    var x = Math.floor((clientX - r.left - this.ox) / this.cs), y = Math.floor((clientY - r.top - this.oy) / this.cs);
    if (x < 0 || y < 0 || x >= this.topo.w || y >= this.topo.h) return -1;
    var i = y * this.topo.w + x;
    return this.topo.wall[i] ? -1 : i;
  };

  BoardView.prototype.center = function (i) {
    var w = this.topo.w;
    return [this.ox + (i % w + 0.5) * this.cs, this.oy + (Math.floor(i / w) + 0.5) * this.cs];
  };

  BoardView.prototype.orbColor = function (owner) { return this.mode === 'puzzle' ? ORB.puzzle : ORB[owner < 0 ? 0 : owner]; };

  /**
   * Animate a move. frames: [{ex, snap}] recorded during resolve; start: snapshot
   * right after the orb was placed. Resolves when the chain has played out.
   */
  BoardView.prototype.play = function (cell, player, start, frames, hooks) {
    var self = this;
    hooks = hooks || {};
    return new Promise(function (done) {
      self.view = start;
      var c = self.center(cell);
      self.ripples.push({ x: c[0], y: c[1], t0: performance.now(), color: self.orbColor(player) });
      if (!frames.length) { setTimeout(done, 90); return; }
      self.anim = { player: player, start: start, frames: frames, k: -1, t0: performance.now() + 90, dur: 0, done: done, hooks: hooks };
      self.nextWave(performance.now() + 90);
    });
  };

  BoardView.prototype.nextWave = function (now) {
    var a = this.anim, crit = this.topo.crit, nb = this.topo.nb;
    a.k++;
    if (a.k >= a.frames.length) { this.view = a.frames[a.frames.length - 1].snap; this.anim = null; a.done(); return; }
    var base = a.k === 0 ? a.start : a.frames[a.k - 1].snap, cur = { n: base.n.slice(), o: base.o.slice(), lit: base.lit };
    var ex = a.frames[a.k].ex, flyers = [];
    for (var e = 0; e < ex.length; e++) {
      var i = ex[e];
      cur.n[i] = Math.max(0, cur.n[i] - crit[i]); if (!cur.n[i]) cur.o[i] = -1;
      for (var j = 0; j < nb[i].length; j++) flyers.push([i, nb[i][j]]);
    }
    a.cur = cur; a.flyers = flyers; a.t0 = now;
    a.dur = reducedMotion ? 30 : a.k > 40 ? 28 : Math.max(60, 200 * Math.pow(0.9, a.k));
  };

  BoardView.prototype.finishWave = function (now) {
    var a = this.anim, f = a.frames[a.k], color = this.orbColor(a.player);
    this.view = f.snap;
    for (var e = 0; e < f.ex.length; e++) {
      var i = f.ex[e], c = this.center(i);
      if (!this.litAt[i] || this.mode !== 'puzzle') this.litAt[i] = now;
      if (this.particles.length < 500 && !reducedMotion) {
        for (var p = 0; p < 7; p++) {
          var ang = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.6) * this.cs / 900;
          this.particles.push({ x: c[0], y: c[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: now, life: 380 + Math.random() * 380, color: color });
        }
      }
    }
    this.shake = Math.min(10, this.shake + f.ex.length * 0.7);
    if (a.hooks.onWave) a.hooks.onWave(a.k, f.ex.length);
    this.nextWave(now);
  };

  BoardView.prototype.frame = function (now) {
    var g = this.g, dpr = this.dpr;
    if (!this.topo || !this.view) { g.clearRect(0, 0, this.c.width, this.c.height); return; }
    if (this.anim && now >= this.anim.t0 + this.anim.dur && this.anim.k >= 0) this.finishWave(now);
    var view = this.anim && this.anim.cur ? this.anim.cur : this.view;
    var t = this.topo, cs = this.cs, w = t.w;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.shake > 0.1 && !reducedMotion) {
      g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.86;
    }

    var pad = Math.max(2, cs * 0.06), rad = cs * 0.2;
    var tint = this.mode === 'puzzle' ? '#ffb547' : ORB[this.turn];
    for (var i = 0; i < t.size; i++) {
      var x = this.ox + (i % w) * cs, y = this.oy + Math.floor(i / w) * cs;
      if (t.wall[i]) {
        g.fillStyle = 'rgba(157,151,204,0.10)';
        g.beginPath(); g.arc(x + cs / 2, y + cs / 2, cs * 0.05, 0, Math.PI * 2); g.fill();
        continue;
      }
      roundRect(g, x + pad, y + pad, cs - pad * 2, cs - pad * 2, rad);
      var flash = this.litAt[i] ? Math.max(0, 1 - (now - this.litAt[i]) / 600) : 0;
      if (this.mode === 'puzzle') {
        if (view.lit[i]) {
          g.fillStyle = hexA('#ffb547', 0.13 + flash * 0.4); g.fill();
          g.strokeStyle = hexA('#ffb547', 0.45 + flash * 0.5);
        } else {
          g.fillStyle = 'rgba(255,255,255,0.035)'; g.fill();
          g.strokeStyle = 'rgba(157,151,204,0.22)';
        }
      } else {
        g.fillStyle = flash ? hexA(this.orbColor(view.o[i]), flash * 0.3) : 'rgba(255,255,255,0.03)'; g.fill();
        g.strokeStyle = hexA(tint, 0.32);
      }
      g.lineWidth = 1.2; g.stroke();

      if (cs >= 34) { // capacity pips: how many orbs this cell holds before it bursts
        var pr = Math.max(1.4, cs * 0.028), gap = pr * 3.2, n = view.n[i], cap = t.crit[i];
        var px = x + cs / 2 - (cap - 1) * gap / 2, py = y + cs - pad - pr * 3;
        for (var k = 0; k < cap; k++) {
          g.fillStyle = k < n ? hexA(this.orbColor(view.o[i]), 0.85) : 'rgba(157,151,204,0.28)';
          g.beginPath(); g.arc(px + k * gap, py, pr, 0, Math.PI * 2); g.fill();
        }
      }
      if (i === this.hint) {
        var pulse = 0.5 + 0.5 * Math.sin(now / 160);
        roundRect(g, x + pad - 2, y + pad - 2, cs - pad * 2 + 4, cs - pad * 2 + 4, rad + 2);
        g.strokeStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.6) + ')'; g.lineWidth = 2.5; g.stroke();
      }
    }

    // Orbs
    var r = Math.max(4, cs * 0.155), spr, s;
    for (i = 0; i < t.size; i++) {
      var cnt = view.n[i];
      if (!cnt) continue;
      var c = this.center(i), loaded = cnt >= t.crit[i] - 1;
      spr = orbSprite(this.orbColor(view.o[i]), Math.round(r)); s = spr.width;
      var ang = reducedMotion ? 0 : now / (loaded ? 260 : 1400) + i;
      var lay = LAYOUTS[Math.min(cnt, 4)], d = cnt === 1 ? 0 : r * (cnt === 2 ? 0.8 : 0.95);
      var jx = loaded && !reducedMotion ? Math.sin(now / 35 + i * 7) * cs * 0.012 : 0;
      for (k = 0; k < lay.length; k++) {
        var lx = lay[k][0], ly = lay[k][1];
        var ox = (lx * Math.cos(ang) - ly * Math.sin(ang)) * d, oy = (lx * Math.sin(ang) + ly * Math.cos(ang)) * d;
        g.drawImage(spr, c[0] + ox + jx - s / 2, c[1] + oy - s / 2);
      }
    }

    // Flying orbs for the wave in progress
    if (this.anim && this.anim.cur) {
      var a = this.anim, p = easeOut(Math.min(1, (now - a.t0) / a.dur));
      spr = orbSprite(this.orbColor(a.player), Math.round(r)); s = spr.width;
      for (k = 0; k < a.flyers.length; k++) {
        var from = this.center(a.flyers[k][0]), to = this.center(a.flyers[k][1]);
        g.drawImage(spr, from[0] + (to[0] - from[0]) * p - s / 2, from[1] + (to[1] - from[1]) * p - s / 2);
      }
    }

    // Ripples and particles
    for (k = this.ripples.length - 1; k >= 0; k--) {
      var rp = this.ripples[k], q = (now - rp.t0) / 400;
      if (q >= 1) { this.ripples.splice(k, 1); continue; }
      g.strokeStyle = hexA(rp.color, 0.6 * (1 - q)); g.lineWidth = 2;
      g.beginPath(); g.arc(rp.x, rp.y, cs * (0.2 + q * 0.5), 0, Math.PI * 2); g.stroke();
    }
    for (k = this.particles.length - 1; k >= 0; k--) {
      var pt = this.particles[k], age = now - pt.t0;
      if (age > pt.life) { this.particles.splice(k, 1); continue; }
      var fade = 1 - age / pt.life;
      g.fillStyle = hexA(pt.color, fade);
      g.beginPath(); g.arc(pt.x + pt.vx * age, pt.y + pt.vy * age, Math.max(0.5, cs * 0.03 * fade), 0, Math.PI * 2); g.fill();
    }
  };

  global.NovaRender = { BoardView: BoardView, snap: snap, ORB: ORB };
})(this);
