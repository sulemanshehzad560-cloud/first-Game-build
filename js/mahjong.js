/*
 * Jade Rush — Mahjong solitaire engine (no DOM). Browser: window.Mahjong; Node: module.exports.
 *
 * Coordinates are in half-tile units: a tile at (x, y, z) covers x..x+2 and y..y+2
 * on layer z. A tile is free when nothing lies on top of it and its left or
 * right side is open. Two free tiles of the same kind can be matched.
 *
 * Every board is dealt by simulating a full game, so each one has at least one
 * solution. Choosing the wrong copy of a kind can still trap you.
 */
(function (global) {
  'use strict';

  var KINDS = 34; // 0-8 dots, 9-17 bamboo, 18-26 characters, 27-30 winds, 31-33 dragons

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash() {
    var h = 2166136261;
    for (var a = 0; a < arguments.length; a++) {
      var s = String(arguments[a]);
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 0x9e37; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  // ------------------------------------------------------------------ layout
  function Layout(list) {
    var n = list.length, i, j;
    this.n = n;
    this.x = list.map(function (t) { return t.x; });
    this.y = list.map(function (t) { return t.y; });
    this.z = list.map(function (t) { return t.z; });
    this.above = []; this.left = []; this.right = [];
    for (i = 0; i < n; i++) { this.above.push([]); this.left.push([]); this.right.push([]); }
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (i === j) continue;
        var dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && this.z[j] > this.z[i]) this.above[i].push(j);
        else if (this.z[j] === this.z[i] && Math.abs(dy) < 2) {
          if (dx === -2) this.left[i].push(j); else if (dx === 2) this.right[i].push(j);
        }
      }
    }
    this.minX = Math.min.apply(null, this.x); this.maxX = Math.max.apply(null, this.x) + 2;
    this.minY = Math.min.apply(null, this.y); this.maxY = Math.max.apply(null, this.y) + 2;
    this.maxZ = Math.max.apply(null, this.z);
    var self = this;
    this.order = this.x.map(function (_, k) { return k; }).sort(function (a, b) {
      return self.z[a] - self.z[b] || self.y[a] - self.y[b] || self.x[a] - self.x[b];
    });
  }

  function isFree(lay, present, i) {
    var a = lay.above[i], k;
    for (k = 0; k < a.length; k++) if (present[a[k]]) return false;
    var l = lay.left[i], blockedLeft = false;
    for (k = 0; k < l.length; k++) if (present[l[k]]) { blockedLeft = true; break; }
    if (!blockedLeft) return true;
    var r = lay.right[i];
    for (k = 0; k < r.length; k++) if (present[r[k]]) return false;
    return true;
  }

  function freeTiles(lay, present) {
    var res = [];
    for (var i = 0; i < lay.n; i++) if (present[i] && isFree(lay, present, i)) res.push(i);
    return res;
  }

  /** All currently playable pairs [a, b]. */
  function freePairs(lay, present, kinds) {
    var free = freeTiles(lay, present), by = {}, res = [];
    free.forEach(function (i) { (by[kinds[i]] = by[kinds[i]] || []).push(i); });
    Object.keys(by).forEach(function (k) {
      var g = by[k];
      for (var a = 0; a < g.length; a++) for (var b = a + 1; b < g.length; b++) res.push([g[a], g[b]]);
    });
    return res;
  }

  /** Simulate a full clear of the present tiles: returns the pair order or null. */
  function deal(lay, present, rand) {
    var p = present.slice(), left = 0, pairs = [], i;
    for (i = 0; i < lay.n; i++) left += p[i] ? 1 : 0;
    while (left > 0) {
      var free = freeTiles(lay, p);
      if (free.length < 2) return null;
      var ai = Math.floor(rand() * free.length), bi = Math.floor(rand() * (free.length - 1));
      if (bi >= ai) bi++;
      var a = free[ai], b = free[bi];
      pairs.push([a, b]); p[a] = 0; p[b] = 0; left -= 2;
    }
    return pairs;
  }

  // --------------------------------------------------------------- generator
  var SHAPES = [
    function () { return true; },
    function (nx, ny) { return Math.abs(nx) + Math.abs(ny) * 0.75 <= 1.2; },          // diamond
    function (nx, ny) { return Math.abs(nx) <= 0.4 + 0.7 * Math.abs(ny); },           // hourglass
    function (nx, ny) { return Math.abs(nx) <= 0.45 || Math.abs(ny) <= 0.4; },        // cross
    function (nx, ny) { return Math.max(Math.abs(nx), Math.abs(ny)) >= 0.3; },        // ring
    function (nx, ny) { return Math.abs(nx) >= 0.2 || Math.abs(ny) <= 0.7; },         // arch
    function (nx, ny) { return ny <= 0.2 + (1 - Math.abs(nx)) * 1.2; }                // pagoda
  ];

  function buildShape(spec, rand) {
    var C = spec.cols, R = spec.rows, M = 2 * (C - 1);
    var shape = SHAPES[Math.floor(rand() * SHAPES.length)];
    var tiles = [], keys = new Set();
    function add(x, y, z, into) {
      var k = x + ',' + y + ',' + z;
      if (keys.has(k)) return;
      keys.add(k); var t = { x: x, y: y, z: z }; tiles.push(t); if (into) into.push(t);
    }
    var base = [];
    for (var r = 0; r < R; r++) {
      for (var c = 0; c <= Math.floor((C - 1) / 2); c++) {
        var nx = C > 1 ? (c / (C - 1)) * 2 - 1 : 0, ny = R > 1 ? (r / (R - 1)) * 2 - 1 : 0;
        if (!shape(nx, ny) || rand() < spec.carve) continue;
        add(2 * c, 2 * r, 0, base); add(M - 2 * c, 2 * r, 0, base);
      }
    }
    var current = base;
    for (var z = 1; z < spec.layers && current.length; z++) {
      var S = new Set(current.map(function (t) { return t.x + ',' + t.y; }));
      var has = function (x, y) { return S.has(x + ',' + y); };
      var next = [], offset = z >= 2 && rand() < 0.45;
      current.forEach(function (t) {
        if (offset) {
          var ox = t.x + 1;
          if (ox > M / 2 || !has(t.x + 2, t.y) || !has(t.x, t.y + 2) || !has(t.x + 2, t.y + 2) || rand() > 0.85) return;
          add(ox, t.y + 1, z, next); add(M - ox, t.y + 1, z, next);
        } else {
          if (t.x > M / 2) return;
          var support = (has(t.x - 2, t.y) ? 1 : 0) + (has(t.x + 2, t.y) ? 1 : 0) + (has(t.x, t.y - 2) ? 1 : 0) + (has(t.x, t.y + 2) ? 1 : 0);
          if (support < 3 || rand() > spec.stack) return;
          add(t.x, t.y, z, next); add(M - t.x, t.y, z, next);
        }
      });
      current = next;
    }
    if (tiles.length % 2) {
      var top = Math.max.apply(null, tiles.map(function (t) { return t.z; }));
      var cands = tiles.filter(function (t) { return t.z === top; });
      var mid = cands.filter(function (t) { return t.x === M - t.x; });
      var drop = (mid.length ? mid : cands)[0];
      tiles.splice(tiles.indexOf(drop), 1);
    }
    return tiles.length >= 16 ? tiles : null;
  }

  var MAX_LEVEL = 5000;

  // Boards reach full size (144 tiles) by level 30. After that the long tail tightens slowly all the way
  // to level 5000: the clock goes from 1.5 s to 1.15 s per tile, piles get taller, and hints run out.
  function levelSpec(L) {
    var tail = L <= 42 ? 0 : Math.log(L / 42) / Math.log(MAX_LEVEL / 42);   // 0 at level 42, 1 at 5000
    return {
      cols: Math.min(8, 4 + Math.floor((L + 1) / 3)),
      rows: Math.min(9, 4 + Math.floor(L / 2.5)),
      layers: Math.min(5, 2 + Math.floor(L / 5)),
      target: Math.min(144, 24 + L * 4),
      carve: 0.08,
      stack: L < 6 ? 0.6 : Math.min(0.95, 0.85 + tail * 0.1),
      secPerTile: L <= 42 ? Math.max(1.5, 3.6 - L * 0.05) : +(1.5 - tail * 0.35).toFixed(3),
      shuffles: L < 8 ? 3 : L < 20 ? 2 : 1,
      hints: L < 8 ? 3 : L < 20 ? 2 : L < 2500 ? 1 : 0,
      showFree: L <= 12
    };
  }

  function generate(spec, seed) {
    var best = null, bestDiff = Infinity;
    for (var attempt = 0; attempt < 60; attempt++) {
      var rand = mulberry32(hash(seed, attempt));
      var list = buildShape(spec, rand);
      if (!list) continue;
      var diff = spec.target ? Math.abs(list.length - spec.target) / spec.target : 0;
      if (diff > 0.15 && attempt < 59) {
        if (diff < bestDiff && list.length) { bestDiff = diff; best = attempt; }
        continue;
      }
      var res = dealBoard(spec, list, rand);
      if (res) return res;
    }
    if (best !== null) {
      var r2 = mulberry32(hash(seed, best));
      var res2 = dealBoard(spec, buildShape(spec, r2), r2);
      if (res2) return res2;
    }
    throw new Error('could not generate board for ' + seed);
  }

  function dealBoard(spec, list, rand) {
    var lay = new Layout(list), present = new Uint8Array(lay.n).fill(1), pairs = null;
    for (var d = 0; d < 6 && !pairs; d++) pairs = deal(lay, present, rand);
    if (!pairs) return null;
    var kindCount = Math.min(KINDS, Math.ceil(pairs.length / 2));
    var pool = shuffle(Array.from({ length: KINDS }, function (_, k) { return k; }), rand).slice(0, kindCount);
    var pairKinds = pairs.map(function (_, k) { return pool[Math.floor(k / 2) % kindCount]; });
    shuffle(pairKinds, rand);
    var kinds = new Int8Array(lay.n);
    pairs.forEach(function (pr, k) { kinds[pr[0]] = pairKinds[k]; kinds[pr[1]] = pairKinds[k]; });
    return { layout: lay, kinds: kinds, solution: pairs, spec: spec };
  }

  var cache = new Map();
  function generateLevel(L) {
    if (!cache.has(L)) cache.set(L, generate(levelSpec(L), 'jade-level-' + L));
    return cache.get(L);
  }
  function generateDaily(dateStr) {
    var r = mulberry32(hash('jade-daily', dateStr));
    return generate(levelSpec(22 + Math.floor(r() * 20)), 'jade-daily-' + dateStr);
  }
  function generateDuel(seed, size) {
    var L = size === 'big' ? 26 : 12;
    var spec = levelSpec(L);
    return generate(spec, 'jade-duel-' + seed);
  }

  /** Re-deal the remaining tiles so the board is solvable again. Returns new kinds or null. */
  function reshuffle(lay, present, kinds, rand) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var pairs = deal(lay, present, rand);
      if (!pairs) continue;
      var counts = {}, pairKinds = [];
      for (var i = 0; i < lay.n; i++) if (present[i]) counts[kinds[i]] = (counts[kinds[i]] || 0) + 1;
      Object.keys(counts).forEach(function (k) { for (var c = 0; c < counts[k] / 2; c++) pairKinds.push(Number(k)); });
      shuffle(pairKinds, rand);
      var next = kinds.slice();
      pairs.forEach(function (pr, k) { next[pr[0]] = pairKinds[k]; next[pr[1]] = pairKinds[k]; });
      return next;
    }
    return null;
  }

  // --------------------------------------------------------------- duel AI
  function points(kind) { return kind >= 27 ? 2 : 1; } // winds and dragons score double in duels

  function aiPick(lay, present, kinds, level, rand) {
    rand = rand || Math.random;
    var pairs = freePairs(lay, present, kinds);
    if (!pairs.length) return null;
    if (level === 0) return pairs[Math.floor(rand() * pairs.length)];
    var best = -Infinity, pick = pairs[0];
    pairs.forEach(function (pr) {
      var s = points(kinds[pr[0]]) + rand() * 0.1;
      if (level >= 2) {
        var p = present.slice(); p[pr[0]] = 0; p[pr[1]] = 0;
        var replies = freePairs(lay, p, kinds), opp = 0;
        replies.forEach(function (q) { opp = Math.max(opp, points(kinds[q[0]])); });
        s -= 0.9 * opp;
        if (!replies.length) s -= 0.5;
      }
      if (s > best) { best = s; pick = pr; }
    });
    return pick;
  }

  var api = {
    KINDS: KINDS, Layout: Layout, isFree: isFree, freeTiles: freeTiles, freePairs: freePairs,
    deal: deal, levelSpec: levelSpec, MAX_LEVEL: MAX_LEVEL, generate: generate, generateLevel: generateLevel,
    generateDaily: generateDaily, generateDuel: generateDuel, reshuffle: reshuffle,
    points: points, aiPick: aiPick, mulberry32: mulberry32, hash: hash
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Mahjong = api;
})(this);
