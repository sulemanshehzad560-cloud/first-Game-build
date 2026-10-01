/* Jade Rush — app controller: screens, solo timed play, duels, persistence, online sync. */
(function () {
  'use strict';
  var M = window.Mahjong, A = window.GameAudio, Net = window.NovaNet;
  var $ = function (id) { return document.getElementById(id); };
  var TURN_MS = 15000, COMBO_MS = 5000, HINT_COST_MS = 10000;
  var COLORS = ['#4fd1a5', '#ff7a59'];
  var PRIVACY_URL = 'https://sulemanshehzad560-cloud.github.io/first-Game-build/privacy.html';
  var Shell = window.NativeShell || { isNative: false, onBack: function () {}, onPause: function () {}, onResume: function () {}, versionName: function () { return Promise.resolve('web'); }, styleBars: function () {} };
  var Ads = window.GameAds || { boardFinished: function () {}, between: function (l, next) { next(); }, hasPrivacyOptions: function () { return false; } };

  // ------------------------------------------------------------- storage
  var SAVE_KEY = 'jaderush.v1';
  var store = { level: 1, stars: {}, best: {}, sound: true, daily: {}, streak: { last: '', n: 0 }, wins: { ai: 0, online: 0 }, aiLevel: 1, duel: 'race', size: 'small', seenHowto: false, theme: 'jade', vibrate: true };
  try { Object.assign(store, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ } }
  function totalStars() { var s = 0; for (var k in store.stars) s += store.stars[k]; return s; }
  function dayKey(offset) { var d = new Date(Date.now() + (offset || 0) * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  A.setEnabled(store.sound);

  // ------------------------------------------------------------- tile sets, chapters, juice
  var THEMES = window.MahjongTiles.THEMES;
  var CHAPTERS = [
    { name: 'Bamboo Grove', color: '#2ee6b6' }, { name: 'Lotus Pond', color: '#ff6fae' },
    { name: 'Koi River', color: '#ff8a5c' }, { name: 'Moon Gate', color: '#47b8ff' },
    { name: 'Plum Blossom', color: '#ff5f6d' }, { name: 'Dragon Peak', color: '#a879ff' },
    { name: 'Golden Pagoda', color: '#ffc94a' }, { name: 'Cloud Palace', color: '#7cffcb' }
  ];
  var ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  function chapterOf(L) {
    var idx = Math.floor((L - 1) / 10), c = CHAPTERS[idx % CHAPTERS.length], cycle = Math.floor(idx / CHAPTERS.length) + 1;
    return { n: idx + 1, name: c.name + (cycle === 1 ? '' : ROMAN[cycle] || ' ' + cycle), color: c.color };
  }
  function currentTheme() {
    var t = THEMES.filter(function (x) { return x.id === store.theme; })[0];
    return t && totalStars() >= t.stars ? t : THEMES[0];
  }
  function applyTheme() {
    var t = currentTheme(), st = document.documentElement.style;
    st.setProperty('--bg0', t.bg[0]); st.setProperty('--bg1', t.bg[1]);
    st.setProperty('--glowA', t.bg[2]); st.setProperty('--glowB', t.bg[3]); st.setProperty('--accent', t.accent);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t.bg[0];
    board.setTheme(t); demo.setTheme(t); sky.setTheme(t);
  }
  function buzz(pattern) { if (store.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ } } }
  function hexA(h, a) { var v = parseInt(h.slice(1), 16); return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')'; }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animated table: slow colored light blobs and drifting sparkles in the active set's colors.
  var sky = (function () {
    var c = $('bg'), g = c.getContext('2d'), W = 0, H = 0, theme = THEMES[0], sparks = [], drawn = false;
    var blobs = [[0.15, 0.12, 0.7, 2, 0.00011], [0.9, 0.35, 0.55, 3, 0.00008], [0.3, 0.9, 0.65, 3, 0.00013], [0.8, 0.95, 0.5, 2, 0.0001]];
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      sparks = [];
      for (var k = 0; k < Math.round(W * H / 14000); k++) sparks.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, s: 0.004 + Math.random() * 0.012, p: Math.random() * 6.28 });
      drawn = false;
    }
    function frame(now) {
      if (reduced && drawn) return;
      drawn = true;
      var base = g.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0, theme.bg[1]); base.addColorStop(1, theme.bg[0]);
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      var m = Math.max(W, H);
      blobs.forEach(function (b, k) {
        var x = (b[0] + Math.sin(now * b[4] + k) * 0.08) * W, y = (b[1] + Math.cos(now * b[4] * 1.3 + k) * 0.06) * H;
        var gr = g.createRadialGradient(x, y, 0, x, y, b[2] * m);
        gr.addColorStop(0, hexA(theme.bg[b[3]], 0.32)); gr.addColorStop(1, hexA(theme.bg[b[3]], 0));
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      });
      for (var k = 0; k < sparks.length; k++) {
        var sp = sparks[k], yy = (sp.y - now * sp.s) % H;
        if (yy < 0) yy += H;
        g.fillStyle = hexA(k % 3 ? '#ffffff' : theme.accent, 0.25 + 0.35 * Math.sin(sp.p + now / 700));
        g.beginPath(); g.arc(sp.x + Math.sin(now / 2000 + sp.p) * 8, yy, sp.r, 0, 6.283); g.fill();
      }
    }
    window.addEventListener('resize', resize);
    resize();
    return { frame: frame, setTheme: function (t) { theme = t; drawn = false; } };
  })();

  // Confetti for wins.
  var confetti = (function () {
    var c = $('confetti'), g = c.getContext('2d'), parts = [], dirty = false;
    function resize() { var dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    window.addEventListener('resize', resize); resize();
    return {
      burst: function (n) {
        if (reduced) return;
        var t = currentTheme(), cols = [t.accent, t.bg[2], t.bg[3], '#ff6fae', '#47cdff', '#ffffff', '#7cffcb'];
        for (var k = 0; k < n; k++) parts.push({ x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 0.9, vy: -0.4 - Math.random() * 0.7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: cols[k % cols.length], life: 2600 + Math.random() * 1200, age: 0 });
      },
      frame: function (dt) {
        if (!parts.length) { if (dirty) { g.clearRect(0, 0, innerWidth, innerHeight); dirty = false; } return; }
        dirty = true; g.clearRect(0, 0, innerWidth, innerHeight);
        for (var k = parts.length - 1; k >= 0; k--) {
          var p = parts[k]; p.age += dt;
          if (p.age > p.life) { parts.splice(k, 1); continue; }
          p.vy += 0.0012 * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          g.save(); g.globalAlpha = Math.min(1, (p.life - p.age) / 500);
          g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.age / 120));
          g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
        }
      }
    };
  })();

  function banner(text) {
    var el = $('banner');
    el.textContent = text; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(banner.t); banner.t = setTimeout(function () { el.hidden = true; }, 1250);
  }
  function setHeat(combo) {
    var w = $('board-wrap');
    w.classList.toggle('heat-1', combo >= 3 && combo < 6);
    w.classList.toggle('heat-2', combo >= 6 && combo < 9);
    w.classList.toggle('heat-3', combo >= 9);
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function countUp(root) {
    root.querySelectorAll('[data-to]').forEach(function (el) {
      var to = Number(el.dataset.to), pre = el.dataset.pre || '', t0 = performance.now();
      (function step(now) {
        var t = Math.min(1, (now - t0) / 900), v = Math.round(to * (1 - Math.pow(1 - t, 3)));
        el.textContent = pre + v;
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  function setTitle(main, sub, color) {
    var h = $('game-title'); h.textContent = main;
    if (sub) { var sm = document.createElement('small'); sm.textContent = sub; h.insertBefore(sm, h.firstChild); }
    $('game').style.setProperty('--chapter', color || 'var(--accent)');
  }

  // ------------------------------------------------------------- ui helpers
  var screens = ['home', 'levels', 'lobby', 'game'];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    if (id === 'home') refreshHome();
    if (id === 'game') board.resize();
  }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function modal(opts) {
    $('modal-title').textContent = opts.title;
    var body = $('modal-body'); body.innerHTML = '';
    if (typeof opts.body === 'string') { var p = document.createElement('p'); p.textContent = opts.body; body.appendChild(p); }
    else if (opts.body) body.appendChild(opts.body);
    var st = $('modal-stars'); st.hidden = opts.stars == null;
    if (opts.stars != null) st.innerHTML = [1, 2, 3].map(function (k) { return '<span class="' + (k <= opts.stars ? 'on' : '') + '">★</span>'; }).join('');
    var act = $('modal-actions'); act.innerHTML = '';
    modal.back = opts.back || null;
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = a.primary ? 'primary' : 'ghost'; b.textContent = a.label;
      var run = a.run;
      if (opts.adGate != null && run) run = function () { Ads.between(opts.adGate, a.run); };
      b.addEventListener('click', function () { closeModal(); if (run) run(); });
      act.appendChild(b);
    });
    $('modal').hidden = false;
    countUp(body);
    var first = act.querySelector('.primary') || act.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeModal() { $('modal').hidden = true; }
  function resultGrid(pairs) {
    var d = document.createElement('div'); d.className = 'result-grid';
    pairs.forEach(function (p) {
      var c = document.createElement('div'); c.innerHTML = '<span class="label"></span><b></b>';
      c.firstChild.textContent = p[0]; c.lastChild.textContent = p[1];
      var m = /^([+]?)(\d+)$/.exec(String(p[1]));
      if (m && !reduced) { c.lastChild.dataset.to = m[2]; c.lastChild.dataset.pre = m[1]; c.lastChild.textContent = m[1] + '0'; }
      d.appendChild(c);
    });
    return d;
  }
  function chipGroup(label, options, value, onPick) {
    var wrap = document.createElement('div'); wrap.className = 'opt-group';
    var l = document.createElement('span'); l.textContent = label; wrap.appendChild(l);
    var row = document.createElement('div'); row.className = 'size-pick'; row.setAttribute('role', 'radiogroup');
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = o[1];
      b.setAttribute('aria-checked', String(o[0] === value));
      b.addEventListener('click', function () {
        row.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true'); onPick(o[0]);
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }
  function floatText(text, x, y, big, color) {
    var el = document.createElement('div');
    el.className = 'float' + (big ? ' big' : ''); el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (color) el.style.color = color;
    $('fx-layer').appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }

  // ------------------------------------------------------------- home
  function refreshHome() {
    var d = store.daily[dayKey()];
    var ch = chapterOf(store.level);
    $('continue-label').textContent = 'Level ' + store.level;
    $('continue-chapter').textContent = 'Chapter ' + ch.n + ' · ' + ch.name;
    $('btn-continue').style.setProperty('--chapter', ch.color);
    var unlocked = THEMES.filter(function (t) { return totalStars() >= t.stars; }).length;
    $('themes-meta').textContent = unlocked + ' of ' + THEMES.length + ' unlocked';
    $('continue-meta').textContent = 'Endless levels · ' + totalStars() + ' ★ collected';
    $('levels-meta').textContent = (store.level - 1) + ' cleared';
    $('daily-meta').textContent = d ? 'Done today · ' + '★★★'.slice(0, d)
      : store.streak.n > 1 && store.streak.last === dayKey(-1) ? store.streak.n + '-day streak' : 'New every day';
    $('ai-meta').textContent = store.wins.ai ? store.wins.ai + ' wins' : '3 levels';
  }
  function renderLevelGrid() {
    var grid = $('level-grid'), html = '', last = Math.ceil((store.level + 5) / 10) * 10;
    for (var L = 1; L <= last; L++) {
      if ((L - 1) % 10 === 0) {
        var ch = chapterOf(L), got = 0;
        for (var q = L; q < L + 10; q++) got += store.stars[q] || 0;
        html += (L > 1 ? '</div></section>' : '') + '<section class="chapter" style="--c:' + ch.color + '"><h3>' + ch.name + '<span>' + got + ' / 30 ★</span></h3><div class="level-grid">';
      }
      var s = store.stars[L] || 0, locked = L > store.level;
      html += '<button class="lvl' + (L === store.level ? ' current' : '') + '" data-level="' + L + '"' + (locked ? ' disabled' : '') + '>' + L +
        '<small>' + (locked ? '' : '★★★'.slice(0, s) || '·') + '</small></button>';
    }
    grid.innerHTML = html + '</div></section>';
    $('levels-stars').textContent = totalStars() + ' ★';
    var cur = grid.querySelector('.current'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------- shared board state
  var board = new window.TileBoard($('board'));
  var G = { mode: null };
  function isTurns() { return G.duel === 'turns'; }
  function midpoint(a, b) { var r1 = board.rect(a), r2 = board.rect(b); return [(r1.x + r2.x + r1.w) / 2, (r1.y + r2.y + r1.h) / 2]; }

  function baseState(gen) {
    var n = gen.layout.n;
    return { lay: gen.layout, kinds: gen.kinds.slice(), present: new Uint8Array(n).fill(1), left: n, sel: -1, over: false, gen: gen };
  }
  function mountBoard(showFree) {
    $('modal').hidden = true;
    show('game');
    board.set(G.lay, G.kinds, G.present, showFree);
  }

  // ------------------------------------------------------------- timed play (journey, daily, online race)
  function startTimed(gen, cfg) {
    G = baseState(gen);
    Object.assign(G, cfg, {
      score: 0, combo: 0, bestCombo: 0, lastMatch: 0, usedHint: false,
      limit: Math.round(gen.layout.n * gen.spec.secPerTile) * 1000,
      hints: cfg.duel === 'race' ? 1 : gen.spec.hints,
      shuffles: cfg.duel === 'race' ? 2 : gen.spec.shuffles,
      rival: { left: gen.layout.n, done: false, out: false, score: 0 }
    });
    G.timeLeft = G.limit;
    if (cfg.mode === 'journey') { var ch = chapterOf(cfg.level); setTitle(cfg.title, 'Chapter ' + ch.n + ' · ' + ch.name, ch.color); }
    else setTitle(cfg.title, cfg.mode === 'daily' ? dayKey() : 'Race', null);
    var pausable = cfg.mode !== 'online';
    $('btn-quit').textContent = pausable ? '❚❚' : '←'; $('btn-quit').setAttribute('aria-label', pausable ? 'Pause' : 'Leave race');
    G.shownScore = 0; setHeat(0); $('score').textContent = '0'; $('combo-bar').style.width = '0';
    $('hud-solo').hidden = false; $('hud-duel').hidden = true;
    $('rival').hidden = cfg.duel !== 'race';
    $('btn-hint').hidden = false; $('btn-shuffle').hidden = false;
    $('emotes').hidden = cfg.duel !== 'race'; $('goal').hidden = cfg.duel === 'race';
    $('goal').textContent = gen.spec.showFree ? 'Match free tiles in pairs. Dimmed tiles are blocked.' : 'Free tiles are no longer highlighted. Look closely.';
    board.accent = currentTheme().accent;
    mountBoard(gen.spec.showFree && cfg.duel !== 'race');
    updateTimedHud();
  }

  function startLevel(level) {
    startTimed(M.generateLevel(level), { mode: 'journey', level: level, title: 'Level ' + level });
    setTimeout(function () { M.generateLevel(level + 1); }, 500);
    if (level === 1 && !store.seenHowto) { store.seenHowto = true; save(); G.paused = true; howTo(function () { G.paused = false; }); }
  }
  function startDaily() { startTimed(M.generateDaily(dayKey()), { mode: 'daily', title: 'Daily board' }); }

  function updateTimedHud() {
    var cb = $('combo'), c = Math.max(1, G.combo);
    if (cb.textContent !== '×' + c) { cb.textContent = '×' + c; if (c > 1) bump(cb); }
    cb.className = c >= 10 ? 't4' : c >= 7 ? 't3' : c >= 5 ? 't2' : c >= 3 ? 't1' : '';
    if ($('left').textContent !== String(G.left)) { $('left').textContent = G.left; bump($('left')); }
    $('hint-count').textContent = G.hints; $('btn-hint').disabled = G.hints <= 0;
    $('shuffle-count').textContent = G.shuffles; $('btn-shuffle').disabled = G.shuffles <= 0;
    if (G.duel === 'race') {
      var n = G.lay.n;
      $('rival-fill').style.width = (100 * (n - G.rival.left) / n) + '%';
      $('rival-text').textContent = G.rival.done ? 'Cleared' : G.rival.out ? 'Out · ' + G.rival.left + ' left' : G.rival.left + ' left';
    }
    drawClock();
  }
  function drawClock() {
    var frac = G.timeLeft / G.limit;
    $('clock-fill').style.width = (100 * frac) + '%';
    $('clock-text').textContent = fmtTime(G.timeLeft);
    $('clock-fill').parentNode.classList.toggle('low', frac < 0.2);
  }

  function tickTimed(dt) {
    if (G.over || G.paused || !G.limit || isTurns()) return;
    if (G.mode !== 'online' && !$('modal').hidden) return;
    var before = Math.ceil(G.timeLeft / 1000);
    G.timeLeft -= dt;
    var after = Math.ceil(G.timeLeft / 1000);
    if (after !== before) { drawClock(); if (after <= 10 && after > 0) A.tick(); }
    if (G.timeLeft <= 0) { G.timeLeft = 0; drawClock(); timedFail('Out of time'); }
  }

  function timedMatch(a, b) {
    var now = performance.now(), kind = G.kinds[a];
    G.combo = now - G.lastMatch < COMBO_MS ? Math.min(G.combo + 1, 12) : 1;
    G.lastMatch = now; G.bestCombo = Math.max(G.bestCombo, G.combo);
    var pts = 10 * G.combo + (kind >= 27 ? 10 : 0);
    G.score += pts;
    var mp = midpoint(a, b);
    floatText('+' + pts, mp[0], mp[1], G.combo >= 4);
    var tier = { 3: 'Nice!', 5: 'Great!', 7: 'Amazing!', 9: 'Incredible!', 12: 'Legendary!' }[G.combo];
    if (tier) banner(tier);
    setHeat(G.combo);
    $('btn-shuffle').classList.remove('attention');
    if (G.duel === 'race') Net.send({ t: 'prog', left: G.left, score: G.score });
    updateTimedHud();
    if (G.left === 0) { timedWin(); return; }
    if (!M.freePairs(G.lay, G.present, G.kinds).length) {
      if (G.shuffles > 0) { toast('No moves left. Shuffle!'); $('btn-shuffle').classList.add('attention'); }
      else timedFail('No moves left');
    }
  }

  function timedWin() {
    G.over = true; G.won = true;
    var secs = Math.floor(G.timeLeft / 1000), bonus = secs * 5;
    G.score += bonus;
    var frac = G.timeLeft / G.limit;
    var stars = frac >= 0.4 && !G.usedHint ? 3 : frac >= 0.2 ? 2 : 1;
    A.win();
    var grid = resultGrid([['Score', G.score], ['Time left', fmtTime(G.timeLeft)], ['Best combo', '×' + G.bestCombo], ['Time bonus', '+' + bonus]]);
    confetti.burst(stars === 3 ? 220 : 120); setHeat(0); buzz([20, 40, 20, 40, 60]);
    if (G.duel === 'race') {
      Net.send({ t: 'done', score: G.score });
      store.wins.online++; save();
      modal({ title: 'You won the race!', body: grid, back: leaveGame, actions: [{ label: 'Menu', run: leaveGame }, { label: 'Rematch', primary: true, run: rematch }] });
      return;
    }
    var title = stars === 3 ? 'Flawless' : 'Board cleared';
    if (G.mode === 'daily') {
      var d = dayKey(), prev = store.daily[d] || 0;
      store.daily[d] = Math.max(prev, stars);
      if (!prev) store.streak = { last: d, n: store.streak.last === dayKey(-1) ? store.streak.n + 1 : 1 };
      save();
      Ads.boardFinished();
      modal({ title: title, stars: stars, body: grid, adGate: 99, back: function () { closeModal(); show('home'); }, actions: [{ label: 'Menu', run: function () { show('home'); } }, { label: 'Play journey', primary: true, run: function () { startLevel(store.level); } }] });
      return;
    }
    var L = G.level, newBest = G.score > (store.best[L] || 0);
    if (stars > (store.stars[L] || 0)) store.stars[L] = stars;
    if (newBest) store.best[L] = G.score;
    if (L === store.level) store.level++;
    save();
    if (newBest) title += ' · new best';
    Ads.boardFinished();
    modal({ title: title, stars: stars, body: grid, adGate: L, back: function () { closeModal(); show('home'); }, actions: [{ label: 'Replay', run: function () { startLevel(L); } }, { label: 'Next level', primary: true, run: function () { startLevel(L + 1); } }] });
  }

  function timedFail(reason) {
    if (G.over) return;
    G.over = true; A.lose();
    if (G.duel === 'race') {
      Net.send({ t: 'out', left: G.left, score: G.score });
      if (G.rival.out) resolveRace();
      else modal({ title: reason, body: 'You have ' + G.left + ' tiles left. Waiting to see how your rival does…', actions: [{ label: 'Leave', run: leaveGame }] });
      return;
    }
    var cleared = G.lay.n - G.left;
    Ads.boardFinished();
    modal({
      title: reason, adGate: G.level || 99, back: function () { closeModal(); show('home'); },
      body: 'You cleared ' + cleared + ' of ' + G.lay.n + ' tiles.',
      actions: [{ label: 'Menu', run: function () { show('home'); } }, { label: 'Retry', primary: true, run: function () { G.mode === 'daily' ? startDaily() : startLevel(G.level); } }]
    });
  }

  function resolveRace() {
    var me = G.left, them = G.rival.left;
    var win = me < them || (me === them && G.score > G.rival.score), draw = me === them && G.score === G.rival.score;
    if (win) { store.wins.online++; save(); A.win(); }
    modal({
      title: draw ? 'Dead heat' : win ? 'You win on tiles' : 'Rival wins on tiles',
      body: resultGrid([['Your tiles left', me], ['Rival tiles left', them], ['Your score', G.score], ['Rival score', G.rival.score]]),
      actions: [{ label: 'Menu', run: leaveGame }, { label: 'Rematch', primary: true, run: rematch }]
    });
  }

  function useHint() {
    if (G.over || isTurns()) return;
    if (G.hints <= 0) { toast('No hints left on this board.'); return; }
    var pairs = M.freePairs(G.lay, G.present, G.kinds);
    if (!pairs.length) { toast('No moves left. Shuffle!'); return; }
    var pick = null, sol = G.gen.solution;
    for (var k = 0; k < sol.length && !pick; k++) {
      var a = sol[k][0], b = sol[k][1];
      if (G.present[a] && G.present[b] && G.kinds[a] === G.kinds[b] && M.isFree(G.lay, G.present, a) && M.isFree(G.lay, G.present, b)) pick = [a, b];
    }
    pick = pick || pairs[0];
    G.hints--; G.usedHint = true;
    G.timeLeft = Math.max(1000, G.timeLeft - HINT_COST_MS);
    board.showHint(pick, 3500);
    toast('Hint used: −10 seconds', 1500);
    updateTimedHud();
  }

  function useShuffle() {
    if (G.over || isTurns()) return;
    if (G.shuffles <= 0) { toast('No shuffles left on this board.'); return; }
    var next = M.reshuffle(G.lay, G.present, G.kinds, Math.random);
    if (!next) { timedFail('No moves left'); return; }
    var old = G.kinds;
    G.kinds = next; board.kinds = next; G.sel = -1; board.sel = -1; board.hint = []; board.partners = [];
    board.flipFrom(old); buzz([8, 30, 8, 30, 8]);
    G.gen = Object.assign({}, G.gen, { solution: [] });
    G.shuffles--; A.shuffle(); board.invalidate();
    $('btn-shuffle').classList.remove('attention');
    updateTimedHud();
  }

  // ------------------------------------------------------------- take-turns duel
  function startTurns(cfg) {
    var gen = M.generateDuel(cfg.seed, cfg.size);
    G = baseState(gen);
    Object.assign(G, cfg, { duel: 'turns', turn: cfg.first, scores: [0, 0], moveNo: 0, reshuffles: 0, turnEnd: performance.now() + TURN_MS });
    G.names = cfg.mode === 'local' ? ['Jade', 'Ember'] : cfg.mode === 'ai' ? ['You', 'Computer'] : cfg.me === 0 ? ['You', 'Rival'] : ['Rival', 'You'];
    setTitle(cfg.mode === 'online' ? 'Room ' + Net.code : cfg.mode === 'ai' ? 'Vs computer' : 'Pass & play', cfg.mode === 'ai' ? ['Easy', 'Normal', 'Hard'][cfg.aiLevel] : 'Take turns', null);
    $('btn-quit').textContent = cfg.mode === 'online' ? '←' : '❚❚'; $('btn-quit').setAttribute('aria-label', cfg.mode === 'online' ? 'Leave match' : 'Pause');
    $('hud-solo').hidden = true; $('hud-duel').hidden = false;
    $('btn-hint').hidden = true; $('btn-shuffle').hidden = true;
    $('emotes').hidden = cfg.mode !== 'online'; $('goal').hidden = cfg.mode === 'online';
    $('goal').textContent = 'One match per turn, 15 seconds each. Winds and dragons score 2.';
    $('pname-0').textContent = G.names[0]; $('pname-1').textContent = G.names[1];
    mountBoard(true);
    updateDuelHud();
    maybeAi();
  }

  function updateDuelHud() {
    $('pscore-0').textContent = G.scores[0]; $('pscore-1').textContent = G.scores[1];
    $('chip-0').classList.toggle('active', G.turn === 0 && !G.over);
    $('chip-1').classList.toggle('active', G.turn === 1 && !G.over);
    $('turn-fill').parentNode.className = 'turn-clock p' + G.turn;
    var who = G.names[G.turn];
    $('turn-note').textContent = G.over ? 'Game over' : who === 'You' ? 'Your turn' : G.mode === 'local' ? who + '’s turn' : who + ' is thinking…';
    board.accent = COLORS[G.turn];
    board.partners = []; board.invalidate();
  }

  function tickTurns(now) {
    if (!isTurns() || G.over) return;
    if (G.paused) return;
    var rem = G.turnEnd - now;
    $('turn-fill').style.width = Math.max(0, 100 * rem / TURN_MS) + '%';
    if (rem > 0) return;
    if (G.mode === 'online') {
      if (G.turn !== G.me) return; // the active player's device decides when time is up
      Net.send({ t: 'pass', k: G.moveNo });
    }
    passTurn();
  }

  function passTurn() {
    toast(G.names[G.turn] === 'You' ? 'Time’s up. Turn passed.' : G.names[G.turn] + ' ran out of time.', 1500);
    G.sel = -1; board.sel = -1; G.moveNo++;
    nextTurn();
  }

  function nextTurn() {
    G.turn = 1 - G.turn; G.turnEnd = performance.now() + TURN_MS;
    updateDuelHud();
    maybeAi();
  }

  function turnsMatch(a, b, remote) {
    var kind = G.kinds[a], pts = M.points(kind), p = G.turn;
    if (G.mode === 'online' && !remote) Net.send({ t: 'match', a: a, b: b, k: G.moveNo });
    G.scores[p] += pts; G.moveNo++;
    var mp = midpoint(a, b);
    floatText('+' + pts, mp[0], mp[1], pts > 1, COLORS[p]);
    if (G.left === 0) { turnsOver(); return; }
    if (!M.freePairs(G.lay, G.present, G.kinds).length) {
      var next = M.reshuffle(G.lay, G.present, G.kinds, M.mulberry32(M.hash(G.seed, 'reshuffle', G.reshuffles++)));
      if (!next) { turnsOver(); return; }
      G.kinds = next; board.kinds = next; A.shuffle();
      toast('No moves left. The board was reshuffled.');
    }
    nextTurn();
  }

  function turnsOver() {
    G.over = true; updateDuelHud();
    var s = G.scores, winner = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    var title = winner < 0 ? 'Draw' : G.mode === 'local' ? G.names[winner] + ' wins!' : winner === G.me ? 'You win!' : G.names[winner] + ' wins';
    if (winner === G.me || G.mode === 'local') { A.win(); confetti.burst(160); } else A.lose();
    if (winner === G.me && G.mode === 'ai') store.wins.ai++;
    if (winner === G.me && G.mode === 'online') store.wins.online++;
    save();
    if (G.mode !== 'online') Ads.boardFinished();
    modal({
      title: title, adGate: G.mode === 'online' ? null : 99, back: leaveGame,
      body: resultGrid([[G.names[0], s[0] + ' pts'], [G.names[1], s[1] + ' pts']]),
      actions: [{ label: 'Menu', run: leaveGame }, { label: 'Rematch', primary: true, run: rematch }]
    });
  }

  function maybeAi() {
    if (G.mode !== 'ai' || G.over || G.turn === G.me) return;
    var token = G, delay = [2200, 1500, 1000][G.aiLevel] + Math.random() * 900;
    setTimeout(function step() {
      if (G !== token || G.over || G.turn === G.me) return;
      if (G.paused || !$('modal').hidden) { setTimeout(step, 400); return; }
      var pr = M.aiPick(G.lay, G.present, G.kinds, G.aiLevel);
      if (!pr) { passTurn(); return; }
      G.sel = pr[0]; board.sel = pr[0]; board.invalidate(); A.select();
      setTimeout(function () { if (G === token && !G.over) applyMatch(pr[0], pr[1], true); }, 450);
    }, delay);
  }

  // ------------------------------------------------------------- input
  function applyMatch(a, b, remote) {
    G.present[a] = 0; G.present[b] = 0; G.left -= 2;
    G.sel = -1; board.sel = -1;
    var turns = isTurns(), kind = G.kinds[a];
    var nextCombo = !turns && performance.now() - G.lastMatch < COMBO_MS ? G.combo + 1 : 1;
    var power = turns ? M.points(kind) : Math.min(4, 1 + (nextCombo - 1) * 0.3);
    board.matched(a, b, turns ? COLORS[G.turn] : currentTheme().accent, power, function () {
      A.slam(power, turns ? M.points(kind) : G.combo);
      buzz(power > 2 ? [25, 30, 25] : 22);
    });
    if (isTurns()) turnsMatch(a, b, remote); else timedMatch(a, b);
  }

  function onTileTap(i) {
    if (G.over || !G.lay || board.busy()) return;
    if (isTurns() && G.mode !== 'local' && G.turn !== G.me) { toast('Wait for your turn.', 1100); return; }
    if (!M.isFree(G.lay, G.present, i)) { A.blocked(); board.wrong(i); buzz([15, 40, 15]); return; }
    if (G.sel === i) { G.sel = -1; board.sel = -1; board.partners = []; board.invalidate(); return; }
    if (G.sel >= 0 && G.kinds[G.sel] === G.kinds[i]) { applyMatch(G.sel, i, false); return; }
    G.sel = i; board.sel = i; board.hover = -1; board.invalidate(); A.select(); buzz(6);
    board.partners = board.showFree ? M.freeTiles(G.lay, G.present).filter(function (j) { return j !== i && G.kinds[j] === G.kinds[i]; }) : [];
  }

  function rematch() {
    if (G.mode === 'online') {
      if (!Net.conn) { toast('Your rival has left the room.'); return; }
      if (Net.isHost) hostStart(); else { Net.send({ t: 'rematch' }); toast('Rematch requested. Waiting for the host…'); }
      return;
    }
    startTurns({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: 0, first: 1 - G.first, seed: Math.floor(Math.random() * 1e9) });
  }

  function leaveGame() {
    if (G.mode === 'online') Net.close();
    G = { mode: null };
    show('home');
  }

  // ------------------------------------------------------------- online
  var lobby = { duel: store.duel, size: store.size };
  var DUEL_DESC = {
    race: 'Same board for both of you, side by side. First to clear it wins.',
    turns: 'One shared board. Take turns making one match each. Highest score wins.'
  };
  function onlineSupported() { return Net.available() && typeof RTCPeerConnection === 'function'; }
  function setLobbyStatus(msg, isError) { var s = $('lobby-status'); s.textContent = msg; s.classList.toggle('error', !!isError); }
  function syncLobbyChips() {
    document.querySelectorAll('#pick-duel .chip').forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.v === lobby.duel)); });
    document.querySelectorAll('#pick-size .chip').forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.v === lobby.size)); });
    $('duel-desc').textContent = DUEL_DESC[lobby.duel];
  }
  function openLobby() {
    show('lobby'); $('host-box').hidden = true; syncLobbyChips();
    if (!onlineSupported()) setLobbyStatus('Online play is not available here. Open the game from its own web address with an internet connection.', true);
    else setLobbyStatus('');
  }

  function startOnline(m, me) {
    if (m.duel === 'race') {
      startTimed(M.generateDuel(m.seed, m.size), { mode: 'online', duel: 'race', me: me, size: m.size, title: 'Race · Room ' + Net.code });
    } else {
      startTurns({ mode: 'online', size: m.size, seed: m.seed, first: m.first, me: me });
    }
  }
  function hostStart() {
    var prevFirst = G && G.mode === 'online' && typeof G.first === 'number' ? G.first : 1;
    var m = { t: 'start', duel: lobby.duel, size: lobby.size, seed: Math.floor(Math.random() * 1e9), first: 1 - prevFirst };
    Net.send(m);
    startOnline(m, 0);
  }

  Net.onStatus = function (state, info) {
    if (state === 'hosting') { $('room-code').textContent = info; $('host-box').hidden = false; setLobbyStatus('Waiting for a friend to join…'); }
    else if (state === 'connecting') setLobbyStatus('Connecting to room ' + info + '…');
    else if (state === 'connected') { setLobbyStatus('Connected!'); if (Net.isHost) { G = { mode: null }; hostStart(); } }
    else if (state === 'closed') {
      if (G.mode === 'online' && !$('game').hidden) {
        G.over = true;
        modal({ title: 'Rival left', body: 'The other player disconnected.', actions: [{ label: 'Menu', primary: true, run: leaveGame }] });
      }
    } else if (state === 'error') { if (!$('lobby').hidden) setLobbyStatus(info, true); else toast(info, 3500); }
  };

  Net.onMessage = function (m) {
    if (m.t === 'start' && !Net.isHost && (m.duel === 'race' || m.duel === 'turns') && (m.size === 'small' || m.size === 'big')) {
      startOnline(m, 1);
    } else if (G.mode !== 'online') {
      return;
    } else if (m.t === 'match' && isTurns() && !G.over && m.k === G.moveNo && G.turn !== G.me) {
      var a = m.a, b = m.b;
      if (G.present[a] && G.present[b] && a !== b && G.kinds[a] === G.kinds[b] && M.isFree(G.lay, G.present, a) && M.isFree(G.lay, G.present, b)) applyMatch(a, b, true);
    } else if (m.t === 'pass' && isTurns() && !G.over && m.k === G.moveNo && G.turn !== G.me) {
      passTurn();
    } else if (m.t === 'prog' && G.duel === 'race') {
      G.rival.left = m.left | 0; G.rival.score = m.score | 0; updateTimedHud();
    } else if (m.t === 'done' && G.duel === 'race') {
      G.rival.done = true; G.rival.left = 0; updateTimedHud();
      if (!G.won) {
        G.over = true; A.lose();
        modal({ title: 'Rival cleared it first', body: 'You had ' + G.left + ' tiles left.', actions: [{ label: 'Menu', run: leaveGame }, { label: 'Rematch', primary: true, run: rematch }] });
      }
    } else if (m.t === 'out' && G.duel === 'race') {
      G.rival.out = true; G.rival.left = m.left | 0; G.rival.score = m.score | 0; updateTimedHud();
      if (G.over) resolveRace(); else toast('Your rival is out. Clear the board to win!', 3000);
    } else if (m.t === 'rematch' && Net.isHost && G.over) {
      hostStart();
    } else if (m.t === 'emote' && typeof m.e === 'string') {
      showEmote(m.e.slice(0, 4), false);
    }
  };

  function showEmote(e, mine) {
    var w = $('board-wrap').getBoundingClientRect();
    floatText(e, w.width * (mine ? 0.3 : 0.7), w.height * 0.45, true, mine ? COLORS[G.me || 0] : COLORS[1 - (G.me || 0)]);
    A.pop();
  }
  function copyText(text, label) {
    var done = function () { toast(label + ' copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text, 4000); });
    else toast(text, 4000);
  }

  // ------------------------------------------------------------- pause & settings
  function canPause() { return !$('game').hidden && G.lay && !G.over && (G.mode === 'journey' || G.mode === 'daily' || G.mode === 'local' || G.mode === 'ai'); }
  function pauseGame() {
    if (!canPause() || !$('modal').hidden) return;
    var turnLeft = isTurns() ? G.turnEnd - performance.now() : 0;
    G.paused = true;
    var resume = function () { G.paused = false; if (isTurns()) G.turnEnd = performance.now() + turnLeft; };
    var restart = function () {
      G.paused = false;
      if (G.mode === 'journey') startLevel(G.level); else if (G.mode === 'daily') startDaily();
      else startTurns({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: G.me, first: G.first, seed: Math.floor(Math.random() * 1e9) });
    };
    var info = document.createElement('div'); info.className = 'pause-info';
    if (!isTurns()) info.appendChild(resultGrid([['Time left', fmtTime(G.timeLeft)], ['Tiles left', G.left]]));
    else info.appendChild(resultGrid([[G.names[0], G.scores[0] + ' pts'], [G.names[1], G.scores[1] + ' pts']]));
    modal({
      title: 'Paused', body: info, back: function () { closeModal(); resume(); },
      actions: [
        { label: 'Quit', run: function () { G.paused = false; leaveGame(); } },
        { label: 'Restart', run: restart },
        { label: 'Settings', run: function () { G.paused = false; openSettings(pauseGame); } },
        { label: 'Resume', primary: true, run: resume }
      ]
    });
  }

  function toggleRow(label, on, onChange) {
    var row = document.createElement('button'); row.type = 'button'; row.className = 'setting-row';
    row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(on));
    row.innerHTML = '<span></span><i class="switch" aria-hidden="true"></i>';
    row.firstChild.textContent = label;
    row.addEventListener('click', function () { on = !on; row.setAttribute('aria-checked', String(on)); onChange(on); });
    return row;
  }
  function linkRow(label, fn) {
    var row = document.createElement('button'); row.type = 'button'; row.className = 'setting-row link-row';
    row.innerHTML = '<span></span><i aria-hidden="true">›</i>'; row.firstChild.textContent = label;
    row.addEventListener('click', fn);
    return row;
  }
  function openSettings(after) {
    var box = document.createElement('div'); box.className = 'settings';
    box.appendChild(toggleRow('Sound effects', store.sound, function (v) { store.sound = v; A.setEnabled(v); save(); if (v) A.select(); }));
    box.appendChild(toggleRow('Vibration', store.vibrate, function (v) { store.vibrate = v; save(); buzz(20); }));
    box.appendChild(linkRow('Tile sets', function () { closeModal(); openThemes(); }));
    box.appendChild(linkRow('How to play', function () { closeModal(); howTo(after); }));
    box.appendChild(linkRow('Privacy policy', function () { window.open(PRIVACY_URL, '_blank'); }));
    if (Ads.hasPrivacyOptions()) box.appendChild(linkRow('Ad privacy choices', function () { Ads.showPrivacyOptions(); }));
    var ver = document.createElement('p'); ver.className = 'version'; ver.textContent = 'Jade Rush';
    Shell.versionName().then(function (v) { ver.textContent = 'Jade Rush ' + (v === 'web' ? '· web' : v); });
    box.appendChild(ver);
    var done = function () { refreshHome(); if (after) after(); };
    modal({ title: 'Settings', body: box, back: function () { closeModal(); done(); }, actions: [{ label: 'Done', primary: true, run: done }] });
  }

  // ------------------------------------------------------------- tile sets
  function drawPreview(canvas, theme) {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    var pb = new window.TileBoard(canvas), g = canvas.getContext('2d');
    pb.setTheme(theme); pb.dpr = dpr;
    pb.fh = r.height * 0.8; pb.fw = pb.fh / 1.3; pb.dz = pb.fw * 0.1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var total = pb.fw * 3 + 8, x0 = (r.width - total) / 2;
    [31, 4, 9].forEach(function (kind, k) {
      pb.drawTile(g, { x: x0 + k * (pb.fw + 4), y: 2 + (k === 1 ? 0 : pb.dz * 0.6), w: pb.fw, h: pb.fh }, kind, { variant: k });
    });
  }
  function openThemes() {
    var stars = totalStars(), cur = currentTheme(), box = document.createElement('div');
    box.style.display = 'grid'; box.style.gap = '12px';
    var p = document.createElement('p'); p.textContent = 'You have ' + stars + ' ★. Clear levels with more stars to unlock new sets.';
    var grid = document.createElement('div'); grid.className = 'themes';
    THEMES.forEach(function (t) {
      var locked = stars < t.stars, b = document.createElement('button');
      b.className = 'theme-card'; b.type = 'button'; b.disabled = locked;
      b.setAttribute('aria-pressed', String(t.id === cur.id));
      b.innerHTML = '<canvas></canvas><b></b><small></small>';
      b.querySelector('b').textContent = t.name;
      b.querySelector('small').textContent = locked ? '★ ' + t.stars + ' to unlock' : t.id === cur.id ? 'In use' : 'Tap to use';
      b.addEventListener('click', function () { store.theme = t.id; save(); applyTheme(); A.select(); openThemes(); });
      grid.appendChild(b);
    });
    box.appendChild(p); box.appendChild(grid);
    modal({ title: 'Tile sets', body: box, actions: [{ label: 'Done', primary: true, run: refreshHome }] });
    requestAnimationFrame(function () {
      grid.querySelectorAll('canvas').forEach(function (c, k) { drawPreview(c, THEMES[k]); });
    });
  }

  // ------------------------------------------------------------- how to play
  function howTo(after) {
    var ol = document.createElement('ol'); ol.className = 'howto';
    [
      'Tap two matching tiles to remove them.',
      'Only free tiles can be used: nothing on top, and an open left or right side.',
      'Most kinds have four copies. Pick the wrong pair and you can trap yourself, so look ahead.',
      'Match within 5 seconds of your last match to build a combo multiplier.',
      'Beat the clock. Hints cost 10 seconds and shuffles are limited. Later levels stop highlighting free tiles.',
      'Duels: Race the same board, or take turns on one board (15 seconds a turn, winds and dragons score 2).'
    ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    modal({ title: 'How to play', body: ol, actions: [{ label: 'Got it', primary: true, run: after }] });
  }

  // ------------------------------------------------------------- wiring
  $('btn-continue').addEventListener('click', function () { startLevel(store.level); });
  $('btn-levels').addEventListener('click', function () { show('levels'); renderLevelGrid(); });
  $('btn-daily').addEventListener('click', startDaily);
  $('btn-local').addEventListener('click', function () {
    var size = store.size;
    modal({
      title: 'Pass & play', body: chipGroup('Board', [['small', 'Compact'], ['big', 'Grand']], size, function (v) { size = v; }),
      actions: [{ label: 'Cancel' }, { label: 'Start duel', primary: true, run: function () { store.size = size; save(); startTurns({ mode: 'local', size: size, first: 0, me: 0, seed: Math.floor(Math.random() * 1e9) }); } }]
    });
  });
  $('btn-ai').addEventListener('click', function () {
    var size = store.size, lvl = store.aiLevel, box = document.createElement('div');
    box.style.display = 'grid'; box.style.gap = '14px';
    box.appendChild(chipGroup('Difficulty', [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']], lvl, function (v) { lvl = v; }));
    box.appendChild(chipGroup('Board', [['small', 'Compact'], ['big', 'Grand']], size, function (v) { size = v; }));
    modal({
      title: 'Vs computer', body: box,
      actions: [{ label: 'Cancel' }, { label: 'Start duel', primary: true, run: function () { store.size = size; store.aiLevel = lvl; save(); startTurns({ mode: 'ai', size: size, aiLevel: lvl, first: 0, me: 0, seed: Math.floor(Math.random() * 1e9) }); } }]
    });
  });
  $('btn-online').addEventListener('click', openLobby);
  $('btn-howto').addEventListener('click', function () { howTo(); });
  $('btn-settings').addEventListener('click', function () { openSettings(); });
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { if (!$('lobby').hidden) Net.close(); show('home'); });
  });
  $('level-grid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-level]'); if (b && !b.disabled) startLevel(Number(b.dataset.level));
  });
  $('btn-quit').addEventListener('click', function () {
    if (canPause()) { pauseGame(); return; }
    if (G.mode === 'online' && !G.over) modal({ title: 'Leave the match?', body: 'Your rival wins if you leave.', actions: [{ label: 'Stay' }, { label: 'Leave', primary: true, run: leaveGame }] });
    else leaveGame();
  });
  $('btn-hint').addEventListener('click', useHint);
  $('btn-shuffle').addEventListener('click', useShuffle);
  $('board').addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !G.lay || G.over || board.busy()) return;
    board.setHover(board.hit(e.clientX, e.clientY));
    $('board').style.cursor = board.hover >= 0 ? 'pointer' : 'default';
  });
  $('board').addEventListener('pointerleave', function () { board.setHover(-1); });
  $('btn-themes').addEventListener('click', openThemes);
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.cta, .tile, .primary, .ghost, .chip, .theme-card, .lvl');
    if (!b || b.disabled || reduced) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), sp = document.createElement('span');
    sp.className = 'ripple'; sp.style.width = sp.style.height = s + 'px';
    sp.style.left = (e.clientX - r.left - s / 2) + 'px'; sp.style.top = (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(sp); setTimeout(function () { sp.remove(); }, 600);
  });
  $('board').addEventListener('pointerdown', function (e) {
    A.unlock();
    var i = board.hit(e.clientX, e.clientY);
    if (i >= 0) onTileTap(i);
  });
  ['pick-duel', 'pick-size'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      if (id === 'pick-duel') lobby.duel = store.duel = c.dataset.v; else lobby.size = store.size = c.dataset.v;
      save(); syncLobbyChips();
    });
  });
  $('btn-host').addEventListener('click', function () { if (!onlineSupported()) return; setLobbyStatus('Creating room…'); Net.host(); });
  $('join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!onlineSupported()) return;
    var code = $('join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { setLobbyStatus('Room codes are 5 letters or numbers.', true); return; }
    Net.join(code);
  });
  $('btn-copy-code').addEventListener('click', function () { copyText(Net.code, 'Room code'); });
  $('btn-copy-link').addEventListener('click', function () { copyText(location.origin + location.pathname + '?room=' + Net.code, 'Invite link'); });
  $('emotes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-emote]'); if (!b) return;
    Net.send({ t: 'emote', e: b.dataset.emote }); showEmote(b.dataset.emote, true);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden && G.mode !== 'online') closeModal(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
  Shell.onPause(pauseGame);
  Shell.onBack(function () {
    if (!$('modal').hidden) { if (modal.back) modal.back(); else closeModal(); return true; }
    if (!$('game').hidden) { $('btn-quit').click(); return true; }
    if (!$('levels').hidden || !$('lobby').hidden) { if (!$('lobby').hidden) Net.close(); show('home'); return true; }
    return false;
  });
  window.addEventListener('pointerdown', function () { A.unlock(); }, { once: true });
  if (window.ResizeObserver) new ResizeObserver(function () { board.resize(); }).observe($('board-wrap'));
  else window.addEventListener('resize', function () { board.resize(); });

  // ------------------------------------------------------------- home demo
  var demo = new window.TileBoard($('demo')), D = { n: 0, next: 0 };
  function newDemo() {
    var spec = { cols: 5, rows: 3, layers: 2, carve: 0, stack: 0.7, target: 0 };
    var g = M.generate(spec, 'demo-' + (D.n++ % 9));
    D.g = g; D.present = new Uint8Array(g.layout.n).fill(1); D.sol = g.solution.slice(); D.step = 0;
    demo.set(g.layout, g.kinds, D.present, false);
    D.next = performance.now() + 1200;
  }
  function stepDemo(now) {
    if (now < D.next) return;
    if (!D.sol.length) { newDemo(); return; }
    var pr = D.sol[0];
    if (D.step === 0) { demo.sel = pr[0]; demo.invalidate(); D.step = 1; D.next = now + 420; }
    else { D.present[pr[0]] = 0; D.present[pr[1]] = 0; demo.sel = -1; demo.matched(pr[0], pr[1]); D.sol.shift(); D.step = 0; D.next = now + (D.sol.length ? 650 : 1600); }
  }

  // ------------------------------------------------------------- loop & boot
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(250, now - last); last = now;
    sky.frame(now);
    confetti.frame(dt);
    if (!$('home').hidden) { stepDemo(now); demo.frame(now); }
    if (!$('game').hidden && G.lay && !isTurns() && G.limit) {
      if (G.shownScore !== G.score) {
        G.shownScore += Math.max(1, Math.ceil((G.score - G.shownScore) * 0.18));
        if (G.shownScore > G.score) G.shownScore = G.score;
        $('score').textContent = G.shownScore;
      }
      var win = G.lastMatch ? 1 - (now - G.lastMatch) / COMBO_MS : 0;
      $('combo-bar').style.width = Math.max(0, win * 100) + '%';
      if (win <= 0 && G.combo > 0 && !G.over) { G.combo = 0; setHeat(0); updateTimedHud(); }
    }
    if (!$('game').hidden && G.lay) { tickTimed(dt); tickTurns(now); board.frame(now); }
    requestAnimationFrame(loop);
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 24px "Noto Serif SC"', '萬中發東南西北').then(function () { board.clearSprites(); demo.clearSprites(); }, function () {});
  }

  window.JadeRush = { state: function () { return G; }, board: board }; // read-only hook for automated tests

  applyTheme();
  Shell.styleBars(currentTheme().bg[0]);
  show('home');
  var hideLoader = function () { var l = $('loader'); if (l && !l.classList.contains('done')) { l.classList.add('done'); setTimeout(function () { l.remove(); }, 500); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(hideLoader, 250); });
  setTimeout(hideLoader, 1500);
  demo.resize(); newDemo();
  requestAnimationFrame(loop);
  var room = new URLSearchParams(location.search).get('room');
  if (room && /^[A-Za-z0-9]{5}$/.test(room)) {
    openLobby(); $('join-code').value = room.toUpperCase();
    if (onlineSupported()) Net.join(room);
  }
})();
