/*
 * In-app self-test, used by CI on the iOS simulator (debug builds launched with -JadeSelfTest).
 * Plays through the main flows and prints "SELFTEST PASS|FAIL ..." lines to the console,
 * which Capacitor forwards to the app's stdout. Does nothing in normal use.
 */
(function (global) {
  'use strict';
  var Shell = global.NativeShell;
  if (!Shell || !Shell.isNative) return;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var pass = 0, fail = 0;
  function check(ok, msg) { if (ok) pass++; else fail++; console.log('SELFTEST ' + (ok ? 'PASS ' : 'FAIL ') + msg); }
  function tap(i) {
    var b = global.JadeRush.board, r = b.rect(i), c = b.c.getBoundingClientRect();
    b.c.dispatchEvent(new PointerEvent('pointerdown', { clientX: c.left + r.x + r.w / 2, clientY: c.top + r.y + r.h / 2, bubbles: true, pointerType: 'touch' }));
  }
  function clickText(t) { var b = Array.prototype.find.call(document.querySelectorAll('#modal-actions button'), function (x) { return x.textContent === t; }); if (b) b.click(); return !!b; }
  // The CI simulator renders in software and can be slow, so wait on conditions instead of fixed sleeps.
  async function until(fn, ms) { for (var t = 0; t < ms; t += 200) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(200); } return false; }
  function boardReady() { var b = global.JadeRush.board, G = global.JadeRush.state(); return !$('game').hidden && G && G.gen && b.c.getBoundingClientRect().width > 0 && b.rect(0).w > 0 && !b.busy(); }
  async function step(name, fn) { try { await fn(); } catch (e) { check(false, name + ' threw: ' + (e && e.message)); } }

  async function run(info) {
    console.log('SELFTEST START ' + JSON.stringify(info));
    for (var w = 0; w < 50 && !(global.JadeRush && !$('home').hidden); w++) await sleep(200);
    await sleep(2500);
    await step('native', async function () {
      check(info.platform === 'ios', 'Running on iOS native shell');
      check(info.debug === true, 'Debug build (test ads only)');
      await document.fonts.ready;
      check(document.fonts.check('700 20px "Noto Serif SC"', '中'), 'Bundled tile font loaded');
      check(!!global.Capacitor.isPluginAvailable('Haptics'), 'Haptics plugin available');
      check(!!global.Capacitor.isPluginAvailable('AdMob'), 'AdMob plugin available');
      check(!global.Capacitor.isPluginAvailable('FacebookLogin') && $('btn-lobby-friends').hidden, 'Facebook excluded on iOS, Friends entry hidden');
      var top = getComputedStyle(document.documentElement).getPropertyValue('--sa-top');
      check(true, 'Safe area: ' + (top || 'n/a'));
    });
    await step('level 1', async function () {
      $('btn-continue').click(); await until(boardReady, 15000); await sleep(1500);
      console.log('SELFTEST SHOT level');
      var sol = global.JadeRush.state().gen.solution;
      for (var k = 0; k < sol.length; k++) { tap(sol[k][0]); await sleep(150); tap(sol[k][1]); await sleep(450); }
      // If a tap was lost on a slow frame, finish with whatever free pairs remain.
      for (var n = 0; n < 40 && global.JadeRush.state().left > 0 && !global.JadeRush.state().over; n++) {
        var G = global.JadeRush.state(), fp = global.Mahjong.freePairs(G.lay, G.present, G.kinds)[0];
        if (!fp) break; tap(fp[0]); await sleep(150); tap(fp[1]); await sleep(450);
      }
      await until(function () { return /cleared|Flawless/i.test($('modal-title').textContent); }, 8000);
      console.log('SELFTEST SHOT cleared');
      check(/cleared|Flawless/i.test($('modal-title').textContent), 'Level 1 cleared: ' + $('modal-title').textContent);
      check(JSON.parse(localStorage.getItem('jaderush.v1')).level === 2, 'Progress saved');
    });
    await step('pause', async function () {
      document.querySelector('#modal-actions .primary').click(); await until(boardReady, 15000); await sleep(800);
      $('btn-quit').click(); await sleep(600);
      var t1 = global.JadeRush.state().timeLeft; await sleep(2000);
      check(Math.abs(global.JadeRush.state().timeLeft - t1) < 50, 'Pause stops the clock');
      check(clickText('Quit'), 'Quit from pause'); await sleep(800);
      check(!$('home').hidden, 'Back on the home screen');
    });
    await step('duel', async function () {
      $('btn-ai').click(); await sleep(500);
      document.querySelector('#modal-actions .primary').click(); await until(boardReady, 15000); await sleep(800);
      var G = global.JadeRush.state();
      // Make one match on our turn (the computer may move first), then wait for the computer's reply.
      for (var n = 0; n < 30 && !(G.scores[G.me || 0] > 0); n++) {
        if (G.turn === (G.me || 0) && !global.JadeRush.board.busy()) {
          var pr = global.Mahjong.freePairs(G.lay, G.present, G.kinds)[0]; tap(pr[0]); await sleep(150); tap(pr[1]);
        }
        await sleep(500);
      }
      await until(function () { var s = global.JadeRush.state().scores; return s[0] > 0 && s[1] > 0; }, 12000);
      console.log('SELFTEST SHOT duel');
      var s = global.JadeRush.state().scores;
      check(s[0] > 0 && s[1] > 0, 'Duel: both players scored (' + s.join('-') + ')');
      $('btn-quit').click(); await sleep(500); clickText('Quit'); await sleep(800);
    });
    await step('tile sets', async function () {
      $('btn-themes').click(); await sleep(900);
      console.log('SELFTEST SHOT tilesets');
      check(document.querySelectorAll('.theme-card').length === 6, 'Tile set picker shows 6 sets');
      document.querySelector('#modal-actions .primary').click();
    });
    console.log('SELFTEST DONE pass=' + pass + ' fail=' + fail);
  }

  // CI's macOS runners have no GPU, so the simulator draws the animated sky in software; run the test in
  // battery-saver mode (same game logic, far less drawing). Set it once, reload, then run.
  Shell.buildInfo().then(function (info) {
    if (!info.selfTest) return;
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('jaderush.v1') || '{}'); } catch (e) { /* fresh */ }
    if (saved.lite !== true) { saved.lite = true; saved.seenHowto = true; localStorage.setItem('jaderush.v1', JSON.stringify(saved)); location.reload(); return; }
    setTimeout(function () { run(info); }, 500);
  });
})(this);
