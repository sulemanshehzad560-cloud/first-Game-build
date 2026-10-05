"""Renders the painted night scenery behind Jade Rush, one scene per tile set.

Each scene is four parallax layers (sky, far, mid, near) at 1600x3200, plus half-size copies for battery
saver, a moon and a card thumbnail. Everything is drawn from code with fixed seeds, so the output is
reproducible:  python3 tools/art/scenery.py [theme ...]   (needs numpy, scipy, Pillow)
"""
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from common import THEMES, rgb, mix, smoothstep, fbm2, fbm1, over, to8

W, H = 2048, 4096
SS = 2  # supersampling for vector shapes
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'scenery')

STYLE = {
    'jade': dict(sky='aurora', far='karst', mid='karst', near='river', seed=11),
    'sakura': dict(sky='nebula', far='fuji', mid='hills', near='blossom', seed=23),
    'lagoon': dict(sky='aurora', far='soft', mid='pines', near='lake', seed=37),
    'ember': dict(sky='sunset', far='jagged', mid='soft', near='village', seed=41),
    'royal': dict(sky='nebula', far='jagged', mid='jagged', near='gate', seed=53),
    'obsidian': dict(sky='galaxy', far='jagged', mid='soft', near='city', seed=67),
}

Y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
X = np.linspace(0, 1, W, dtype=np.float32)[None, :]
MOON = (0.2, 0.15)  # where the moon hangs, as a fraction of the scene (matches the runtime sprite)


def grad(stops):
    ys = [s[0] for s in stops]
    cols = np.stack([s[1] for s in stops])
    return np.stack([np.interp(Y[:, 0], ys, cols[:, c]) for c in range(3)], -1)[:, None, :].astype(np.float32)


# ----------------------------------------------------------------------------- sky
def stars(rng, field, count, tint_a, tint_b, horizon=0.66):
    xs = rng.random(count) * (W - 1)
    ys = (rng.random(count) ** 1.35) * H * horizon
    b = 0.12 + rng.random(count) ** 7 * 1.6
    t = rng.random(count)[:, None]
    col = tint_a[None] * (1 - t) + tint_b[None] * t
    faint = b < 0.7
    xi, yi = xs[faint].astype(int), ys[faint].astype(int)
    fx, fy = xs[faint] - xi, ys[faint] - yi
    for dy, dx, wgt in ((0, 0, (1 - fx) * (1 - fy)), (0, 1, fx * (1 - fy)), (1, 0, (1 - fx) * fy), (1, 1, fx * fy)):
        yy, xx = np.clip(yi + dy, 0, H - 1), np.clip(xi + dx, 0, W - 1)
        for c in range(3):
            np.add.at(field[..., c], (yy, xx), (b[faint] * wgt) * col[faint, c])
    k = np.arange(-9, 10)
    g = np.exp(-(k[:, None] ** 2 + k[None, :] ** 2) / (2 * 1.3 ** 2))
    for i in np.nonzero(~faint)[0]:
        x0, y0 = int(xs[i]), int(ys[i])
        if x0 < 10 or y0 < 10 or x0 > W - 11 or y0 > H - 11:
            continue
        stamp = g * b[i]
        if b[i] > 1.1:  # a soft cross glint on the brightest few
            glint = np.zeros_like(g)
            glint[9, :] += np.exp(-np.abs(k) / 3.2)
            glint[:, 9] += np.exp(-np.abs(k) / 3.2)
            stamp = stamp + glint * 0.35 * b[i]
        halo = np.exp(-(k[:, None] ** 2 + k[None, :] ** 2) / (2 * 5.0 ** 2)) * 0.06 * b[i]
        field[y0 - 9:y0 + 10, x0 - 9:x0 + 10] += (stamp + halo)[..., None] * col[i][None, None]


