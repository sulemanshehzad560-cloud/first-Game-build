// Run with: node tests/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');

// Critical mass: corner 2, edge 3, middle 4.
const topo = new E.Topology(3, 3);
assert.deepStrictEqual([topo.crit[0], topo.crit[1], topo.crit[4]], [2, 3, 4]);

// A corner with 1 orb bursts on the next one.
const b = new E.Board(topo);
E.place(b, 0, 0); E.place(b, 0, 0);
assert.strictEqual(b.n[0], 0); assert.strictEqual(b.n[1], 1); assert.strictEqual(b.n[3], 1);
assert.strictEqual(b.o[1], 0);

// Every generated level is solvable within its par.
let maxMs = 0;
for (let L = 1; L <= 120; L++) {
  const t0 = Date.now();
  const lvl = E.generateLevel(L);
  maxMs = Math.max(maxMs, Date.now() - t0);
  const board = lvl.board.clone();
  for (const i of lvl.solution) E.puzzleTap(board, i);
  assert.ok(board.allLit(), 'level ' + L + ' solution should light every cell');
  assert.strictEqual(lvl.solution.length, lvl.par);
  if (L <= 12 || L % 20 === 0) console.log(`level ${L}: ${lvl.board.t.w}x${lvl.board.t.h} par ${lvl.par}`);
}
console.log('slowest generation', maxMs, 'ms');

// Determinism: same level twice gives the same board.
assert.strictEqual(E.generateLevel(42).board.n.join(), E.generateLevel(42).board.n.join());

// AI never plays an illegal move and games terminate.
for (let g = 0; g < 6; g++) {
  const vb = new E.Board(new E.Topology(6, 9));
  let turn = 0, moves = 0;
  while (moves < 600) {
    const i = E.aiMove(vb, turn, g % 3, moves >= 1);
    assert.ok(vb.o[i] === -1 || vb.o[i] === turn);
    E.versusMove(vb, i, turn, moves >= 1);
    moves++;
    if (moves >= 2 && vb.count(1 - turn) === 0) break;
    turn = 1 - turn;
  }
  assert.ok(moves < 600, 'game should finish');
}
console.log('all engine tests passed');
