/*
 * Google Play Games (Android) and Game Center (iPhone): sign-in on launch and leaderboards.
 * The native side is the app's own GameServices plugin. In a browser, or before the Play Games project
 * is configured, everything here reports "not available" and the game keeps local scores only.
 * Leaderboards are found by name, so no store-specific IDs live in the code:
 *   "Journey"   - highest level cleared (all time)
 *   "Rush Hour" - best Rush Hour run score (shown for today)
 */
(function (global) {
  'use strict';
  var Shell = global.NativeShell, plugin = null;
  var IOS_IDS = { journey: 'jaderush.journey', rush: 'jaderush.rush' };   // App Store Connect leaderboard IDs
  var state = { available: false, signedIn: false, name: '', id: '', platform: '' };
  var boards = null, listeners = [], pending = {};

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* ignore */ } }); }
  function apply(r) {
    r = r || {};
    state.available = !!r.available; state.signedIn = !!r.signedIn;
    state.name = r.name || ''; state.id = r.id || ''; state.platform = r.platform || state.platform;
    emit();
    if (state.signedIn) {
      loadBoards();
      Object.keys(pending).forEach(function (k) { var v = pending[k]; delete pending[k]; submit(k, v); });
    }
    return state;
  }
  function loadBoards() {
    if (boards || !plugin) return Promise.resolve(boards || {});
    return plugin.leaderboards().then(function (r) {
      var found = {};
      ((r && r.leaderboards) || []).forEach(function (b) {
        var n = (b.name || '') + ' ' + (b.id || '');
        if (/rush/i.test(n)) found.rush = b.id;
        else if (/journey|level/i.test(n)) found.journey = b.id;
      });
      if (state.platform === 'gamecenter') { found.journey = found.journey || IOS_IDS.journey; found.rush = found.rush || IOS_IDS.rush; }
      if (found.journey || found.rush) boards = found;
      return found;
    }, function () { return {}; });
  }
  function idFor(kind) { return loadBoards().then(function (b) { return b[kind] || ''; }); }

  function submit(kind, score) {
    score = Math.max(0, Math.floor(score || 0));
    if (!plugin || !state.signedIn) { if (score > (pending[kind] || 0)) pending[kind] = score; return Promise.resolve(false); }
    return idFor(kind).then(function (id) {
      if (!id) return false;
      return plugin.submitScore({ leaderboard: id, score: score }).then(function (r) { return !!(r && r.ok); }, function () { return false; });
    });
  }

  global.GameServices = {
    state: state,
    onChange: function (fn) { listeners.push(fn); },
    /** 'Google Play Games' or 'Game Center' (what the sign-in button and links should say). */
    serviceName: function () { return state.platform === 'gamecenter' ? 'Game Center' : 'Google Play Games'; },
    /** interactive: show the sign-in screen if the player is not signed in already. */
    signIn: function (interactive) {
      if (!plugin) return Promise.resolve(state);
      return plugin.signIn({ interactive: !!interactive }).then(apply, function () { return state; });
    },
    submit: submit,
    /** Open the store's own leaderboard screen (kind omitted: all leaderboards). */
    show: function (kind) {
      if (!plugin || !state.signedIn) return Promise.resolve(false);
      return (kind ? idFor(kind) : Promise.resolve('')).then(function (id) {
        return plugin.showLeaderboard(id ? { leaderboard: id } : {}).then(function () { return true; }, function () { return false; });
      });
    },
    /** About 50 players ranked around this player: [{ rank, name, score, me }]. span: 'day' | 'all'. */
    around: function (kind, span) {
      if (!plugin || !state.signedIn) return Promise.resolve(null);
      return idFor(kind).then(function (id) {
        if (!id) return null;
        return plugin.loadScores({ leaderboard: id, span: span || 'all', count: 50 }).then(function (r) {
          if (!r || !r.ok) return null;
          return (r.entries || []).map(function (e) {
            return { rank: +e.rank || 0, name: e.name || 'Player', score: +e.score || 0, me: !!e.me || (!!state.id && e.id === state.id) };
          });
        }, function () { return null; });
      });
    }
  };

  function init() {
    if (!Shell || !Shell.isNative) return;
    try { plugin = global.Capacitor.registerPlugin('GameServices'); } catch (e) { plugin = null; return; }
    if (plugin.addListener) plugin.addListener('change', apply);
    Shell.buildInfo().then(function (bi) {
      state.platform = bi.platform === 'ios' ? 'gamecenter' : 'playgames';
      // The self-test and the recorded demo never wait on a sign-in sheet.
      if (bi.selfTest || bi.demo) return;
      var asked = false;
      try { asked = localStorage.getItem('jaderush.gs-asked') === '1'; } catch (e) { /* private mode */ }
      // Play Games signs returning players in silently; the first launch shows the sign-in screen once.
      // Game Center decides by itself whether to show its sheet.
      global.GameServices.signIn(!asked).then(function () {
        try { localStorage.setItem('jaderush.gs-asked', '1'); } catch (e) { /* private mode */ }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
