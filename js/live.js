/*
 * Live Rush Hour races between real players, on Firebase (anonymous sign-in + Realtime Database).
 * Matchmaking: players are grouped by level bracket; a race stays open for joiners for its first 3 minutes
 * or until 25 players are in, then the next player opens a new one. Each player writes only their own row
 * (streak, out, finish time); everyone listens to the race and sees the others move in real time.
 * Without a configured project (js/live-config.js) or offline, the game falls back to computer rivals.
 */
(function (global) {
  'use strict';
  var F = null, CFG = global.JADE_FIREBASE || {}, sdk = null;
  var JOIN_WINDOW = 3 * 60000, RACE_MS = 45 * 60000, MAX_PLAYERS = 25;
  var app = null, auth = null, db = null, uid = null, offset = 0, ready = null;

  function available() { CFG = global.JADE_FIREBASE || CFG; return !!(CFG.apiKey && CFG.databaseURL); }
  // The Firebase bundle (~280 KB) is only loaded when a race needs it, which keeps start-up light on
  // low-memory phones.
  function loadSdk() {
    if (global.FirebaseLive) { F = global.FirebaseLive; return Promise.resolve(); }
    if (!sdk) sdk = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = 'vendor/firebase-live.js'; s.async = true;
      s.onload = function () { F = global.FirebaseLive; if (F) resolve(); else reject(new Error('no sdk')); };
      s.onerror = function () { sdk = null; reject(new Error('sdk failed to load')); };
      document.head.appendChild(s);
    });
    return sdk;
  }
  function init() {
    if (ready) return ready;
    if (!available()) return Promise.reject(new Error('live races not configured'));
    ready = loadSdk().then(function () { return new Promise(function (resolve, reject) {
      try {
        if (!app) {
          app = F.initializeApp(CFG);
          // No popup/redirect resolver: it needs an iframe that the app's WebView does not allow.
          auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence, F.inMemoryPersistence] });
          db = F.getDatabase(app);
          if (CFG.emulator) {   // local testing only (firebase emulators)
            F.connectAuthEmulator(auth, 'http://' + CFG.emulator + ':9099', { disableWarnings: true });
            F.connectDatabaseEmulator(db, CFG.emulator, 9000);
          }
          F.onValue(F.ref(db, '.info/serverTimeOffset'), function (s) { offset = s.val() || 0; });
        }
        var timer = setTimeout(function () { reject(new Error('sign-in timed out')); }, 15000);
        var stop = F.onAuthStateChanged(auth, function (u) { if (u) { clearTimeout(timer); uid = u.uid; stop(); resolve(u.uid); } });
        if (!auth.currentUser) F.signInAnonymously(auth).catch(function (e) { clearTimeout(timer); reject(e); });
      } catch (e) { reject(e); }
    }); });
    ready.catch(function () { ready = null; });   // try again next time
    return ready;
  }
  function serverNow() { return Date.now() + offset; }

  /** Join (or open) the race for this bracket. Resolves { id, start, end } in local clock time. */
  function join(bracket, name) {
    return init().then(function () {
      return F.runTransaction(F.ref(db, 'rush/open/' + bracket), function (cur) {
        var n = serverNow();
        if (cur && cur.id && n - cur.created < JOIN_WINDOW && cur.count < MAX_PLAYERS) { cur.count++; return cur; }
        return { id: bracket + '-' + n.toString(36) + Math.random().toString(36).slice(2, 6), created: n, count: 1 };
      });
    }).then(function (res) {
      var o = res.snapshot.val(), base = 'rush/races/' + o.id;
      // Only the race's first player can write its details (the rules refuse an overwrite); others skip it.
      return F.set(F.ref(db, base + '/meta'), { bracket: bracket, created: o.created, end: o.created + RACE_MS }).catch(function () {}).then(function () {
        return F.set(F.ref(db, base + '/players/' + uid), { name: String(name || 'Player').slice(0, 24), streak: 0, out: false, doneAt: 0, joined: F.serverTimestamp() });
      }).then(function () { return { id: o.id, uid: uid, start: o.created - offset, end: o.created + RACE_MS - offset }; });
    });
  }
  /** Update this player's row: { streak, out, done }. */
  function report(raceId, data) {
    if (!db || !uid || !raceId) return Promise.resolve(false);
    var row = { streak: data.streak, out: !!data.out };
    if (data.done) row.doneAt = F.serverTimestamp();
    return F.update(F.ref(db, 'rush/races/' + raceId + '/players/' + uid), row).then(function () { return true; }, function () { return false; });
  }
  /** Live updates of everyone in the race except this player: cb([{ id, name, streak, out, doneAt (local ms) }]). */
  function watch(raceId, cb) {
    var stopped = false, unsub = function () {};
    init().then(function () {
      if (stopped) return;
      unsub = F.onValue(F.ref(db, 'rush/races/' + raceId + '/players'), function (snap) {
        var v = snap.val() || {}, rows = [];
        Object.keys(v).forEach(function (k) {
          if (k === uid) return;
          var p = v[k] || {};
          rows.push({ id: k, name: String(p.name || 'Player').slice(0, 24), streak: Math.max(0, Math.min(7, p.streak | 0)), out: !!p.out, doneAt: p.doneAt ? p.doneAt - offset : 0 });
        });
        cb(rows);
      }, function () { /* permission or network error: keep the last standings */ });
    }, function () {});
    return function () { stopped = true; unsub(); };
  }

  global.LiveRush = { available: available, join: join, report: report, watch: watch, MAX_PLAYERS: MAX_PLAYERS };
})(this);
