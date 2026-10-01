/* Traditional Mahjong tile faces drawn with canvas paths (no image assets). */
(function (global) {
  'use strict';
  var BLUE = '#1d4f91', GREEN = '#15774a', RED = '#c0352b', INK = '#1c2440';
  var GLYPH_FONT = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif';
  var NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var WINDS = ['東', '南', '西', '北'];
  var NAMES = ['Dots', 'Bamboo', 'Characters'];

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
  var DOT_COLORS = [RED, GREEN, BLUE];

  var STICKS = [
    null,
    [[.5, .27, 0], [.5, .73, 0]],
    [[.5, .27, 0], [.3, .73, 0], [.7, .73, 0]],
    [[.3, .27, 0], [.7, .27, 0], [.3, .73, 0], [.7, .73, 0]],
    [[.25, .27, 0], [.75, .27, 0], [.5, .5, 1], [.25, .73, 0], [.75, .73, 0]],
    [[.2, .27, 0], [.5, .27, 0], [.8, .27, 0], [.2, .73, 0], [.5, .73, 0], [.8, .73, 0]],
    [[.5, .17, 1], [.2, .5, 0], [.5, .5, 0], [.8, .5, 0], [.2, .83, 0], [.5, .83, 0], [.8, .83, 0]],
    [[.2, .27, 0], [.4, .27, 0], [.6, .27, 0], [.8, .27, 0], [.2, .73, 0], [.4, .73, 0], [.6, .73, 0], [.8, .73, 0]],
    [[.2, .17, 0], [.5, .17, 1], [.8, .17, 0], [.2, .5, 0], [.5, .5, 1], [.8, .5, 0], [.2, .83, 0], [.5, .83, 1], [.8, .83, 0]]
  ];

  function dot(g, x, y, r, color) {
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(x, y, r * 0.68, 0, 6.283); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r * 0.42, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r * 0.12, 0, 6.283); g.fill();
  }

  function stick(g, cx, cy, w, h, color) {
    var x = cx - w / 2, y = cy - h / 2, r = w / 2;
    g.fillStyle = color;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(cx - w * 0.12, y + h * 0.1, w * 0.22, h * 0.8);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(x, cy - h * 0.03, w, h * 0.06);
  }

  function bird(g, w, h) {
    g.save(); g.translate(w / 2, h / 2);
    var s = Math.min(w, h);
    g.fillStyle = GREEN;
    g.beginPath(); g.ellipse(0, s * 0.08, s * 0.24, s * 0.3, 0.3, 0, 6.283); g.fill();
    g.fillStyle = BLUE;
    for (var k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(s * 0.16 + k * s * 0.08, s * 0.36, s * 0.05, s * 0.16, -0.5 + k * 0.4, 0, 6.283); g.fill(); }
    g.fillStyle = RED; g.beginPath(); g.arc(-s * 0.12, -s * 0.28, s * 0.13, 0, 6.283); g.fill();
    g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(-s * 0.15, -s * 0.31, s * 0.035, 0, 6.283); g.fill();
    g.fillStyle = '#d9a12b'; g.beginPath(); g.moveTo(-s * 0.24, -s * 0.28); g.lineTo(-s * 0.36, -s * 0.24); g.lineTo(-s * 0.23, -s * 0.21); g.fill();
    g.restore();
  }

  function glyph(g, ch, x, y, size, color) {
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + size + 'px ' + GLYPH_FONT;
    g.fillText(ch, x, y);
  }

  /** Draw tile kind into a w×h face box at the origin. */
  function drawFace(g, kind, w, h) {
    var s = Math.min(w, h), i;
    if (kind < 9) {
      var n = kind + 1, pts = DOTS[kind], r = n === 1 ? s * 0.34 : n <= 4 ? s * 0.17 : n <= 6 ? s * 0.13 : s * 0.11;
      for (i = 0; i < pts.length; i++) dot(g, pts[i][0] * w, pts[i][1] * h, r, n === 1 ? BLUE : DOT_COLORS[(i + n) % 3]);
      if (n === 1) { g.strokeStyle = GREEN; g.lineWidth = s * 0.04; g.beginPath(); g.arc(w / 2, h / 2, r * 1.15, 0, 6.283); g.stroke(); }
    } else if (kind < 18) {
      var b = kind - 9;
      if (b === 0) { bird(g, w, h); return; }
      var sw = s * (b >= 7 ? 0.13 : 0.15), sh = h * (b >= 6 ? 0.26 : 0.36);
      STICKS[b].forEach(function (p) { stick(g, p[0] * w, p[1] * h, sw, sh, p[2] ? RED : GREEN); });
    } else if (kind < 27) {
      glyph(g, NUMERALS[kind - 18], w / 2, h * 0.3, s * 0.48, INK);
      glyph(g, '萬', w / 2, h * 0.72, s * 0.5, RED);
    } else if (kind < 31) {
      glyph(g, WINDS[kind - 27], w / 2, h / 2, s * 0.78, INK);
    } else if (kind === 31) {
      glyph(g, '中', w / 2, h / 2, s * 0.8, RED);
    } else if (kind === 32) {
      glyph(g, '發', w / 2, h / 2, s * 0.78, GREEN);
    } else {
      g.strokeStyle = BLUE; g.lineWidth = s * 0.07;
      g.strokeRect(w * 0.18, h * 0.16, w * 0.64, h * 0.68);
      g.lineWidth = s * 0.025; g.strokeRect(w * 0.27, h * 0.24, w * 0.46, h * 0.52);
    }
  }

  function kindName(kind) {
    if (kind < 27) return NAMES[Math.floor(kind / 9)] + ' ' + (kind % 9 + 1);
    if (kind < 31) return ['East', 'South', 'West', 'North'][kind - 27] + ' wind';
    return ['Red', 'Green', 'White'][kind - 31] + ' dragon';
  }

  global.MahjongTiles = { drawFace: drawFace, kindName: kindName, GLYPH_FONT: GLYPH_FONT };
})(this);
