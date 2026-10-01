/* Tiny WebAudio synth: chain bursts climb a pentatonic scale. */
(function (global) {
  'use strict';
  var ctx = null, master = null, enabled = true;
  var SCALE = [0, 2, 4, 7, 9];

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, glide) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function note(step, base) {
    var oct = Math.floor(step / SCALE.length), deg = SCALE[step % SCALE.length];
    return (base || 196) * Math.pow(2, (oct * 12 + deg) / 12);
  }

  global.NovaAudio = {
    unlock: function () { ensure(); },
    setEnabled: function (v) { enabled = v; },
    isEnabled: function () { return enabled; },
    place: function () { tone(520, 0.08, 'triangle', 0.18, 0, 0.7); },
    burst: function (wave) {
      var f = note(Math.min(wave, 17));
      tone(f, 0.22, 'sine', 0.3, 0, 1.01);
      tone(f * 2, 0.1, 'triangle', 0.07);
    },
    invalid: function () { tone(140, 0.12, 'square', 0.06, 0, 0.8); },
    win: function () { [0, 2, 4, 5, 7].forEach(function (s, k) { tone(note(s + 5), 0.4, 'sine', 0.25, k * 0.09); }); },
    lose: function () { [6, 4, 2, 0].forEach(function (s, k) { tone(note(s), 0.35, 'triangle', 0.18, k * 0.12); }); },
    pop: function () { tone(880, 0.05, 'sine', 0.12, 0, 1.4); }
  };
})(this);
