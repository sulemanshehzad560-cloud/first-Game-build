// CI check of the live Rush Hour backend (Firebase project in js/live-config.js): anonymous sign-in,
// open a race in the "ci" bracket, write and raise our own row, and confirm the rules refuse another
// player's row and a lowered streak. Prints PASS/FAIL lines; exits 1 on a failure.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, set, update, get, runTransaction, goOffline } from 'firebase/database';

const src = readFileSync('js/live-config.js', 'utf8');
const cfg = {}; for (const k of ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']) { const m = src.match(new RegExp(k + ":\\s*'([^']*)'")); cfg[k] = m ? m[1] : ''; }
if (!cfg.apiKey) { console.log('SKIP live races not configured'); process.exit(0); }
let fails = 0; const log = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const deny = p => p.then(() => false, () => true);
const timeout = setTimeout(() => { console.log('FAIL timed out'); process.exit(1); }, 60000);

async function client(name) {
  const app = initializeApp(cfg, name), auth = getAuth(app), db = getDatabase(app);
  const u = await signInAnonymously(auth); return { db, uid: u.user.uid };
}
const A = await client('a'); log(!!A.uid, 'anonymous sign-in');
const B = await client('b');
const now = Date.now(), id = 'ci-' + now.toString(36);
const tx = await runTransaction(ref(A.db, 'rush/open/ci'), () => ({ id, created: now, count: 1 }));
log(tx.committed, 'open a race (matchmaking pointer)');
log(await set(ref(A.db, `rush/races/${id}/meta`), { bracket: 'ci', created: now, end: now + 60000 }).then(() => true, () => false), 'write race details');
const row = who => ref(who.db, `rush/races/${id}/players/${A.uid}`);
log(await set(row(A), { name: 'CI check', streak: 0, out: false, doneAt: 0, joined: now - 1000 }).then(() => true, () => false), 'join the race (own row)');
log(await update(row(A), { streak: 1 }).then(() => true, () => false), 'raise own streak');
log((await get(ref(B.db, `rush/races/${id}/players`))).exists(), 'another player sees the race live');
log(await deny(update(row(B), { streak: 7 })), "rules refuse writing another player's row");
log(await deny(update(row(A), { streak: 0 })), 'rules refuse lowering a streak');
log(await deny(set(ref(B.db, `rush/races/${id}/meta`), { bracket: 'x', created: 1, end: 2 })), 'rules refuse overwriting a race');
await update(row(A), { out: true }).catch(() => {});
goOffline(A.db); goOffline(B.db); clearTimeout(timeout);
console.log(fails ? `FAIL live backend: ${fails} check(s) failed` : 'PASS live Rush Hour backend works');
process.exit(fails ? 1 : 0);
