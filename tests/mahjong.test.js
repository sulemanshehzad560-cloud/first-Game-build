// Run with: node tests/mahjong.test.js
const assert = require('assert');
const M = require('../js/mahjong.js');

// Freedom rules: a 3-wide row has open ends only; a tile on top blocks the one below.
const lay = new M.Layout([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }]);
const all = new Uint8Array(4).fill(1);
assert.deepStrictEqual([0, 1, 2, 3].map(i => M.isFree(lay, all, i)), [true, false, true, true]);

function replay(g) {
  const present = new Uint8Array(g.layout.n).fill(1);
  for (const [a, b] of g.solution) {
    assert.ok(present[a] && present[b]);
    assert.ok(M.isFree(g.layout, present, a) && M.isFree(g.layout, present, b), 'pair must be free');
    assert.strictEqual(g.kinds[a], g.kinds[b], 'pair must match');
    present[a] = 0; present[b] = 0;
  }
  assert.ok(present.every(v => !v), 'board cleared');
}

let slowest = 0;
for (let L = 1; L <= 150; L++) {
  const t0 = Date.now();
  const g = M.generateLevel(L);
  slowest = Math.max(slowest, Date.now() - t0);
  replay(g);
  if ([1, 2, 5, 10, 20, 40, 80, 150].includes(L)) {
    const kinds = new Set(g.kinds).size;
    console.log(`level ${L}: ${g.layout.n} tiles, ${g.layout.maxZ + 1} layers, ${kinds} kinds, ${Math.round(g.layout.n * g.spec.secPerTile)}s`);
  }
}
console.log('slowest generation', slowest, 'ms');
replay(M.generateDaily('2026-10-01'));
replay(M.generateDuel(12345, 'big'));

// Determinism.
assert.strictEqual(M.generate(M.levelSpec(9), 'x').kinds.join(), M.generate(M.levelSpec(9), 'x').kinds.join());

// Reshuffle keeps the multiset of kinds and stays solvable.
const g = M.generateLevel(30), present = new Uint8Array(g.layout.n).fill(1);
for (const [a, b] of g.solution.slice(0, 10)) { present[a] = 0; present[b] = 0; }
const next = M.reshuffle(g.layout, present, g.kinds, M.mulberry32(7));
const ms = k => Array.from(k).filter((_, i) => present[i]).sort().join();
assert.strictEqual(ms(next), ms(g.kinds));
assert.ok(M.freePairs(g.layout, present, next).length > 0);

// AI duel on a shared board always ends.
for (let lvl = 0; lvl < 3; lvl++) {
  const d = M.generateDuel(lvl, 'big'), p = new Uint8Array(d.layout.n).fill(1);
  let kinds = d.kinds, moves = 0;
  while (p.some(Boolean) && moves < 500) {
    let pr = M.aiPick(d.layout, p, kinds, lvl);
    if (!pr) { kinds = M.reshuffle(d.layout, p, kinds, M.mulberry32(moves)); if (!kinds) break; continue; }
    p[pr[0]] = 0; p[pr[1]] = 0; moves++;
  }
  assert.ok(moves < 500);
}
console.log('all mahjong tests passed');
