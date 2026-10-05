"""Shared helpers for the offline art and audio generators (numpy + scipy + Pillow)."""
import numpy as np
from scipy import ndimage

THEMES = {
    # id: deep, mid, glow, accent (same colours as js/tiles.js THEMES[].bg)
    'jade': ['#0b2621', '#145244', '#2bc293', '#ffc94a'],
    'sakura': ['#2a0c20', '#64184a', '#ff86b8', '#ffd166'],
    'lagoon': ['#061a30', '#0c4775', '#47cdff', '#7cffcb'],
    'ember': ['#260f05', '#71290b', '#ffa24a', '#ffe066'],
    'royal': ['#140a30', '#381c7a', '#b388ff', '#ff86b8'],
    'obsidian': ['#06070e', '#191d3a', '#6c7cff', '#e8c46a'],
}


def rgb(h):
    v = int(h[1:], 16)
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], np.float32) / 255.0


def mix(a, b, t):
    return a * (1 - t) + b * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def noise2(rng, h, w, cy, cx):
    """Smooth value noise in [0,1], cy x cx cells over an h x w field."""
    g = rng.random((cy + 4, cx + 4)).astype(np.float32)
    z = ndimage.zoom(g, ((h + 1) / cy, (w + 1) / cx), order=3, mode='reflect', grid_mode=False)
    oy, ox = int(1.5 * h / cy), int(1.5 * w / cx)
    return np.clip(z[oy:oy + h, ox:ox + w], 0, 1)


def fbm2(rng, h, w, cy, cx, octaves=6, gain=0.5, ridged=False):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = noise2(rng, h, w, max(1, cy << o), max(1, cx << o))
        if ridged:
            n = 1 - np.abs(n * 2 - 1)
        out += amp * n
        tot += amp
        amp *= gain
        if (cy << o) > h // 2 or (cx << o) > w // 2:
            break
    return out / tot


def fbm1(rng, n, cells, octaves=7, gain=0.55):
    out = np.zeros(n, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells << o
        if c > n // 2:
            break
        pts = rng.random(c + 4).astype(np.float32)
        z = ndimage.zoom(pts, (n + 1) / c, order=3, mode='reflect', grid_mode=False)
        off = int(1.5 * n / c)
        out += amp * z[off:off + n]
        tot += amp
        amp *= gain
    return out / tot


def over(dst, src):
    """Alpha-composite premultiplied-free RGBA src over dst (both float HxWx4)."""
    a = src[..., 3:4]
    da = dst[..., 3:4]
    oa = a + da * (1 - a)
    rgb_ = (src[..., :3] * a + dst[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb_, oa], -1)


def to8(img, rng=None):
    """Float image to uint8 with a little dither so smooth gradients do not band."""
    if rng is not None:
        img = img + (rng.random(img.shape).astype(np.float32) - 0.5) / 255.0
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
