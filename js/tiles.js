/* Traditional Mahjong tile faces and tile-set materials, drawn with canvas paths.
   drawFace() paints the symbols only; board.js carves them into the tile surface. */
(function (global) {
  'use strict';
  var GLYPH_FONT = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif';
  var NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var WINDS = ['東', '南', '西', '北'];

  // Wood materials: face = the top surface (two tones for the grain gradient), grain = ring-line color,
  // body = the wood seen on the edge, back = the dyed back layer. pal picks paint (light woods) or
  // inlay (dark woods). bg = [deep, mid, glow A, glow B] for the table.
  var THEMES = [
    { id: 'jade', name: 'Maple', stars: 0, face: ['#efd6a6', '#dcb57d'], grain: '#a26b33', body: ['#c99a62', '#9c6f3e'], back: ['#2f7d5b', '#123d2c'], pal: 'light', accent: '#ffc94a', bg: ['#0b2621', '#145244', '#2bc293', '#ffc94a'] },
    { id: 'sakura', name: 'Cherry', stars: 12, face: ['#e7b28f', '#cd8a66'], grain: '#86432a', body: ['#b36f4c', '#7f4529'], back: ['#b8325e', '#5e1030'], pal: 'light', accent: '#ff5fa2', bg: ['#2a0c20', '#64184a', '#ff86b8', '#ffd166'] },
    { id: 'lagoon', name: 'Birch', stars: 30, face: ['#f4e7cc', '#e2cda7'], grain: '#b0915f', body: ['#d4b98c', '#a98c5e'], back: ['#1b7fa3', '#0a3d58'], pal: 'light', accent: '#38d6ff', bg: ['#061a30', '#0c4775', '#47cdff', '#7cffcb'] },
    { id: 'ember', name: 'Teak', stars: 60, face: ['#dca46a', '#be8048'], grain: '#6f4019', body: ['#a8692f', '#74431a'], back: ['#c25a1a', '#5e2405'], pal: 'light', accent: '#ff8a3d', bg: ['#260f05', '#71290b', '#ffa24a', '#ffe066'] },
    { id: 'royal', name: 'Rosewood', stars: 100, face: ['#a9614a', '#874434'], grain: '#4a1d14', body: ['#7a3a2a', '#4f2117'], back: ['#5b2fa0', '#25104c'], pal: 'dark', accent: '#c59bff', bg: ['#140a30', '#381c7a', '#b388ff', '#ff86b8'] },
    { id: 'obsidian', name: 'Ebony', stars: 160, face: ['#43352e', '#261c18'], grain: '#0c0806', body: ['#2e231e', '#16100d'], back: ['#c9a24a', '#6e5218'], pal: 'dark', accent: '#e8c46a', bg: ['#06070e', '#191d3a', '#6c7cff', '#e8c46a'] }
  ];

  // Traditional enamel paint for light woods; ivory and metal inlay for dark woods.
  var PALETTES = {
    light: { blue: '#1c3a86', green: '#0b5e3c', red: '#a8141f', ink: '#16110c', gold: '#8a5d14', teal: '#0d625f' },
    dark: { blue: '#a9c4ff', green: '#93e2b5', red: '#ff9a8a', ink: '#f6e9c8', gold: '#f0cd78', teal: '#8fe8e0' }
  };

  function hex(h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
  function punch(g, fn) { g.save(); g.globalCompositeOperation = 'destination-out'; fn(); g.restore(); }

  // A traditional "coin": outer ring, a ring of notches, a solid core with a hole.
  function coin(g, x, y, r, color, inner) {
    g.fillStyle = color; circle(g, x, y, r);
    punch(g, function () { circle(g, x, y, r * 0.78); });
    var n = r > 12 ? 12 : 8;
    g.fillStyle = color;
    for (var k = 0; k < n; k++) {
      var a = k * 6.2832 / n;
      circle(g, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * (n === 12 ? 0.08 : 0.1));
    }
    g.fillStyle = inner || color; circle(g, x, y, r * 0.38);
    punch(g, function () { circle(g, x, y, r * 0.13); });
  }

  // A bamboo stalk: two tapered segments joined at a raised node.
  function stalk(g, cx, cy, w, h, color) {
    var top = cy - h / 2, bot = cy + h / 2, waist = w * 0.62;
    function seg(y0, y1) {
      g.beginPath();
      g.moveTo(cx - waist / 2, y0);
      g.quadraticCurveTo(cx - w / 2, (y0 + y1) / 2, cx - waist / 2, y1);
      g.lineTo(cx + waist / 2, y1);
      g.quadraticCurveTo(cx + w / 2, (y0 + y1) / 2, cx + waist / 2, y0);
      g.closePath(); g.fill();
    }
    g.fillStyle = color;
    seg(top, cy); seg(cy, bot);
    g.fillRect(cx - w * 0.5, cy - h * 0.035, w, h * 0.07);
    g.fillRect(cx - w * 0.45, top - h * 0.01, w * 0.9, h * 0.05);
    g.fillRect(cx - w * 0.45, bot - h * 0.04, w * 0.9, h * 0.05);
    punch(g, function () { g.fillRect(cx - w * 0.06, top + h * 0.1, w * 0.12, h * 0.3); g.fillRect(cx - w * 0.06, cy + h * 0.1, w * 0.12, h * 0.3); });
  }

  function bird(g, w, h, pal) {
    var s = Math.min(w, h);
    g.save(); g.translate(w / 2, h * 0.56);
    var tail = [pal.blue, pal.green, pal.teal, pal.green, pal.blue];
    for (var k = 0; k < 5; k++) {
      g.save(); g.rotate(0.5 + k * 0.28);
      g.fillStyle = tail[k];
      g.beginPath(); g.ellipse(0, s * 0.27, s * 0.06, s * 0.2, 0, 0, 6.2832); g.fill();
      g.fillStyle = pal.gold; circle(g, 0, s * 0.4, s * 0.035);
      g.restore();
    }
    g.fillStyle = pal.green;
    g.beginPath(); g.ellipse(-s * 0.02, 0, s * 0.15, s * 0.2, -0.35, 0, 6.2832); g.fill();
    g.fillStyle = pal.blue;
    g.beginPath(); g.ellipse(s * 0.04, s * 0.02, s * 0.07, s * 0.14, -0.5, 0, 6.2832); g.fill();
    g.fillStyle = pal.red; circle(g, -s * 0.1, -s * 0.2, s * 0.085);
    g.beginPath(); g.moveTo(-s * 0.16, -s * 0.27); g.lineTo(-s * 0.1, -s * 0.36); g.lineTo(-s * 0.05, -s * 0.27); g.fill();
    g.fillStyle = pal.gold;
    g.beginPath(); g.moveTo(-s * 0.18, -s * 0.21); g.lineTo(-s * 0.28, -s * 0.18); g.lineTo(-s * 0.18, -s * 0.15); g.fill();
    punch(g, function () { circle(g, -s * 0.12, -s * 0.22, s * 0.02); });
    g.restore();
  }

  function glyph(g, ch, x, y, size, color) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + size + 'px ' + GLYPH_FONT;
    g.fillStyle = color; g.fillText(ch, x, y);
  }
  function corner(g, text, color, w, h) {
    g.font = '800 ' + Math.min(w, h) * 0.17 + 'px "Figtree", system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = color;
    g.fillText(text, 0, 0);
  }

  var DOTS = [
    [[.5, .5]],
    [[.5, .27], [.5, .73]],
    [[.24, .2], [.5, .5], [.76, .8]],
    [[.29, .28], [.71, .28], [.29, .72], [.71, .72]],
    [[.27, .22], [.73, .22], [.5, .5], [.27, .78], [.73, .78]],
    [[.3, .18], [.7, .18], [.3, .5], [.7, .5], [.3, .82], [.7, .82]],
    [[.22, .12], [.5, .23], [.78, .34], [.3, .6], [.7, .6], [.3, .86], [.7, .86]],
    [[.3, .12], [.7, .12], [.3, .37], [.7, .37], [.3, .63], [.7, .63], [.3, .88], [.7, .88]],
    [[.2, .17], [.5, .17], [.8, .17], [.2, .5], [.5, .5], [.8, .5], [.2, .83], [.5, .83], [.8, .83]]
  ];
  // Traditional coloring by suit position: 0 blue, 1 green, 2 red.
  var DOT_COLORS = [null, [1, 0], [0, 2, 1], [0, 1, 1, 0], [0, 1, 2, 1, 0], [1, 1, 2, 2, 2, 2], [1, 1, 1, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 2, 2, 2, 1, 1, 1]];
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

  /** Paint the symbols for a kind into a w×h box at the origin (transparent background). */
  function drawFace(g, kind, w, h, palName) {
    var pal = PALETTES[palName] || PALETTES.light, s = Math.min(w, h), cols = [pal.blue, pal.green, pal.red], i;
    if (kind < 9) {
      var n = kind + 1, pts = DOTS[kind];
      if (n === 1) {
        coin(g, w / 2, h / 2, s * 0.42, pal.green, pal.red);
        g.strokeStyle = pal.blue; g.lineWidth = s * 0.03;
        g.beginPath(); g.arc(w / 2, h / 2, s * 0.47, 0, 6.2832); g.stroke();
        return;
      }
      var r = n <= 4 ? s * 0.19 : n <= 6 ? s * 0.15 : s * 0.12;
      for (i = 0; i < pts.length; i++) coin(g, pts[i][0] * w, pts[i][1] * h, r, cols[DOT_COLORS[kind][i]]);
    } else if (kind < 18) {
      var b = kind - 9;
      if (b === 0) { bird(g, w, h, pal); return; }
      var sw = s * (b >= 7 ? 0.15 : 0.17), sh = h * (b >= 6 ? 0.28 : 0.38);
      var stickCols = [pal.green, pal.red, pal.blue];
      STICKS[b].forEach(function (p) { stalk(g, p[0] * w, p[1] * h, sw, sh, stickCols[p[2]]); });
    } else if (kind < 27) {
      glyph(g, NUMERALS[kind - 18], w / 2, h * 0.29, s * 0.5, pal.ink);
      glyph(g, '萬', w / 2, h * 0.72, s * 0.56, pal.red);
      corner(g, String(kind - 17), pal.red, w, h);
    } else if (kind < 31) {
      glyph(g, WINDS[kind - 27], w / 2, h * 0.54, s * 0.78, pal.ink);
      corner(g, 'ESWN'[kind - 27], pal.red, w, h);
    } else if (kind === 31) {
      glyph(g, '中', w / 2, h * 0.52, s * 0.86, pal.red);
    } else if (kind === 32) {
      glyph(g, '發', w / 2, h * 0.52, s * 0.82, pal.green);
    } else {
      g.fillStyle = pal.blue;
      g.fillRect(w * 0.16, h * 0.14, w * 0.68, h * 0.72);
      punch(g, function () { g.fillRect(w * 0.23, h * 0.2, w * 0.54, h * 0.6); });
      g.fillRect(w * 0.29, h * 0.26, w * 0.42, h * 0.48);
      punch(g, function () { g.fillRect(w * 0.32, h * 0.29, w * 0.36, h * 0.42); });
    }
  }

  function kindName(kind) {
    if (kind < 27) return ['Dots', 'Bamboo', 'Characters'][Math.floor(kind / 9)] + ' ' + (kind % 9 + 1);
    if (kind < 31) return ['East', 'South', 'West', 'North'][kind - 27] + ' wind';
    return ['Red', 'Green', 'White'][kind - 31] + ' dragon';
  }

  global.MahjongTiles = { drawFace: drawFace, kindName: kindName, THEMES: THEMES, PALETTES: PALETTES, mix: mix, GLYPH_FONT: GLYPH_FONT };
})(this);
