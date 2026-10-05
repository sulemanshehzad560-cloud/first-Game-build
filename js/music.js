/* Soundtrack and night ambience (assets/music, composed by tools/art/music.py).
   Two channels, music and ambience, each streams one file at a time from an <audio> element routed
   through a WebAudio gain (iOS ignores element.volume), so pieces crossfade instead of cutting. Playback
   starts on the first tap (autoplay rules) and stops while the app is in the background. */
(function (global) {
  'use strict';
  var ctx = null, unlocked = false, hidden = false;
  var AC = global.AudioContext || global.webkitAudioContext;

  function now() { return ctx ? ctx.currentTime : 0; }

  function Channel(level) {
    this.level = level; this.on = true; this.src = null; this.voices = []; this.next = null;
  }
  // Start one file, fading it in over `fade` seconds; returns the voice.
  Channel.prototype.voice = function (src, fade) {
    var el = new Audio(), v = { el: el, gain: null, src: src, ending: false };
    el.src = src; el.preload = 'auto';
    if (ctx) {
      try {
        var node = ctx.createMediaElementSource(el);
        v.gain = ctx.createGain(); v.gain.gain.value = 0;
        node.connect(v.gain); v.gain.connect(ctx.destination);
        v.gain.gain.setValueAtTime(0, now()); v.gain.gain.linearRampToValueAtTime(this.level, now() + fade);
      } catch (e) { v.gain = null; }
    }
    if (!v.gain) el.volume = this.level;
    var self = this;
    // Near the end, hand over to the next piece (or the same one again) with a long crossfade.
    el.addEventListener('timeupdate', function () {
      if (v.ending || !el.duration || el.duration - el.currentTime > 3.4) return;
      v.ending = true;
      var nextSrc = self.next ? self.next(v.src) : v.src;
      self.start(nextSrc, 3.2);
    });
    el.addEventListener('ended', function () { self.drop(v); });
    var p = el.play(); if (p && p.catch) p.catch(function () { /* not allowed yet; retried on the next tap */ });
    return v;
  };
  Channel.prototype.fadeOut = function (v, secs) {
    var self = this;
    if (v.gain) { v.gain.gain.cancelScheduledValues(now()); v.gain.gain.setValueAtTime(v.gain.gain.value, now()); v.gain.gain.linearRampToValueAtTime(0, now() + secs); }
    else v.el.volume = 0;
    setTimeout(function () { self.drop(v); }, secs * 1000 + 100);
  };
  Channel.prototype.drop = function (v) {
    var k = this.voices.indexOf(v); if (k < 0) return;
    this.voices.splice(k, 1);
    try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); if (v.gain) v.gain.disconnect(); } catch (e) { /* gone */ }
  };
  Channel.prototype.start = function (src, fade) {
    var self = this;
    this.voices.slice().forEach(function (v) { self.fadeOut(v, fade); });
    this.src = src;
    if (src && this.on && unlocked && !hidden) this.voices.push(this.voice(src, fade));
  };
  // Ask for a file; a no-op while that file (or its partner piece) is already what this channel wants.
  Channel.prototype.want = function (src, same) {
    if (src === this.src || (same && same(this.src))) return;
    this.start(src, 1.6);
  };
  Channel.prototype.setOn = function (on) {
    this.on = on;
    var s = this.src;
    if (!on) { this.start(null, 0.6); this.src = s; }
    else if (s) { this.src = null; this.start(s, 1.2); }
  };
  Channel.prototype.pauseAll = function (p) {
    this.voices.forEach(function (v) { if (p) v.el.pause(); else { var r = v.el.play(); if (r && r.catch) r.catch(function () {}); } });
  };

  var music = new Channel(0.5), amb = new Channel(0.42);

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (AC && !ctx) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    [music, amb].forEach(function (ch) { var s = ch.src; ch.src = null; if (s) ch.start(s, 2); });
  }
  global.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  global.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', function () {
    hidden = document.visibilityState === 'hidden';
    if (ctx) { if (hidden) ctx.suspend(); else ctx.resume(); }
    music.pauseAll(hidden); amb.pauseAll(hidden);
  });

  var base = 'assets/music/';
  global.JadeMusic = {
    // scene: { music: 'menu' | 'jade' | 'jade-2' | 'duel' ..., ambience: theme id }
    scene: function (s) {
      var m = s.music, pair = m.replace(/-2$/, '');
      music.next = function (cur) {
        // a world's two pieces take turns; other tracks simply repeat
        if (/^(menu|duel)/.test(m)) return cur;
        return /-2\.m4a$/.test(cur) ? base + pair + '.m4a' : base + pair + '-2.m4a';
      };
      var world = !/^(menu|duel)$/.test(pair);
      // moving between levels of the same world keeps whichever of its two pieces is playing
      music.want(base + m + '.m4a', function (cur) { return world && (cur === base + pair + '.m4a' || cur === base + pair + '-2.m4a'); });
      amb.want(base + 'ambience-' + s.ambience + '.m4a');
    },
    setMusic: function (on) { music.setOn(on); },
    setAmbience: function (on) { amb.setOn(on); },
    unlock: unlock
  };
})(this);
