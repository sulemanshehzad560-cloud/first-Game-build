/*
 * Nova Chain — core game engine (no DOM). Works in the browser (window.NovaEngine)
 * and in Node (module.exports) so it can be tested headlessly.
 *
 * Rules
 *  - Every playable cell has a critical mass equal to its number of playable
 *    orthogonal neighbours (corner 2, edge 3, middle 4; walls reduce it).
 *  - When a cell holds >= critical mass orbs it bursts: it loses that many orbs
 *    and throws one into each neighbour, claiming it for the player who moved.
 *  - Bursts resolve in simultaneous waves until the board is stable.
 */
(function (global) {
  'use strict';

  var MAX_WAVES = 400;

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

  // ---------------------------------------------------------------- topology
  function Topology(w, h, walls) {
    var size = w * h;
    this.w = w; this.h = h; this.size = size;
    this.wall = walls ? Uint8Array.from(walls) : new Uint8Array(size);
    this.nb = new Array(size);
    this.crit = new Uint8Array(size);
    this.cells = [];
    var x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        var list = [];
        if (!this.wall[i]) {
          if (y > 0 && !this.wall[i - w]) list.push(i - w);
          if (x < w - 1 && !this.wall[i + 1]) list.push(i + 1);
          if (y < h - 1 && !this.wall[i + w]) list.push(i + w);
          if (x > 0 && !this.wall[i - 1]) list.push(i - 1);
          if (list.length === 0) this.wall[i] = 1; // isolated cell can never burst
        }
        this.nb[i] = this.wall[i] ? [] : list;
        this.crit[i] = this.wall[i] ? 0 : list.length;
        if (!this.wall[i]) this.cells.push(i);
      }
    }
  }

  // ------------------------------------------------------------------- board
  function Board(topo) {
    this.t = topo;
    this.n = new Uint8Array(topo.size);   // orb counts
    this.o = new Int8Array(topo.size);    // owner (-1 none)
    this.lit = new Uint8Array(topo.size); // has burst at least once (puzzle goal)
    this.o.fill(-1);
  }
  Board.prototype.clone = function () {
    var b = Object.create(Board.prototype);
    b.t = this.t; b.n = this.n.slice(); b.o = this.o.slice(); b.lit = this.lit.slice();
    return b;
  };
  Board.prototype.count = function (p) {
    var c = 0, cells = this.t.cells;
    for (var k = 0; k < cells.length; k++) if (this.o[cells[k]] === p) c += this.n[cells[k]];
    return c;
  };
  Board.prototype.litCount = function () {
    var c = 0, cells = this.t.cells;
    for (var k = 0; k < cells.length; k++) c += this.lit[cells[k]];
    return c;
  };
  Board.prototype.allLit = function () { return this.litCount() === this.t.cells.length; };

  /**
   * Resolve chain reactions after a placement. onWave(explodingIndices) is
   * called after each wave; stop() may end resolution early (game decided).
   * Returns the number of waves.
   */
  function resolve(b, player, onWave, stop) {
    var t = b.t, n = b.n, o = b.o, lit = b.lit, cells = t.cells, crit = t.crit, nb = t.nb;
    var waves = 0, ex = [], k, i, a, j;
    for (;;) {
      ex.length = 0;
      for (k = 0; k < cells.length; k++) { i = cells[k]; if (n[i] >= crit[i]) ex.push(i); }
      if (!ex.length) break;
      for (k = 0; k < ex.length; k++) { i = ex[k]; n[i] -= crit[i]; lit[i] = 1; }
      for (k = 0; k < ex.length; k++) {
        a = nb[ex[k]];
        for (j = 0; j < a.length; j++) { n[a[j]]++; o[a[j]] = player; }
      }
      for (k = 0; k < ex.length; k++) { i = ex[k]; o[i] = n[i] > 0 ? player : -1; }
      waves++;
      if (onWave) onWave(ex.slice());
      if (waves >= MAX_WAVES) break;
      if (stop && stop()) break;
    }
    return waves;
  }

  function place(b, i, player, onWave, stop) {
    b.n[i]++; b.o[i] = player;
    return resolve(b, player, onWave, stop);
  }

  // ------------------------------------------------------------ puzzle mode
  function puzzleTap(b, i, onWave) {
    return place(b, i, 0, onWave, function () { return b.allLit(); });
  }

  function boardKey(b) {
    var s = '', cells = b.t.cells;
    for (var k = 0; k < cells.length; k++) s += String.fromCharCode(48 + b.n[cells[k]] + 8 * b.lit[cells[k]]);
    return s;
  }

  function puzzleScore(b, lc) {
    var s = lc * 12, cells = b.t.cells, crit = b.t.crit;
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      if (!b.lit[i]) s += 5 * b.n[i] / crit[i];
      if (b.n[i] === crit[i] - 1) s += 1.5;
    }
    return s;
  }

  /** Beam search for a short tap sequence that lights every cell. */
  function solvePuzzle(start, maxDepth, width) {
    width = width || 10;
    var t = start.t, total = t.cells.length;
    if (start.litCount() === total) return [];
    var beam = [{ b: start, path: [] }];
    for (var d = 0; d < maxDepth; d++) {
      var cand = [], seen = new Set();
      for (var s = 0; s < beam.length; s++) {
        for (var k = 0; k < t.cells.length; k++) {
          var i = t.cells[k], b2 = beam[s].b.clone();
          puzzleTap(b2, i);
          var lc = b2.litCount();
          if (lc === total) return beam[s].path.concat(i);
          var key = boardKey(b2);
          if (seen.has(key)) continue;
          seen.add(key);
          cand.push({ b: b2, path: beam[s].path.concat(i), score: puzzleScore(b2, lc) });
        }
      }
      if (!cand.length) return null;
      cand.sort(function (x, y) { return y.score - x.score; });
      beam = cand.slice(0, width);
    }
    return null;
  }

  function levelSpec(L) {
    var w, h;
    if (L <= 3) { w = 4; h = 5; }
    else if (L <= 8) { w = 5; h = 6; }
    else if (L <= 16) { w = 5; h = 7; }
    else if (L <= 30) { w = 6; h = 8; }
    else { w = 7; h = 9; }
    var minT = L <= 2 ? 1 : L <= 15 ? 2 : L <= 40 ? 3 : 4;
    var maxT = L <= 2 ? 1 : L <= 6 ? 2 : L <= 15 ? 3 : L <= 30 ? 4 : L <= 60 ? 5 : 6;
    var walls = L < 10 ? 0 : Math.min(12, 2 + Math.floor((L - 10) / 4));
    var fill = L <= 2 ? 0.8 : Math.max(0.38, 0.62 - L * 0.004);
    return { w: w, h: h, minT: minT, maxT: maxT, walls: walls, fill: fill };
  }

  function buildPuzzle(spec, rand) {
    var w = spec.w, h = spec.h, walls = new Uint8Array(w * h);
    // Mirror-symmetric walls look designed rather than random.
    var placed = 0, guard = 0;
    while (placed < spec.walls && guard++ < 200) {
      var x = Math.floor(rand() * Math.ceil(w / 2)), y = Math.floor(rand() * h);
      var i1 = y * w + x, i2 = y * w + (w - 1 - x);
      if (walls[i1]) continue;
      walls[i1] = 1; walls[i2] = 1; placed += i1 === i2 ? 1 : 2;
    }
    var topo = new Topology(w, h, walls);
    if (topo.cells.length < w * h * 0.6) return null;
    var b = new Board(topo);
    for (var k = 0; k < topo.cells.length; k++) {
      var i = topo.cells[k], c = topo.crit[i];
      b.n[i] = rand() < spec.fill ? c - 1 : Math.floor(rand() * c);
      if (b.n[i]) b.o[i] = 0;
    }
    return b;
  }

  /** Deterministic puzzle for a seed; returns { board, par, solution }. */
  function generatePuzzle(spec, seed) {
    var best = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var rand = mulberry32(hash(seed, attempt));
      var b = buildPuzzle(spec, rand);
      if (!b) continue;
      var sol = solvePuzzle(b, spec.maxT + 3, 8);
      if (!sol || !sol.length) continue;
      if (sol.length >= spec.minT && sol.length <= spec.maxT) return { board: b, par: sol.length, solution: sol };
      if (!best || Math.abs(sol.length - spec.maxT) < Math.abs(best.par - spec.maxT)) best = { board: b, par: sol.length, solution: sol };
    }
    return best;
  }

  var levelCache = new Map();
  function generateLevel(L) {
    if (!levelCache.has(L)) levelCache.set(L, generatePuzzle(levelSpec(L), 'level-' + L));
    var g = levelCache.get(L);
    return { board: g.board.clone(), par: g.par, solution: g.solution.slice() };
  }

  function generateDaily(dateStr) {
    var r = mulberry32(hash('daily', dateStr));
    var spec = levelSpec(20 + Math.floor(r() * 30));
    var g = generatePuzzle(spec, 'daily-' + dateStr);
    return { board: g.board, par: g.par, solution: g.solution };
  }

  // ------------------------------------------------------------ versus mode
  function legalMoves(b, p) {
    var res = [], cells = b.t.cells;
    for (var k = 0; k < cells.length; k++) { var i = cells[k]; if (b.o[i] === -1 || b.o[i] === p) res.push(i); }
    return res;
  }

  function versusMove(b, i, p, oppHasMoved, onWave) {
    return place(b, i, p, onWave, oppHasMoved ? function () { return b.count(1 - p) === 0; } : null);
  }

  function evaluate(b, me) {
    var opp = 1 - me, t = b.t, cells = t.cells, my = 0, op = 0, s = 0;
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      if (b.o[i] === me) {
        my += b.n[i];
        var threatened = false, a = t.nb[i];
        for (var j = 0; j < a.length; j++) {
          var q = a[j];
          if (b.o[q] === opp && b.n[q] === t.crit[q] - 1) { s -= 5 - t.crit[i]; threatened = true; }
        }
        if (!threatened) {
          if (t.crit[i] === 2) s += 3; else if (t.crit[i] === 3) s += 2;
          if (b.n[i] === t.crit[i] - 1) s += 2;
        }
      } else if (b.o[i] === opp) op += b.n[i];
    }
    if (op === 0 && my > 0) return 100000;
    if (my === 0 && op > 0) return -100000;
    return s + my - op;
  }

  /** level: 0 easy, 1 normal, 2 hard. */
  function aiMove(b, me, level, oppHasMoved, rand) {
    rand = rand || Math.random;
    var moves = legalMoves(b, me), opp = 1 - me;
    if (level === 0 && rand() < 0.35) return moves[Math.floor(rand() * moves.length)];
    var best = -Infinity, choice = moves[0];
    for (var m = 0; m < moves.length; m++) {
      var b1 = b.clone();
      versusMove(b1, moves[m], me, oppHasMoved);
      var score;
      if (oppHasMoved && b1.count(opp) === 0) return moves[m];
      if (level < 2) {
        score = evaluate(b1, me) + (level === 0 ? rand() * 12 : rand() * 2);
      } else {
        score = Infinity;
        var replies = legalMoves(b1, opp);
        for (var r = 0; r < replies.length && score > best; r++) {
          var b2 = b1.clone();
          versusMove(b2, replies[r], opp, true);
          var e = evaluate(b2, me);
          if (e < score) score = e;
        }
        score += rand() * 0.5;
      }
      if (score > best) { best = score; choice = moves[m]; }
    }
    return choice;
  }

  var api = {
    Topology: Topology, Board: Board, resolve: resolve, place: place,
    puzzleTap: puzzleTap, solvePuzzle: solvePuzzle, levelSpec: levelSpec,
    generatePuzzle: generatePuzzle, generateLevel: generateLevel, generateDaily: generateDaily,
    legalMoves: legalMoves, versusMove: versusMove, evaluate: evaluate, aiMove: aiMove,
    mulberry32: mulberry32, hash: hash
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.NovaEngine = api;
})(this);