def sky_layer(tid, st, rng):
    deep, mid, glow, acc = (rgb(c) for c in THEMES[tid])
    white = np.array([1, 0.97, 0.9], np.float32)
    img = grad([(0, deep * 0.28), (0.3, mix(deep, mid, 0.2) * 0.7), (0.56, mix(deep, mid, 0.75)),
                (0.68, mix(mid, glow, 0.32)), (0.8, mix(mid, deep, 0.3)), (1, deep * 0.6)])
    img = np.broadcast_to(img, (H, W, 3)).copy()
    # horizon glow and the moon's wash of light
    img += (glow * 0.22)[None, None] * np.exp(-((Y - 0.67) / 0.07) ** 2)[..., None]
    d = np.sqrt(((X - MOON[0]) * 0.5) ** 2 + (Y - MOON[1]) ** 2)
    img += mix(mix(white, glow, 0.45), acc, 0.15)[None, None] * (0.26 * np.exp(-d / 0.07) + 0.08 * np.exp(-d / 0.28))[..., None]

    kind = st['sky']
    if kind == 'aurora':
        cx = fbm1(rng, W, 3)
        centre = 0.3 + 0.2 * (cx - 0.5) + 0.05 * np.sin(X[0] * 9.0 + 1.0)
        streak = fbm1(rng, W, 40, octaves=4) ** 2.2
        curtain = fbm1(rng, W, 6) ** 1.5
        dy = Y - centre[None, :]
        up = np.exp(np.minimum(dy, 0) / 0.11) * (dy < 0)
        down = np.exp(-np.maximum(dy, 0) / 0.035) * (dy >= 0)
        inten = (up + down) * (0.25 + 1.3 * streak[None, :]) * (0.3 + curtain[None, :])
        shimmer = fbm2(rng, H, W, 40, 2, octaves=3)
        inten *= 0.6 + 0.8 * shimmer
        hue = smoothstep(0, 0.12, -dy)[..., None]
        col = mix(mix(glow, white, 0.25)[None, None], mix(acc, np.array([0.6, 0.35, 1.0], np.float32), 0.45)[None, None], hue)
        img += col * (inten * 0.75)[..., None] * (1 - smoothstep(0.5, 0.64, Y))[..., None]
        # a fainter second curtain higher up
        c2 = 0.14 + 0.12 * (fbm1(rng, W, 4) - 0.5)
        dy2 = Y - c2[None, :]
        i2 = (np.exp(np.minimum(dy2, 0) / 0.07) * (dy2 < 0) + np.exp(-np.maximum(dy2, 0) / 0.01) * (dy2 >= 0)) * (0.2 + fbm1(rng, W, 50, octaves=4)[None, :] ** 2)
        img += mix(glow, acc, 0.3)[None, None] * (i2 * 0.3)[..., None]
    elif kind in ('nebula', 'galaxy'):
        # a dusty milky-way band running corner to corner, with darker dust lanes
        a, b_ = (0.0, 0.55), (1.0, 0.08)
        nx, ny = b_[1] - a[1], -(b_[0] - a[0])
        nl = math.hypot(nx, ny)
        dist = ((X - a[0]) * nx + (Y - a[1]) * ny) / nl
        band = np.exp(-(dist / 0.085) ** 2)
        detail = fbm2(rng, H, W, 10, 5, octaves=7)
        dust = fbm2(rng, H, W, 16, 8, octaves=6, ridged=True)
        neb = band * (0.35 + 1.2 * detail ** 2) * (1 - 0.75 * smoothstep(0.55, 0.85, dust) * band)
        col = mix(glow[None, None], acc[None, None], smoothstep(0.3, 0.8, detail)[..., None])
        img += col * (neb * (0.5 if kind == 'nebula' else 0.38))[..., None]
        clouds = fbm2(rng, H, W, 5, 3, octaves=6)
        img += mix(glow, acc, 0.5)[None, None] * (smoothstep(0.55, 0.85, clouds) * 0.12 * (1 - smoothstep(0.4, 0.62, Y)))[..., None]
        fine = np.zeros((H, W, 3), np.float32)
        stars(rng, fine, 26000, white, mix(white, glow, 0.5), horizon=0.6)
        img += fine * (band * 0.5)[..., None]
    elif kind == 'sunset':
        img += (acc * 0.55)[None, None] * np.exp(-((Y - 0.66) / 0.05) ** 2)[..., None]
        img += (glow * 0.35)[None, None] * np.exp(-((Y - 0.6) / 0.14) ** 2)[..., None]
        strat = fbm2(rng, H, W, 40, 3, octaves=6)
        bands = smoothstep(0.52, 0.72, strat) * smoothstep(0.25, 0.4, Y) * (1 - smoothstep(0.6, 0.66, Y))
        lit = mix(glow, acc, smoothstep(0.35, 0.62, Y)[..., None])
        img = mix(img, lit * 0.85, (bands * 0.75)[..., None])
        img = mix(img, deep[None, None] * 0.7, (smoothstep(0.62, 0.85, strat) * bands * 0.5)[..., None])

    # moonlit drifting cloud
    cl = fbm2(rng, H, W, 18, 3, octaves=7)
    den = smoothstep(0.58, 0.82, cl) * smoothstep(0.08, 0.2, Y) * (1 - smoothstep(0.5, 0.64, Y))
    lit = mix(mix(glow, white, 0.35) * 0.14, mix(white, glow, 0.3) * 0.5, np.exp(-d / 0.12)[..., None])
    img = img + lit * (den * 0.5)[..., None]

    field = np.zeros((H, W, 3), np.float32)
    stars(rng, field, 7000, white, mix(white, glow, 0.6))
    img += field * (1 - smoothstep(0.5, 0.68, Y))[..., None] * (1 - 0.6 * den)[..., None]
    return np.concatenate([img, np.ones((H, W, 1), np.float32)], -1)


