/* Tile faces and tile sets, drawn with canvas paths (no image assets). */
(function (global) {
  'use strict';
  var GLYPH_FONT = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif';
  var NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var WINDS = ['東', '南', '西', '北'];

  // Tile sets unlock with stars. bg = [deep, mid, glow A, glow B] for the table behind the board.
  var THEMES = [
    { id: 'jade', name: 'Jade', stars: 0, back: ['#2bc293', '#0c5a43'], body: '#dccfae', face: ['#fffbf1', '#eee1c3'], edge: 'rgba(110,90,50,.35)', pal: 'light', accent: '#ffc94a', bg: ['#0b2621', '#145244', '#2bc293', '#ffc94a'] },
    { id: 'sakura', name: 'Sakura', stars: 12, back: ['#ff86b8', '#b8285f'], body: '#f3d5e1', face: ['#fff8fb', '#fde1ec'], edge: 'rgba(160,60,100,.3)', pal: 'light', accent: '#ff5fa2', bg: ['#2a0c20', '#64184a', '#ff86b8', '#ffd166'] },
    { id: 'lagoon', name: 'Lagoon', stars: 30, back: ['#47cdff', '#0a62a0'], body: '#d1e7f3', face: ['#f8fdff', '#ddf0fa'], edge: 'rgba(40,100,150,.3)', pal: 'light', accent: '#38d6ff', bg: ['#061a30', '#0c4775', '#47cdff', '#7cffcb'] },
    { id: 'ember', name: 'Ember', stars: 60, back: ['#ffa24a', '#bf3a0a'], body: '#f3d9bf', face: ['#fffaf1', '#fbe4cb'], edge: 'rgba(160,80,30,.3)', pal: 'light', accent: '#ff8a3d', bg: ['#260f05', '#71290b', '#ffa24a', '#ffe066'] },
    { id: 'royal', name: 'Royal', stars: 100, back: ['#b388ff', '#5523b8'], body: '#e1d4f6', face: ['#fdfaff', '#eae0fb'], edge: 'rgba(90,50,160,.3)', pal: 'light', accent: '#c59bff', bg: ['#140a30', '#381c7a', '#b388ff', '#ff86b8'] },
    { id: 'obsidian', name: 'Obsidian', stars: 160, back: ['#5a628c', '#121527'], body: '#3a4062', face: ['#30365a', '#1b1f38'], edge: 'rgba(255,255,255,.14)', pal: 'dark', accent: '#3ef0c8', bg: ['#06070e', '#191d3a', '#6c7cff', '#3ef0c8'] }
  ];

  var PALETTES = {
    light: { blue: '#1d63da', green: '#0c9c5a', red: '#e2322a', ink: '#1f2552', gold: '#e39a12', purple: '#7a3de6', teal: '#0aa3a8', paper: '#fffaf0' },
    dark: { blue: '#5daaff', green: '#3ee08f', red: '#ff5f6d', ink: '#eef0ff', gold: '#ffcb4d', purple: '#b88dff', teal: '#3ef0e0', paper: '#30365a' }
  };

  function hex(h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }

  function gem(g, x, y, r, color, pal) {
    var outer = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    outer.addColorStop(0, mix(color, '#ffffff', 0.55)); outer.addColorStop(0.6, color); outer.addColorStop(1, mix(color, '#000000', 0.3));
    g.fillStyle = outer; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.fillStyle = pal.paper; g.beginPath(); g.arc(x, y, r * 0.62, 0, 6.283); g.fill();
    var inner = g.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r * 0.42);
    inner.addColorStop(0, mix(color, '#ffffff', 0.4)); inner.addColorStop(1, color);
    g.fillStyle = inner; g.beginPath(); g.arc(x, y, r * 0.42, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x - r * 0.38, y - r * 0.4, r * 0.16, 0, 6.283); g.fill();
  }

  function stick(g, cx, cy, w, h, color) {
    var x = cx - w / 2, y = cy - h / 2, r = w / 2;
    var grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, mix(color, '#000000', 0.2)); grad.addColorStop(0.4, mix(color, '#ffffff', 0.35)); grad.addColorStop(1, color);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill();
    g.fillStyle = mix(color, '#000000', 0.35);
    g.fillRect(x - w * 0.08, cy - h * 0.035, w * 1.16, h * 0.07);
    g.fillRect(x - w * 0.04, y + h * 0.12, w * 1.08, h * 0.04);
    g.fillRect(x - w * 0.04, y + h * 0.84, w * 1.08, h * 0.04);
  }

  function peacock(g, w, h, pal) {
    var s = Math.min(w, h);
    g.save(); g.translate(w / 2, h * 0.55);
    var fan = [pal.teal, pal.blue, pal.purple, pal.green, pal.gold];
    for (var k = 0; k < 7; k++) {
      var a = -2.6 + k * 0.33;
      g.save(); g.rotate(a + 1.57);
      g.fillStyle = fan[k % fan.length];
      g.beginPath(); g.ellipse(0, -s * 0.3, s * 0.07, s * 0.2, 0, 0, 6.283); g.fill();
      g.fillStyle = pal.gold; g.beginPath(); g.arc(0, -s * 0.42, s * 0.04, 0, 6.283); g.fill();
      g.restore();
    }
    var body = g.createRadialGradient(-s * 0.05, -s * 0.05, 0, 0, 0, s * 0.2);
    body.addColorStop(0, mix(pal.green, '#ffffff', 0.4)); body.addColorStop(1, pal.green);
    g.fillStyle = body; g.beginPath(); g.ellipse(0, s * 0.02, s * 0.14, s * 0.19, 0, 0, 6.283); g.fill();
    g.fillStyle = pal.red; g.beginPath(); g.arc(-s * 0.02, -s * 0.2, s * 0.08, 0, 6.283); g.fill();
    g.fillStyle = pal.gold; g.beginPath(); g.moveTo(-s * 0.09, -s * 0.2); g.lineTo(-s * 0.17, -s * 0.17); g.lineTo(-s * 0.09, -s * 0.15); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.04, -s * 0.22, s * 0.02, 0, 6.283); g.fill();
    g.restore();
  }

  function glyph(g, ch, x, y, size, color, glow) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + size + 'px ' + GLYPH_FONT;
    if (glow) { g.save(); g.shadowColor = color; g.shadowBlur = size * 0.25; g.fillStyle = color; g.fillText(ch, x, y); g.restore(); }
    var grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, mix(color, '#ffffff', 0.25)); grad.addColorStop(1, mix(color, '#000000', 0.15));
    g.fillStyle = grad; g.fillText(ch, x, y);
  }

  function corner(g, text, color, w, h) {
    var s = Math.min(w, h) * 0.2;
    g.font = '800 ' + s + 'px "Figtree", system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = color; g.fillText(text, w * 0.02, h * 0.0);
  }

  var DOTS = [
    [[.5, .5]],
    [[.5, .27], [.5, .73]],
    [[.24, .2], [.5, .5], [.76, .8]],
    [[.3, .28], [.7, .28], [.3, .72], [.7, .72]],
    [[.27, .23], [.73, .23], [.5, .5], [.27, .77], [.73, .77]],
    [[.3, .18], [.7, .18], [.3, .5], [.7, .5], [.3, .82], [.7, .82]],
    [[.22, .13], [.5, .24], [.78, .35], [.3, .6], [.7, .6], [.3, .85], [.7, .85]],
    [[.3, .13], [.7, .13], [.3, .38], [.7, .38], [.3, .63], [.7, .63], [.3, .88], [.7, .88]],
    [[.2, .18], [.5, .18], [.8, .18], [.2, .5], [.5, .5], [.8, .5], [.2, .82], [.5, .82], [.8, .82]]
  ];
  var STICKS = [
    null,
    [[.5, .27, 0], [.5, .73, 0]],
    [[.5, .27, 0], [.3, .73, 0], [.7, .73, 0]],
    [[.3, .27, 0], [.7, .27, 0], [.3, .73, 0], [.7, .73, 0]],
    [[.25, .27, 0], [.75, .27, 0], [.5, .5, 1], [.25, .73, 0], [.75, .73, 0]],
    [[.2, .27, 0], [.5, .27, 0], [.8, .27, 0], [.2, .73, 0], [.5, .73, 0], [.8, .73, 0]],
    [[.5, .17, 1], [.2, .5, 0], [.5, .5, 0], [.8, .5, 0], [.2, .83, 0], [.5, .83, 0], [.8, .83, 0]],
    [[.2, .27, 0], [.4, .27, 2], [.6, .27, 2], [.8, .27, 0], [.2, .73, 0], [.4, .73, 2], [.6, .73, 2], [.8, .73, 0]],
    [[.2, .17, 0], [.5, .17, 1], [.8, .17, 0], [.2, .5, 2], [.5, .5, 1], [.8, .5, 2], [.2, .83, 0], [.5, .83, 1], [.8, .83, 0]]
  ];

  /** Draw tile kind into a w×h face box at the origin using a palette. */
  function drawFace(g, kind, w, h, palName) {
    var pal = PALETTES[palName] || PALETTES.light, s = Math.min(w, h), i;
    if (kind < 9) {
      var n = kind + 1, pts = DOTS[kind], r = n === 1 ? s * 0.36 : n <= 4 ? s * 0.18 : n <= 6 ? s * 0.14 : s * 0.115;
      var cols = [pal.red, pal.blue, pal.green, pal.purple, pal.teal];
      for (i = 0; i < pts.length; i++) gem(g, pts[i][0] * w, pts[i][1] * h, r, n === 1 ? pal.blue : cols[(i + n) % cols.length], pal);
      if (n === 1) {
        g.strokeStyle = pal.gold; g.lineWidth = s * 0.035;
        g.beginPath(); g.arc(w / 2, h / 2, r * 1.18, 0, 6.283); g.stroke();
      }
    } else if (kind < 18) {
      var b = kind - 9;
      if (b === 0) { peacock(g, w, h, pal); return; }
      var sw = s * (b >= 7 ? 0.14 : 0.16), sh = h * (b >= 6 ? 0.27 : 0.37);
      var stickCols = [pal.green, pal.red, pal.blue];
      STICKS[b].forEach(function (p) { stick(g, p[0] * w, p[1] * h, sw, sh, stickCols[p[2]]); });
    } else if (kind < 27) {
      glyph(g, NUMERALS[kind - 18], w / 2, h * 0.3, s * 0.48, pal.blue);
      glyph(g, '萬', w / 2, h * 0.72, s * 0.52, pal.red);
      corner(g, String(kind - 17), pal.gold, w, h);
    } else if (kind < 31) {
      var wc = [pal.blue, pal.red, pal.green, pal.purple][kind - 27];
      glyph(g, WINDS[kind - 27], w / 2, h * 0.53, s * 0.74, wc);
      corner(g, 'ESWN'[kind - 27], wc, w, h);
    } else if (kind === 31) {
      glyph(g, '中', w / 2, h / 2, s * 0.82, pal.red, true);
    } else if (kind === 32) {
      glyph(g, '發', w / 2, h / 2, s * 0.8, pal.green, true);
    } else {
      var fr = g.createLinearGradient(0, 0, w, h);
      fr.addColorStop(0, pal.blue); fr.addColorStop(1, pal.purple);
      g.strokeStyle = fr; g.lineWidth = s * 0.08;
      g.strokeRect(w * 0.17, h * 0.15, w * 0.66, h * 0.7);
      g.strokeStyle = pal.gold; g.lineWidth = s * 0.03;
      g.strokeRect(w * 0.28, h * 0.25, w * 0.44, h * 0.5);
    }
  }

  function kindName(kind) {
    if (kind < 27) return ['Dots', 'Bamboo', 'Characters'][Math.floor(kind / 9)] + ' ' + (kind % 9 + 1);
    if (kind < 31) return ['East', 'South', 'West', 'North'][kind - 27] + ' wind';
    return ['Red', 'Green', 'White'][kind - 31] + ' dragon';
  }

  global.MahjongTiles = { drawFace: drawFace, kindName: kindName, THEMES: THEMES, PALETTES: PALETTES, mix: mix, GLYPH_FONT: GLYPH_FONT };
})(this);
