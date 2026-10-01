/* Nova Chain — app controller: screens, game modes, persistence, online sync. */
(function () {
  'use strict';
  var E = window.NovaEngine, R = window.NovaRender, A = window.NovaAudio, Net = window.NovaNet;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------- storage
  var SAVE_KEY = 'novachain.v1';
  var store = { level: 1, stars: {}, hints: 3, sound: true, daily: {}, streak: { last: '', n: 0 }, wins: { ai: 0, online: 0 }, aiLevel: 1, size: '6x9' };
  try { Object.assign(store, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ } }
  function totalStars() { var s = 0; for (var k in store.stars) s += store.stars[k]; return s; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  A.setEnabled(store.sound);

  // ------------------------------------------------------------- screens
  var screens = ['home', 'levels', 'lobby', 'game'];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    if (id === 'home') refreshHome();
    if (id === 'game') requestAnimationFrame(function () { view.layout(); });
  }

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }

  function modal(opts) {
    $('modal-title').textContent = opts.title;
    var body = $('modal-body');
    body.innerHTML = '';
    if (typeof opts.body === 'string') { var p = document.createElement('p'); p.textContent = opts.body; body.appendChild(p); }
    else if (opts.body) body.appendChild(opts.body);
    var st = $('modal-stars');
    st.hidden = opts.stars == null;
    if (opts.stars != null) st.innerHTML = [1, 2, 3].map(function (k) { return '<span class="' + (k <= opts.stars ? 'on' : '') + '">★</span>'; }).join('');
    var act = $('modal-actions');
    act.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = a.primary ? 'primary' : 'ghost';
      b.textContent = a.label;
      b.addEventListener('click', function () { if (!a.keep) closeModal(); a.run && a.run(); });
      act.appendChild(b);
    });
    $('modal').hidden = false;
    var first = act.querySelector('.primary') || act.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeModal() { $('modal').hidden = true; }

  function chipGroup(label, options, value, onPick) {
    var wrap = document.createElement('div'); wrap.className = 'opt-group';
    var l = document.createElement('span'); l.textContent = label; wrap.appendChild(l);
    var row = document.createElement('div'); row.className = 'size-pick'; row.setAttribute('role', 'radiogroup');
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.setAttribute('role', 'radio');
      b.textContent = o[1]; b.setAttribute('aria-checked', String(o[0] === value));
      b.addEventListener('click', function () {
        row.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true'); onPick(o[0]);
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  // ------------------------------------------------------------- home
  function refreshHome() {
    var stars = totalStars(), d = store.daily[today()];
    $('continue-label').textContent = 'Level ' + store.level;
    $('continue-meta').textContent = 'Endless levels · ' + stars + ' ★ collected';
    $('levels-meta').textContent = (store.level - 1) + ' cleared';
    $('daily-meta').textContent = d ? 'Done today · ' + '★★★'.slice(0, d) : store.streak.n > 1 && store.streak.last === yesterday() ? store.streak.n + '-day streak' : 'New puzzle every day';
    $('ai-meta').textContent = store.wins.ai ? store.wins.ai + ' wins' : '3 levels';
    $('btn-sound').textContent = store.sound ? 'Sound on' : 'Sound off';
    $('btn-sound').setAttribute('aria-pressed', String(store.sound));
  }
  function yesterday() { var d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function renderLevelGrid() {
    var grid = $('level-grid'), max = store.level + 5, html = '';
    for (var L = 1; L <= max; L++) {
      var s = store.stars[L] || 0, locked = L > store.level;
      html += '<button class="lvl' + (L === store.level ? ' current' : '') + '" data-level="' + L + '"' + (locked ? ' disabled' : '') + '>' + L +
        '<small>' + (locked ? '' : '★★★'.slice(0, s) || '·') + '</small></button>';
    }
    grid.innerHTML = html;
    $('levels-stars').textContent = totalStars() + ' ★';
    var cur = grid.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------- game state
  var view = new R.BoardView($('board'));
  var G = { mode: null, busy: false };

  function simulate(b, i, player, stop) {
    b.n[i]++; b.o[i] = player;
    var start = R.snap(b), frames = [];
    E.resolve(b, player, function (ex) { frames.push({ ex: ex, snap: R.snap(b) }); }, stop);
    return { start: start, frames: frames };
  }

  var hooks = {
    onWave: function (k, size) {
      A.burst(k);
      if (k < 6 && navigator.vibrate) { try { navigator.vibrate(size > 3 ? 14 : 6); } catch (e) { /* not allowed */ } }
    }
  };

  // ------------------------------------------------------------- journey
  function startPuzzle(level, daily) {
    G = { mode: daily ? 'daily' : 'puzzle', busy: true, level: level };
    $('game-title').textContent = daily ? 'Daily spark' : 'Level ' + level;
    $('hud-puzzle').hidden = false; $('hud-versus').hidden = true;
    $('btn-undo').hidden = false; $('btn-hint').hidden = false; $('btn-restart').hidden = false;
    $('emotes').hidden = true; $('goal').hidden = false;
    $('goal').textContent = 'Building level…';
    show('game');
    setTimeout(function () {
      var gen = daily ? E.generateDaily(today()) : E.generateLevel(level);
      G.initial = gen.board; G.board = gen.board.clone(); G.par = gen.par;
      G.limit = gen.par + 2; G.used = 0; G.history = []; G.busy = false;
      view.setBoard(G.board, 'puzzle');
      $('goal').textContent = goalText();
      updatePuzzleHud();
      if (!daily) setTimeout(function () { E.generateLevel(level + 1); }, 400); // warm the next level
      if (!daily && level === 1 && !store.seenHowto) { store.seenHowto = true; save(); howTo(); }
    }, 30);
  }

  function goalText() {
    if (G.mode === 'puzzle' && G.level <= 2) return 'Tap a cell. Full cells burst into their neighbours. Light every cell.';
    return 'Light every cell. ' + G.par + (G.par === 1 ? ' tap' : ' taps') + ' for 3 ★.';
  }

  function updatePuzzleHud() {
    var html = '';
    for (var k = 0; k < G.limit; k++) html += '<i class="' + (k < G.par ? 'par' : '') + (k < G.used ? ' used' : '') + '"></i>';
    $('taps').innerHTML = html;
    var lit = G.board.litCount(), total = G.board.t.cells.length;
    $('lit-text').textContent = lit + '/' + total;
    $('lit-fill').style.width = (100 * lit / total) + '%';
    $('btn-undo').disabled = !G.history.length;
    $('hint-count').textContent = store.hints;
  }

  function puzzleTap(i) {
    if (G.busy || G.used >= G.limit) return;
    G.history.push(G.board.clone());
    G.used++; G.busy = true; view.hint = -1;
    A.place();
    var b = G.board, sim = simulate(b, i, 0, function () { return b.allLit(); });
    updatePuzzleHud();
    view.play(i, 0, sim.start, sim.frames, hooks).then(function () {
      G.busy = false;
      updatePuzzleHud();
      if (b.allLit()) setTimeout(puzzleWon, 350);
      else if (G.used >= G.limit) setTimeout(puzzleFailed, 350);
    });
  }

  function puzzleWon() {
    var stars = G.used <= G.par ? 3 : G.used === G.par + 1 ? 2 : 1;
    A.win();
    var bonus = '';
    if (G.mode === 'daily') {
      var d = today(), prev = store.daily[d] || 0;
      store.daily[d] = Math.max(prev, stars);
      if (!prev) { store.streak = { last: d, n: store.streak.last === yesterday() ? store.streak.n + 1 : 1 }; }
    } else {
      var before = store.stars[G.level] || 0;
      if (stars > before) store.stars[G.level] = stars;
      if (stars === 3 && before < 3 && store.hints < 9) { store.hints++; bonus = ' +1 hint for a perfect clear.'; }
      if (G.level === store.level) store.level++;
    }
    save();
    var title = G.used < G.par ? 'Beat par!' : stars === 3 ? 'Perfect chain' : G.mode === 'daily' ? 'Daily cleared' : 'Level ' + G.level + ' cleared';
    var body = G.used + (G.used === 1 ? ' tap' : ' taps') + ' · par ' + G.par + '.' + bonus;
    if (G.mode === 'daily') body += ' Streak: ' + store.streak.n + (store.streak.n === 1 ? ' day.' : ' days.');
    var actions = G.mode === 'daily'
      ? [{ label: 'Menu', run: function () { show('home'); } }, { label: 'Play journey', primary: true, run: function () { startPuzzle(store.level); } }]
      : [{ label: 'Replay', run: function () { startPuzzle(G.level); } }, { label: 'Next level', primary: true, run: function () { startPuzzle(G.level + 1); } }];
    modal({ title: title, stars: stars, body: body, actions: actions });
  }

  function puzzleFailed() {
    A.lose();
    var lit = G.board.litCount(), total = G.board.t.cells.length;
    modal({
      title: 'Out of taps',
      body: lit + ' of ' + total + ' cells lit. ' + (total - lit === 1 ? 'One cell to go.' : (total - lit) + ' cells to go.'),
      actions: [
        { label: 'Undo last tap', run: undo },
        { label: 'Retry', primary: true, run: restartPuzzle }
      ]
    });
  }

  function undo() {
    if (G.busy || !G.history.length) return;
    G.board = G.history.pop(); G.used--;
    view.sync(G.board); view.hint = -1;
    updatePuzzleHud();
  }

  function restartPuzzle() {
    if (G.busy) return;
    G.board = G.initial.clone(); G.used = 0; G.history = [];
    view.setBoard(G.board, 'puzzle');
    updatePuzzleHud();
  }

  function hint() {
    if (G.busy) return;
    if (store.hints <= 0) { toast('No hints left. Every new 3 ★ clear earns one.'); return; }
    var left = G.limit - G.used;
    var sol = left > 0 ? E.solvePuzzle(G.board, left, 12) : null;
    if (!sol || !sol.length) { toast('No win from here. Undo or restart.'); return; }
    view.hint = sol[0]; store.hints--; save();
    updatePuzzleHud();
  }

  // ------------------------------------------------------------- duel
  var NAMES = ['Cyan', 'Rose'];

  function startVersus(cfg) {
    var dims = cfg.size.split('x').map(Number);
    G = {
      mode: cfg.mode, busy: false, over: false, size: cfg.size, aiLevel: cfg.aiLevel,
      first: cfg.first, turn: cfg.first, moves: 0, me: cfg.me, queue: [],
      board: new E.Board(new E.Topology(dims[0], dims[1]))
    };
    G.names = cfg.mode === 'local' ? NAMES.slice()
      : cfg.mode === 'ai' ? ['You', 'Nova AI']
      : cfg.me === 0 ? ['You', 'Rival'] : ['Rival', 'You'];
    $('game-title').textContent = cfg.mode === 'online' ? 'Room ' + Net.code : cfg.mode === 'ai' ? 'Vs Nova AI · ' + ['Easy', 'Normal', 'Hard'][cfg.aiLevel] : 'Pass & play';
    $('hud-puzzle').hidden = true; $('hud-versus').hidden = false;
    $('btn-undo').hidden = true; $('btn-hint').hidden = true; $('btn-restart').hidden = cfg.mode === 'online';
    $('emotes').hidden = cfg.mode !== 'online';
    $('goal').hidden = cfg.mode === 'online';
    $('goal').textContent = 'Tap an empty cell or one of yours. Capture every enemy orb to win.';
    $('pname-0').textContent = G.names[0]; $('pname-1').textContent = G.names[1];
    show('game');
    view.setBoard(G.board, 'versus');
    view.turn = G.turn;
    updateVersusHud();
    maybeAi();
  }

  function updateVersusHud() {
    $('pcount-0').textContent = G.board.count(0);
    $('pcount-1').textContent = G.board.count(1);
    $('chip-0').classList.toggle('active', G.turn === 0 && !G.over);
    $('chip-1').classList.toggle('active', G.turn === 1 && !G.over);
    var who = G.names[G.turn];
    $('turn-note').textContent = G.over ? 'Game over' : who === 'You' ? 'Your move' : who + (G.mode === 'local' ? ' to move' : ' is thinking…');
  }

  function versusTap(i, remote) {
    if (G.over) return;
    if (G.busy) return;
    var p = G.turn;
    if (!remote && G.mode !== 'local' && p !== G.me) { toast('Wait for your turn.', 1200); return; }
    if (G.board.o[i] !== -1 && G.board.o[i] !== p) { A.invalid(); view.shake = 5; return; }
    if (G.mode === 'online' && !remote) Net.send({ t: 'move', i: i, k: G.moves });
    G.busy = true;
    A.place();
    var b = G.board, oppMoved = G.moves >= 1;
    var sim = simulate(b, i, p, oppMoved ? function () { return b.count(1 - p) === 0; } : null);
    view.play(i, p, sim.start, sim.frames, hooks).then(function () {
      G.moves++;
      if (G.moves >= 2 && b.count(1 - p) === 0) { G.busy = false; versusOver(p); return; }
      G.turn = 1 - p; view.turn = G.turn;
      G.busy = false;
      updateVersusHud();
      maybeAi();
      drainRemote();
    });
    updateVersusHud();
  }

  function maybeAi() {
    if (G.mode !== 'ai' || G.over || G.turn === G.me) return;
    var token = G;
    setTimeout(function () {
      if (G !== token || G.over || G.busy) return;
      var i = E.aiMove(G.board, G.turn, G.aiLevel, G.moves >= 1);
      versusTap(i, true);
    }, 380 + Math.random() * 300);
  }

  function drainRemote() {
    if (G.mode !== 'online' || G.busy || G.over || !G.queue.length) return;
    var m = G.queue.shift();
    if (m.k === G.moves && G.turn !== G.me) versusTap(m.i, true);
  }

  function versusOver(winner) {
    G.over = true;
    updateVersusHud();
    var mine = G.mode === 'local' || winner === G.me;
    if (mine) A.win(); else A.lose();
    if (G.mode === 'ai' && winner === G.me) { store.wins.ai++; save(); }
    if (G.mode === 'online' && winner === G.me) { store.wins.online++; save(); }
    var title = G.mode === 'local' ? G.names[winner] + ' wins!' : winner === G.me ? 'You win!' : G.names[winner] + ' wins';
    modal({
      title: title,
      body: 'Every enemy orb captured in ' + G.moves + ' moves.',
      actions: [
        { label: 'Menu', run: leaveGame },
        { label: 'Rematch', primary: true, run: rematch }
      ]
    });
  }

  function rematch() {
    if (G.mode === 'online') {
      if (!Net.conn) { toast('Your rival has left the room.'); return; }
      if (Net.isHost) hostStartRound(); else { Net.send({ t: 'rematch' }); toast('Rematch requested. Waiting for host…'); }
      return;
    }
    startVersus({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: G.me, first: 1 - G.first });
  }

  function leaveGame() {
    if (G.mode === 'online') { Net.close(); G.mode = null; }
    show('home');
  }

  // ------------------------------------------------------------- online
  var lobbySize = store.size || '6x9';
  function onlineSupported() { return Net.available() && typeof RTCPeerConnection === 'function'; }

  function setLobbyStatus(msg, isError) {
    var s = $('lobby-status');
    s.textContent = msg; s.classList.toggle('error', !!isError);
  }

  function openLobby() {
    show('lobby');
    $('host-box').hidden = true;
    document.querySelectorAll('#lobby .size-pick .chip').forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.size === lobbySize)); });
    if (!onlineSupported()) setLobbyStatus('Online play is not available here. Open the game from its own web address with an internet connection.', true);
    else setLobbyStatus('');
  }

  function hostStartRound() {
    var first = G && G.mode === 'online' ? 1 - G.first : (Math.random() < 0.5 ? 0 : 1);
    Net.send({ t: 'start', size: lobbySize, first: first });
    closeModal();
    startVersus({ mode: 'online', size: lobbySize, first: first, me: 0 });
  }

  Net.onStatus = function (state, info) {
    if (state === 'hosting') {
      $('room-code').textContent = info; $('host-box').hidden = false;
      setLobbyStatus('Waiting for a friend to join…');
    } else if (state === 'connecting') {
      setLobbyStatus('Connecting to room ' + info + '…');
    } else if (state === 'connected') {
      setLobbyStatus('Connected!');
      if (Net.isHost) { G = { mode: null }; hostStartRound(); }
    } else if (state === 'closed') {
      if (G.mode === 'online' && !$('game').hidden) {
        G.over = true;
        modal({ title: 'Rival left', body: 'The other player disconnected.', actions: [{ label: 'Menu', primary: true, run: leaveGame }] });
      }
    } else if (state === 'error') {
      if (!$('lobby').hidden) setLobbyStatus(info, true); else toast(info, 3500);
    }
  };

  Net.onMessage = function (m) {
    if (m.t === 'start' && !Net.isHost && /^\d+x\d+$/.test(m.size)) {
      closeModal();
      startVersus({ mode: 'online', size: m.size, first: m.first ? 1 : 0, me: 1 });
    } else if (m.t === 'move' && G.mode === 'online' && typeof m.i === 'number') {
      G.queue.push(m); drainRemote();
    } else if (m.t === 'rematch' && Net.isHost && G.mode === 'online' && G.over) {
      hostStartRound();
    } else if (m.t === 'emote' && typeof m.e === 'string') {
      showEmote(m.e.slice(0, 4), 'rival');
    } else if (m.t === 'full') {
      setLobbyStatus('That room already has two players.', true);
    }
  };

  function showEmote(e, who) {
    var el = document.createElement('div');
    el.className = 'emote-bubble'; el.textContent = e;
    el.style.left = who === 'me' ? '30%' : '70%';
    el.style.color = (who === 'me') === (G.me === 0) ? 'var(--cyan)' : 'var(--rose)';
    $('emote-layer').appendChild(el);
    setTimeout(function () { el.remove(); }, 1700);
    A.pop();
  }

  function copyText(text, label) {
    var done = function () { toast(label + ' copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text, 4000); });
    else toast(text, 4000);
  }

  // ------------------------------------------------------------- how to play
  function howTo() {
    var ol = document.createElement('ol'); ol.className = 'howto';
    [
      'Tap a cell to drop an orb into it.',
      'The pips show how much a cell holds: 2 in a corner, 3 on an edge, 4 in the middle.',
      'When a cell fills up it bursts, throwing one orb into each neighbour. Bursts trigger more bursts.',
      'Journey: light up every cell before your taps run out. Match par for 3 ★.',
      'Duel: tap empty cells or your own. Bursts capture your rival’s cells. Wipe out every enemy orb to win.'
    ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    modal({ title: 'How to play', body: ol, actions: [{ label: 'Got it', primary: true }] });
  }

  // ------------------------------------------------------------- wiring
  $('btn-continue').addEventListener('click', function () { startPuzzle(store.level); });
  $('btn-levels').addEventListener('click', function () { show('levels'); renderLevelGrid(); });
  $('btn-daily').addEventListener('click', function () { startPuzzle(0, true); });
  $('btn-local').addEventListener('click', function () {
    var size = store.size;
    modal({
      title: 'Pass & play',
      body: chipGroup('Board', [['5x7', 'Compact 5×7'], ['6x9', 'Classic 6×9']], size, function (v) { size = v; }),
      actions: [{ label: 'Cancel' }, { label: 'Start duel', primary: true, run: function () { store.size = size; save(); startVersus({ mode: 'local', size: size, first: 0, me: 0 }); } }]
    });
  });
  $('btn-ai').addEventListener('click', function () {
    var size = store.size, lvl = store.aiLevel, box = document.createElement('div');
    box.style.display = 'grid'; box.style.gap = '14px';
    box.appendChild(chipGroup('Difficulty', [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']], lvl, function (v) { lvl = v; }));
    box.appendChild(chipGroup('Board', [['5x7', 'Compact 5×7'], ['6x9', 'Classic 6×9']], size, function (v) { size = v; }));
    modal({
      title: 'Vs Nova AI', body: box,
      actions: [{ label: 'Cancel' }, { label: 'Start duel', primary: true, run: function () { store.size = size; store.aiLevel = lvl; save(); startVersus({ mode: 'ai', size: size, aiLevel: lvl, first: 0, me: 0 }); } }]
    });
  });
  $('btn-online').addEventListener('click', openLobby);
  $('btn-howto').addEventListener('click', howTo);
  $('btn-sound').addEventListener('click', function () { store.sound = !store.sound; A.setEnabled(store.sound); save(); refreshHome(); });

  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { if (!$('lobby').hidden) Net.close(); show('home'); });
  });
  $('level-grid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-level]');
    if (b && !b.disabled) startPuzzle(Number(b.dataset.level));
  });

  $('btn-quit').addEventListener('click', function () {
    if (G.mode === 'online' && !G.over) {
      modal({ title: 'Leave the match?', body: 'Your rival will win by default.', actions: [{ label: 'Stay' }, { label: 'Leave', primary: true, run: leaveGame }] });
    } else leaveGame();
  });
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', hint);
  $('btn-restart').addEventListener('click', function () {
    if (G.mode === 'puzzle' || G.mode === 'daily') restartPuzzle();
    else if (!G.busy) startVersus({ mode: G.mode, size: G.size, aiLevel: G.aiLevel, me: G.me, first: G.first });
  });

  $('board').addEventListener('pointerdown', function (e) {
    A.unlock();
    var i = view.cellAt(e.clientX, e.clientY);
    if (i < 0 || !G.board) return;
    if (G.mode === 'puzzle' || G.mode === 'daily') puzzleTap(i);
    else if (G.mode) versusTap(i, false);
  });

  document.querySelectorAll('#lobby .size-pick .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      lobbySize = c.dataset.size; store.size = lobbySize; save();
      document.querySelectorAll('#lobby .size-pick .chip').forEach(function (o) { o.setAttribute('aria-checked', String(o === c)); });
    });
  });
  $('btn-host').addEventListener('click', function () {
    if (!onlineSupported()) return;
    setLobbyStatus('Creating room…'); Net.host();
  });
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
    var b = e.target.closest('[data-emote]');
    if (!b) return;
    Net.send({ t: 'emote', e: b.dataset.emote }); showEmote(b.dataset.emote, 'me');
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
  window.addEventListener('pointerdown', function () { A.unlock(); }, { once: true });

  if (window.ResizeObserver) new ResizeObserver(function () { view.layout(); }).observe($('board-wrap'));
  else window.addEventListener('resize', function () { view.layout(); });

  // ------------------------------------------------------------- home demo
  var demo = new R.BoardView($('demo')), demoState = { n: 0, board: null, sol: [], next: 0, busy: false };
  function newDemo() {
    var g = E.generatePuzzle({ w: 4, h: 4, minT: 1, maxT: 2, walls: 0, fill: 0.6 }, 'demo-' + (demoState.n++ % 12));
    demoState.board = g.board.clone(); demoState.sol = g.solution; demoState.next = performance.now() + 900;
    demo.setBoard(demoState.board, 'puzzle');
  }
  function stepDemo(now) {
    if (demoState.busy || now < demoState.next) return;
    var b = demoState.board;
    if (b.allLit() || !demoState.sol.length) { newDemo(); return; }
    var i = demoState.sol.shift();
    demoState.busy = true;
    var sim = simulate(b, i, 0, function () { return b.allLit(); });
    demo.play(i, 0, sim.start, sim.frames).then(function () { demoState.busy = false; demoState.next = performance.now() + (b.allLit() ? 1600 : 900); });
  }

  // ------------------------------------------------------------- sky
  var sky = $('sky'), sg = sky.getContext('2d'), stars = [];
  function sizeSky() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    sky.width = innerWidth * dpr; sky.height = innerHeight * dpr;
    sg.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = [];
    for (var k = 0; k < Math.round(innerWidth * innerHeight / 9000); k++) stars.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.3 + 0.2, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.2 });
  }
  function drawSky(now) {
    var w = innerWidth, h = innerHeight;
    sg.fillStyle = '#0c0a1d'; sg.fillRect(0, 0, w, h);
    var n1 = sg.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, Math.max(w, h) * 0.6);
    n1.addColorStop(0, 'rgba(90,60,170,0.30)'); n1.addColorStop(1, 'rgba(90,60,170,0)');
    sg.fillStyle = n1; sg.fillRect(0, 0, w, h);
    var n2 = sg.createRadialGradient(w * 0.9, h * 0.95, 0, w * 0.9, h * 0.95, Math.max(w, h) * 0.5);
    n2.addColorStop(0, 'rgba(255,120,80,0.14)'); n2.addColorStop(1, 'rgba(255,120,80,0)');
    sg.fillStyle = n2; sg.fillRect(0, 0, w, h);
    for (var k = 0; k < stars.length; k++) {
      var s = stars[k], a = 0.35 + 0.35 * Math.sin(s.p + now / 1000 * s.s);
      sg.fillStyle = 'rgba(239,234,255,' + a + ')';
      sg.beginPath(); sg.arc(s.x, s.y, s.r, 0, 6.283); sg.fill();
    }
  }
  window.addEventListener('resize', sizeSky);
  sizeSky();

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, lastSky = 0;
  function loop(now) {
    if (!reduced || !lastSky) { drawSky(now); lastSky = now; }
    if (!$('home').hidden) { stepDemo(now); demo.frame(now); }
    if (!$('game').hidden) view.frame(now);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- boot
  show('home');
  demo.layout(); newDemo();
  requestAnimationFrame(loop);
  var room = new URLSearchParams(location.search).get('room');
  if (room && /^[A-Za-z0-9]{5}$/.test(room)) {
    openLobby();
    $('join-code').value = room.toUpperCase();
    if (onlineSupported()) Net.join(room);
  }
})();