# ----------------------------------------------------------------------------- ridges
def profile(rng, kind, base, amp):
    x = np.linspace(0, 1, W, dtype=np.float32)
    if kind == 'karst':
        h = np.zeros(W, np.float32)
        for _ in range(16):
            c, w, a = rng.random(), 0.02 + rng.random() * 0.045, 0.35 + rng.random() * 0.65
            h = np.maximum(h, a * (1 / (1 + ((x - c) / w) ** 2)) ** 1.6)
        h = 0.85 * h + 0.15 * fbm1(rng, W, 12)
    elif kind == 'fuji':
        h = np.clip(1 - np.abs(x - 0.62) / 0.42, 0, 1) ** 1.25 * 1.0 + 0.04 * fbm1(rng, W, 30)
        h = np.minimum(h, 0.94 + 0.02 * fbm1(rng, W, 40))
    elif kind == 'mesa':
        f = fbm1(rng, W, 4)
        h = np.round(f * 5) / 5 * 0.8 + 0.05 * fbm1(rng, W, 60)
        from scipy.ndimage import uniform_filter1d
        h = uniform_filter1d(h, 9)
    elif kind == 'jagged':
        f = fbm1(rng, W, 5, octaves=8, gain=0.6)
        h = 1 - np.abs(f * 2 - 1)
        h = h ** 1.4
    else:  # soft hills
        h = fbm1(rng, W, 3, octaves=7)
    h = (h - h.min()) / (h.max() - h.min() + 1e-6)
    return base - amp * h


def ridge(rng, kind, base, amp, col, mist, rim, fade, tex=0.18):
    p = profile(rng, kind, base * H, amp * H)
    yy = np.arange(H, dtype=np.float32)[:, None]
    below = yy - p[None, :]
    alpha = np.clip(below + 0.5, 0, 1)
    depth = np.clip(below / (fade * H), 0, 1)
    rock = fbm2(rng, H, W, 30, 12, octaves=6, ridged=True)
    c = mix(col[None, None], mist[None, None], smoothstep(0, 1, depth)[..., None] ** 0.8)
    c = c * (1 - tex + tex * 2 * rock[..., None] * (1 - depth[..., None]))
    slope = np.gradient(p)
    lit = np.clip(-slope, 0, 2.5) / 2.5 * 0.8 + 0.2
    c += rim[None, None] * (np.exp(-np.maximum(below, 0) / 5.0) * alpha * lit[None, :])[..., None]
    return np.concatenate([c, alpha[..., None]], -1).astype(np.float32), p


# ----------------------------------------------------------------------------- vector props
class Canvas:
    """RGBA drawing surface at 2x, composited with numpy afterwards."""
    def __init__(self):
        self.im = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def array(self, blur=0):
        im = self.im.resize((W, H), Image.LANCZOS)
        if blur:
            im = im.filter(ImageFilter.GaussianBlur(blur))
        return np.asarray(im).astype(np.float32) / 255.0


def c8(col, a=1.0):
    return tuple(int(max(0, min(1, v)) * 255) for v in col) + (int(a * 255),)


def pine(cv, x, yb, h, col, rng, lean=0.0, rim=None):
    d, s = cv.d, SS
    rim = col if rim is None else rim
    pts = []
    n = 14
    for i in range(n + 1):
        t = i / n
        pts.append((x + lean * h * t * t + math.sin(t * 5 + x) * h * 0.02, yb - h * t))
    for i in range(n):
        w = h * 0.045 * (1 - pts[i][1] * 0 - i / n * 0.7)
        d.line([(pts[i][0] * s, pts[i][1] * s), (pts[i + 1][0] * s, pts[i + 1][1] * s)], fill=c8(col), width=max(2, int(w * s)))
    tiers = 7
    for k in range(tiers):
        t = 0.35 + 0.65 * k / (tiers - 1)
        i = min(n, int(t * n))
        bx, by = pts[i]
        side = -1 if k % 2 else 1
        length = h * (0.42 - 0.3 * t) * (0.8 + 0.4 * rng.random())
        ex, ey = bx + side * length, by - h * 0.03
        d.line([(bx * s, by * s), (ex * s, ey * s)], fill=c8(col), width=max(2, int(h * 0.012 * s)))
        pad_w, pad_h = length * 0.9 + h * 0.06, h * 0.05
        foliage(d, ex - side * pad_w * 0.3, ey - pad_h * 0.4, pad_w, pad_h, col, rim, rng)
    tx, ty = pts[-1]
    foliage(d, tx, ty, h * 0.2, h * 0.06, col, rim, rng)


