/* WebAudio effects: tile clacks from filtered noise, chimes that climb with combos. */
(function (global) {
  'use strict';
  var ctx = null, master = null, noise = null, enabled = true;
  var SCALE = [0, 2, 4, 7, 9];

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function clack(when, freq, vol) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (when || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq || 2400; f.Q.value = 3;
    g.gain.value = vol || 0.9;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  function tone(freq, dur, type, vol, when) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function note(step) {
    var oct = Math.floor(step / 5), deg = SCALE[step % 5];
    return 392 * Math.pow(2, (oct * 12 + deg) / 12);
  }

  global.GameAudio = {
    unlock: function () { ensure(); },
    setEnabled: function (v) { enabled = v; },
    select: function () { clack(0, 2800, 0.6); },
    blocked: function () { clack(0, 700, 0.7); tone(150, 0.1, 'triangle', 0.08); },
    match: function (combo) {
      clack(0, 2200, 1); clack(0.05, 2600, 0.8);
      var s = Math.min(combo - 1, 12);
      tone(note(s), 0.35, 'sine', 0.22, 0.04);
      if (combo > 1) tone(note(s + 2), 0.3, 'triangle', 0.08, 0.1);
    },
    /** Two heavy tiles colliding: a sharp crack, a woody knock, a low thump, then the combo chime. */
    slam: function (power, combo) {
      var c = ensure(); if (!c) return;
      clack(0, 3200, 1); clack(0, 1400, 1); clack(0.012, 900, 0.9);
      var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150 + power * 10, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 + Math.min(power, 4) * 0.08, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
      var s = Math.min(Math.max(combo, 1) - 1, 12);
      tone(note(s), 0.4, 'sine', 0.2, 0.05);
      if (combo > 1) tone(note(s + 2), 0.35, 'triangle', 0.08, 0.11);
    },
    shuffle: function () { for (var k = 0; k < 7; k++) clack(k * 0.045, 1800 + Math.random() * 1600, 0.6); },
    tick: function () { tone(1200, 0.05, 'square', 0.04); },
    win: function () { [0, 2, 4, 5, 7, 9].forEach(function (s, k) { tone(note(s), 0.45, 'sine', 0.22, k * 0.08); }); },
    lose: function () { [5, 3, 1, 0].forEach(function (s, k) { tone(note(s) / 2, 0.4, 'triangle', 0.18, k * 0.13); }); },
    pop: function () { tone(880, 0.06, 'sine', 0.12); },
    chime: function () { var s = [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]; tone(note(s) * 2, 0.9, 'sine', 0.09); tone(note(s) * 4, 0.5, 'sine', 0.035, 0.03); }
  };
})(this);