def foliage(d, cx, cy, pw, ph, col, rim, rng):
    """A cloud-shaped pad of pine needles: a moonlit rim, the dark mass, then needle tufts on the edge."""
    s = SS
    blobs = []
    for _ in range(46):
        px = cx + (rng.random() - 0.5) * pw
        py = cy + (rng.random() - 0.5) * ph * (1 - abs(px - cx) / pw)
        r = min(pw, ph * 3) * (0.08 + rng.random() * 0.1)
        blobs.append((px, py, r))
    for px, py, r in blobs:
        d.ellipse([(px - r * 1.1 - r * 0.15) * s, (py - r * 0.62 - r * 0.2) * s, (px + r * 1.1 - r * 0.15) * s, (py + r * 0.5 - r * 0.2) * s], fill=c8(rim))
    for px, py, r in blobs:
        d.ellipse([(px - r * 1.1) * s, (py - r * 0.6) * s, (px + r * 1.1) * s, (py + r * 0.5) * s], fill=c8(col))
    for px, py, r in blobs:
        for _ in range(7):
            a = rng.random() * math.pi * 2
            L = r * (0.9 + rng.random() * 0.8)
            d.line([(px * s, py * s), ((px + math.cos(a) * L * 1.4) * s, (py + math.sin(a) * L * 0.8) * s)], fill=c8(col), width=max(1, int(1.6 * s)))


def small_trees(cv, p, col, rng, every=7, size=26, start=0, end=W):
    s = SS
    for x in range(start, end, every):
        if rng.random() < 0.45:
            continue
        h = size * (0.5 + rng.random())
        y = p[min(W - 1, x)] + 2
        cv.d.polygon([((x - h * 0.22) * s, y * s), (x * s, (y - h) * s), ((x + h * 0.22) * s, y * s)], fill=c8(col))


def roof(d, cx, y, w, h, col, curl=0.35):
    s = SS
    pts = []
    for i in range(21):
        t = i / 20
        xx = cx - w / 2 + w * t
        edge = abs(t - 0.5) * 2
        yy = y - h * (1 - edge) ** 0.8 * 0.55 - h * curl * edge ** 6
        pts.append((xx * s, yy * s))
    pts += [((cx + w * 0.42) * s, (y + h * 0.18) * s), ((cx - w * 0.42) * s, (y + h * 0.18) * s)]
    d.polygon(pts, fill=c8(col))


def pagoda(cv, cx, yb, w, tiers, col, win, glow_cv=None):
    d, s = cv.d, SS
    y = yb
    tw = w
    for k in range(tiers):
        bh = w * 0.32 * (0.95 ** k)
        bw = tw * 0.62
        d.rectangle([(cx - bw / 2) * s, (y - bh) * s, (cx + bw / 2) * s, y * s], fill=c8(col))
        for j in (-1, 0, 1):
            wx = cx + j * bw * 0.28
            d.rectangle([(wx - bw * 0.06) * s, (y - bh * 0.72) * s, (wx + bw * 0.06) * s, (y - bh * 0.25) * s], fill=c8(win))
            if glow_cv is not None:
                glow_cv.d.ellipse([(wx - bw * 0.3) * s, (y - bh * 0.95) * s, (wx + bw * 0.3) * s, (y + bh * 0.05) * s], fill=c8(win, 0.5))
        y -= bh
        roof(d, cx, y + w * 0.02, tw * 1.08, w * 0.2, col)
        y -= w * 0.08
        tw *= 0.84
    d.rectangle([(cx - w * 0.012) * s, (y - w * 0.45) * s, (cx + w * 0.012) * s, y * s], fill=c8(col))
    for k in range(4):
        r = w * (0.045 - k * 0.007)
        yy = y - w * (0.08 + k * 0.09)
        d.ellipse([(cx - r) * s, (yy - r * 0.5) * s, (cx + r) * s, (yy + r * 0.5) * s], fill=c8(col))


def branch(cv, x, y, ang, length, width, depth, col, rng, tips):
    s = SS
    ex, ey = x + math.cos(ang) * length, y + math.sin(ang) * length
    mx = (x + ex) / 2 + (rng.random() - 0.5) * length * 0.25
    my = (y + ey) / 2 + (rng.random() - 0.5) * length * 0.25
    prev = (x, y)
    for i in range(1, 9):
        t = i / 8
        bx = (1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * ex
        by = (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ey
        wdt = width * (1 - 0.45 * t)
        cv.d.line([(prev[0] * s, prev[1] * s), (bx * s, by * s)], fill=c8(col), width=max(1, int(wdt * s)))
        r = wdt * 0.5
        cv.d.ellipse([(bx - r) * s, (by - r) * s, (bx + r) * s, (by + r) * s], fill=c8(col))
        prev = (bx, by)
    if depth == 0 or width < 2.2:
        tips.append((ex, ey))
        return
    for _ in range(2 + (rng.random() < 0.4)):
        branch(cv, ex, ey, ang + (rng.random() - 0.5) * 1.3, length * (0.6 + rng.random() * 0.2), width * 0.62, depth - 1, col, rng, tips)
    if depth < 3:
        tips.append((ex, ey))


def blossoms(cv, glow_cv, tips, rng, pink, light):
    s = SS
    for (tx, ty) in tips:
        for _ in range(int(14 + rng.random() * 18)):
            r = 5 + rng.random() * 9
            px, py = tx + (rng.random() - 0.5) * 70, ty + (rng.random() - 0.5) * 55
            t = rng.random()
            col = mix(pink, light, t)
            cv.d.ellipse([(px - r) * s, (py - r) * s, (px + r) * s, (py + r) * s], fill=c8(col))
            if rng.random() < 0.5:
                cv.d.ellipse([(px - r * 0.3) * s, (py - r * 0.3) * s, (px + r * 0.3) * s, (py + r * 0.3) * s], fill=c8(mix(light, np.ones(3, np.float32), 0.5)))
            glow_cv.d.ellipse([(px - r * 3) * s, (py - r * 3) * s, (px + r * 3) * s, (py + r * 3) * s], fill=c8(pink, 0.35))


def windows(cv, glow_cv, x0, x1, y0, y1, n, col, rng, size=(6, 10)):
    s = SS
    for _ in range(n):
        x = x0 + rng.random() * (x1 - x0)
        y = y0 + rng.random() * (y1 - y0)
        w, h = size[0] * (0.6 + rng.random() * 0.8), size[1] * (0.6 + rng.random() * 0.8)
        c = mix(col, np.ones(3, np.float32), rng.random() * 0.4)
        cv.d.rectangle([x * s, y * s, (x + w) * s, (y + h) * s], fill=c8(c))
        glow_cv.d.ellipse([(x - w * 2) * s, (y - h * 1.5) * s, (x + w * 3) * s, (y + h * 2.5) * s], fill=c8(col, 0.35))


def water(scene, y0, deep, glow, acc, rng):
    """Mirror everything above y0 into a rippled, darkened lake below it."""
    out = np.zeros((H, W, 4), np.float32)
    rows = np.arange(y0, H)
    src = np.clip(2 * y0 - rows, 0, H - 1)
    ripple = fbm2(rng, H - y0, W, 60, 4, octaves=4)
    dx = ((ripple - 0.5) * 30 * (1 + (rows - y0)[:, None] / (H - y0) * 2)).astype(int)
    xs = np.clip(np.arange(W)[None, :] + dx, 0, W - 1)
    refl = scene[src[:, None], xs, :3]
    fade = ((rows - y0) / (H - y0))[:, None, None]
    col = mix(refl * 0.62, deep[None, None] * 0.5, np.clip(fade * 1.2, 0, 1))
    streak = fbm2(rng, H - y0, W, 160, 3, octaves=3)
    gl = smoothstep(0.7, 0.9, streak) * np.exp(-((np.arange(W)[None, :] / W - MOON[0] - 0.05) / 0.12) ** 2)
    col += mix(acc, np.ones(3, np.float32), 0.5)[None, None] * (gl * 0.55)[..., None]
    col += glow[None, None] * (np.exp(-(rows - y0) / 6.0)[:, None, None] * 0.25)
    out[y0:, :, :3] = col
    out[y0:, :, 3] = 1
    return out


# ----------------------------------------------------------------------------- scene
def render(tid):
    st = STYLE[tid]
    rng = np.random.default_rng(st['seed'])
    deep, mid, glow, acc = (rgb(c) for c in THEMES[tid])
    white = np.ones(3, np.float32)
    print(tid, 'sky'); sky = sky_layer(tid, st, rng)

    print(tid, 'far')
    far_mist = mix(mix(mid, glow, 0.3), deep, 0.15)
    far1, _ = ridge(rng, st['far'], 0.6, 0.13 if st['far'] != 'fuji' else 0.24, mix(deep, glow, 0.16), far_mist, mix(glow, white, 0.3) * 0.5, 0.06, 0.12)
    if st['far'] == 'fuji':  # a snow cap on the volcano
        cap = smoothstep(0.012, 0.0, (Y - (0.36 + 0.01 * np.sin(X * 90)))) * (far1[..., 3] > 0)
        far1[..., :3] = mix(far1[..., :3], mix(white, glow, 0.25) * 0.8, (cap * 0.85)[..., None])
    far2, _ = ridge(rng, 'soft' if st['far'] == 'fuji' else st['far'], 0.65, 0.07, mix(deep, mid, 0.55), mix(mid, glow, 0.25), mix(glow, white, 0.3) * 0.35, 0.05, 0.14)
    far = over(far1, far2)
    fog = (glow * 0.6 + mid * 0.4)
    band = np.exp(-((Y - 0.645) / 0.03) ** 2) * (0.25 + 0.5 * fbm2(rng, H, W, 12, 3, octaves=4))
    far = over(far, np.concatenate([np.broadcast_to(fog, (H, W, 3)), (band * 0.55)[..., None]], -1).astype(np.float32))

    print(tid, 'mid')
    mkind = {'pines': 'soft', 'hills': 'soft'}.get(st['mid'], st['mid'])
    mid1, p1 = ridge(rng, mkind, 0.71, 0.09, mix(deep, mid, 0.35) * 0.8, mix(mid, glow, 0.18) * 0.8, mix(glow, white, 0.2) * 0.3, 0.07)
    mid2, p2 = ridge(rng, 'soft', 0.76, 0.05, deep * 0.75, mix(deep, mid, 0.5) * 0.8, mix(glow, white, 0.2) * 0.2, 0.06)
    cv, gcv = Canvas(), Canvas()
    tree_col = mix(deep, mid, 0.3) * 0.75
    small_trees(cv, p1, tree_col, rng, every=9, size=24 if st['mid'] != 'pines' else 60)
    peak = int(np.argmin(p1[200:W - 200])) + 200
    if tid in ('jade', 'royal', 'sakura'):
        pagoda(cv, peak, p1[peak] + 8, 70 if tid != 'royal' else 90, 5, tree_col, mix(acc, white, 0.15), gcv)
    props = cv.array()
    pglow = gcv.array(blur=10)
    midl = over(over(mid1, np.concatenate([pglow[..., :3], pglow[..., 3:] * 0.8], -1)), props)
    midl = over(midl, mid2)
    cv2 = Canvas()
    small_trees(cv2, p2, deep * 0.6, rng, every=6, size=34)
    midl = over(midl, cv2.array())
    band = np.exp(-((Y - 0.74) / 0.025) ** 2) * (0.2 + 0.6 * fbm2(rng, H, W, 10, 3, octaves=4))
    midl = over(midl, np.concatenate([np.broadcast_to(fog * 0.85, (H, W, 3)), (band * 0.4)[..., None]], -1).astype(np.float32))

    print(tid, 'near')
    near = np.zeros((H, W, 4), np.float32)
    cv, gcv = Canvas(), Canvas()
    dark = deep * 0.35
    kind = st['near']
    if kind in ('river', 'lake'):
        scene = over(over(sky, far), midl)
        near = water(scene, int(0.8 * H), deep, glow, acc, rng)
        shore, _ = ridge(rng, 'soft', 0.83, 0.03, dark, dark * 1.4, mix(glow, white, 0.2) * 0.25, 0.1, 0.25)
        lx = np.linspace(0, 1, W)[None, :]
        shore[..., 3] *= np.clip(1 - np.exp(-((lx - 0.5) / 0.3) ** 2) * 1.6, 0, 1)
        near = over(near, shore)
        if kind == 'river':
            pine(cv, 120, H * 0.93, H * 0.36, dark, rng, lean=0.25, rim=mix(dark, glow, 0.45))
            pine(cv, W - 160, H * 0.95, H * 0.24, dark, rng, lean=-0.35, rim=mix(dark, glow, 0.45))
        else:
            for bx, bh in ((70, 0.5), (190, 0.36), (W - 120, 0.44), (W - 260, 0.3)):
                birch(cv, bx, H * 0.97, H * bh, rng, mix(mix(white, glow, 0.35), deep, 0.35) * 0.62, dark)
            reeds(cv, rng, dark)
    elif kind == 'blossom':
        hill, _ = ridge(rng, 'soft', 0.86, 0.04, dark, dark * 1.3, mix(glow, white, 0.3) * 0.3, 0.08)
        near = over(near, hill)
        tips = []
        trunk = mix(deep, np.array([0.2, 0.08, 0.1], np.float32), 0.5) * 0.6
        branch(cv, W + 20, H * 0.9, -2.2, H * 0.17, 46, 6, trunk, rng, tips)
        branch(cv, -20, H * 0.97, -0.9, H * 0.12, 34, 5, trunk, rng, tips)
        blossoms(cv, gcv, tips, rng, mix(glow, np.array([1, 0.55, 0.7], np.float32), 0.4), np.array([1, 0.9, 0.94], np.float32))
        for _ in range(260):  # petals on the wind
            px, py, r = rng.random() * W, H * (0.3 + rng.random() * 0.65), 3 + rng.random() * 5
            cv.d.ellipse([(px - r * 1.4) * SS, (py - r) * SS, (px + r * 1.4) * SS, (py + r) * SS], fill=c8(mix(glow, white, 0.5), 0.85))
    elif kind == 'village':
        y = H * 0.9
        x = -40
        while x < W:
            w = 120 + rng.random() * 160
            hgt = 60 + rng.random() * 80
            base = y + rng.random() * 40
            cv.d.rectangle([x * SS, (base - hgt) * SS, (x + w) * SS, H * SS], fill=c8(dark))
            roof(cv.d, x + w / 2, base - hgt, w * 1.25, 46, dark, curl=0.5)
            windows(cv, gcv, x + 15, x + w - 25, base - hgt + 20, base - 20, 3, mix(acc, white, 0.1), rng, (12, 18))
            x += w * 0.92
        pagoda(cv, W * 0.8, H * 0.89, 150, 6, dark, mix(acc, white, 0.15), gcv)
    elif kind == 'gate':
        hill, _ = ridge(rng, 'soft', 0.87, 0.03, dark, dark * 1.2, mix(glow, white, 0.3) * 0.3, 0.08)
        near = over(near, hill)
        gx, gy, gw = W * 0.5, H * 0.875, 520
        for px in (-0.42, -0.14, 0.14, 0.42):
            cv.d.rectangle([(gx + px * gw - 16) * SS, (gy - 340) * SS, (gx + px * gw + 16) * SS, gy * SS], fill=c8(dark))
        cv.d.rectangle([(gx - gw * 0.5) * SS, (gy - 300) * SS, (gx + gw * 0.5) * SS, (gy - 270) * SS], fill=c8(dark))
        roof(cv.d, gx, gy - 340, gw * 0.7, 70, dark, 0.5)
        roof(cv.d, gx - gw * 0.28, gy - 300, gw * 0.42, 50, dark, 0.5)
        roof(cv.d, gx + gw * 0.28, gy - 300, gw * 0.42, 50, dark, 0.5)
        cv.d.rectangle([(gx - 70) * SS, (gy - 440) * SS, (gx + 70) * SS, (gy - 380) * SS], fill=c8(mix(acc, dark, 0.45)))
        gcv.d.ellipse([(gx - 200) * SS, (gy - 470) * SS, (gx + 200) * SS, (gy - 350) * SS], fill=c8(acc, 0.35))
        for k in range(9):  # steps
            yy = gy + k * 14
            cv.d.rectangle([(gx - 140 - k * 30) * SS, yy * SS, (gx + 140 + k * 30) * SS, (yy + 10) * SS], fill=c8(dark * 1.3))
        pine(cv, 90, H * 0.95, H * 0.3, dark, rng, lean=0.3, rim=mix(dark, glow, 0.45))
        pine(cv, W - 90, H * 0.96, H * 0.26, dark, rng, lean=-0.3, rim=mix(dark, glow, 0.45))
    elif kind == 'city':
        x = -20
        while x < W:
            w = 70 + rng.random() * 120
            hgt = 120 + rng.random() * 380 * (1.2 - abs(x / W - 0.5))
            base = H * 0.92
            cv.d.rectangle([x * SS, (base - hgt) * SS, (x + w) * SS, H * SS], fill=c8(dark))
            if rng.random() < 0.45:
                roof(cv.d, x + w / 2, base - hgt, w * 1.3, 36, dark, curl=0.45)
            windows(cv, gcv, x + 8, x + w - 14, base - hgt + 14, base - 10, int(hgt / 16), acc, rng, (6, 9))
            x += w + rng.random() * 12
        pagoda(cv, W * 0.32, H * 0.86, 170, 7, dark, mix(acc, white, 0.2), gcv)
    props, pglow = cv.array(), gcv.array(blur=28)
    near = over(near, np.concatenate([pglow[..., :3], pglow[..., 3:] * 0.9], -1))
    near = over(near, props)
    # a little mist hugging the ground
    band = np.exp(-((Y - 0.9) / 0.03) ** 2) * (0.15 + 0.5 * fbm2(rng, H, W, 8, 3, octaves=4))
    near = over(near, np.concatenate([np.broadcast_to(fog * 0.7, (H, W, 3)), (band * 0.35)[..., None]], -1).astype(np.float32))
    return {'sky': sky, 'far': far, 'mid': midl, 'near': near}


def birch(cv, x, yb, h, rng, bark, dark):
    s = SS
    w = h * 0.022
    cv.d.polygon([((x - w) * s, yb * s), ((x - w * 0.4) * s, (yb - h) * s), ((x + w * 0.4) * s, (yb - h) * s), ((x + w) * s, yb * s)], fill=c8(bark))
    cv.d.polygon([((x + w * 0.1) * s, yb * s), ((x + w * 0.05) * s, (yb - h) * s), ((x + w * 0.4) * s, (yb - h) * s), ((x + w) * s, yb * s)], fill=c8(mix(bark, dark, 0.55)))
    for _ in range(int(h / 18)):
        yy = yb - rng.random() * h
        ww = w * (0.3 + rng.random() * 0.7)
        cv.d.ellipse([(x - ww) * s, (yy - 3) * s, (x + ww * rng.random()) * s, (yy + 3) * s], fill=c8(dark))
    for k in range(5):
        by = yb - h * (0.55 + k * 0.09)
        side = 1 if k % 2 else -1
        cv.d.line([(x * s, by * s), ((x + side * h * 0.12) * s, (by - h * 0.08) * s)], fill=c8(dark), width=int(4 * s))


def reeds(cv, rng, dark):
    s = SS
    for _ in range(160):
        x = rng.random() * W
        if 0.3 * W < x < 0.7 * W:
            continue
        h = 60 + rng.random() * 160
        yb = H * (0.86 + rng.random() * 0.12)
        bend = (rng.random() - 0.5) * 40
        cv.d.line([(x * s, yb * s), ((x + bend) * s, (yb - h) * s)], fill=c8(dark), width=int(3 * s))


def moon():
    rng = np.random.default_rng(5)
    n = 640
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = n / 2
    r = n * 0.47
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    alpha = np.clip((1 - d) * r, 0, 1)
    limb = np.sqrt(np.clip(1 - d ** 2, 0, 1)) ** 0.35
    maria = fbm2(rng, n, n, 3, 3, octaves=6)
    tone = 1 - 0.28 * smoothstep(0.45, 0.7, maria)
    fine = fbm2(rng, n, n, 24, 24, octaves=4)
    tone *= 0.92 + 0.12 * fine
    shade = np.zeros((n, n), np.float32)
    for _ in range(70):
        ccx, ccy, cr = rng.random() * n, rng.random() * n, (rng.random() ** 3) * 34 + 3
        dd = np.sqrt((xx - ccx) ** 2 + (yy - ccy) ** 2) / cr
        shade -= 0.14 * np.exp(-((dd - 0.7) / 0.25) ** 2) * ((xx - ccx) > 0)
        shade += 0.12 * np.exp(-((dd - 0.95) / 0.12) ** 2) * ((xx - ccx) < 0)
    lum = np.clip(tone * limb + shade, 0, 1.1)
    col = np.stack([lum * 1.0, lum * 0.97, lum * 0.9], -1)
    return np.concatenate([col, alpha[..., None]], -1)


def save(arr, path, q, lossless=False):
    rng = np.random.default_rng(0)
    im = Image.fromarray(to8(arr, rng), 'RGBA' if arr.shape[2] == 4 else 'RGB')
    im.save(path, 'WEBP', quality=q, method=6, lossless=lossless)
    return im


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    m = moon()
    save(m, os.path.join(OUT, 'moon.webp'), 95)
    for tid in ids:
        layers = render(tid)
        d = os.path.join(OUT, tid)
        os.makedirs(d, exist_ok=True)
        comp = None
        for name in ('sky', 'far', 'mid', 'near'):
            arr = layers[name]
            if name == 'sky':
                arr = arr[..., :3]
            im = save(arr, os.path.join(d, name + '.webp'), 92)
            im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(d, name + '-lite.webp'), 'WEBP', quality=86, method=6)
            comp = layers[name] if comp is None else over(comp, layers[name])
        full = Image.fromarray(to8(comp[..., :3]))
        full.resize((W // 4, H // 4), Image.LANCZOS).save(os.path.join(d, 'preview.jpg'), quality=88)
        full.crop((0, int(H * 0.42), W, int(H * 0.42) + W * 3 // 4)).resize((480, 360), Image.LANCZOS).save(os.path.join(d, 'thumb.webp'), 'WEBP', quality=88)
        print(tid, 'done')


if __name__ == '__main__':
    main(sys.argv[1:] or list(STYLE))
