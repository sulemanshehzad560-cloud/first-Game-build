"""Premium tile materials for the coin shop: stone, metal and plant surfaces at 1024x1024, rendered the
same way as wood.py (numpy noise, fixed seeds).    python3 tools/art/materials.py   -> assets/wood/<id>.webp
"""
import os
import numpy as np
from PIL import Image
from common import rgb, mix, smoothstep, fbm2, noise2, to8

N = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'wood')


def grid():
    v, u = np.mgrid[0:N, 0:N].astype(np.float32) / N
    return u, v


def veins(rng, u, v, freq, warp, width):
    w = fbm2(rng, N, N, 3, 3, octaves=6)
    t = np.abs(np.sin((u * 0.8 + v * 0.6) * freq + w * warp))
    return smoothstep(width, 0.0, t)


def marble(rng):
    u, v = grid()
    cloud = fbm2(rng, N, N, 3, 3, octaves=6)
    col = mix(rgb('#f4f1ea')[None, None], rgb('#d9d5cc')[None, None], (cloud * 0.8)[..., None])
    col = mix(col, rgb('#6e6a66')[None, None], (veins(rng, u, v, 9, 7, 0.05) * 0.75)[..., None])
    col = mix(col, rgb('#a9a39a')[None, None], (veins(rng, u, v, 23, 11, 0.06) * 0.45)[..., None])
    col = mix(col, rgb('#8d8780')[None, None], (veins(rng, u, v, 15, 5, 0.03) * 0.5)[..., None])
    return col


def jadestone(rng):
    u, v = grid()
    m = fbm2(rng, N, N, 4, 4, octaves=6)
    col = mix(rgb('#0f6b47')[None, None], rgb('#4fbf8d')[None, None], smoothstep(0.3, 0.75, m)[..., None])
    cloud = fbm2(rng, N, N, 2, 2, octaves=5)
    col = mix(col, rgb('#c9f2dc')[None, None], (smoothstep(0.62, 0.85, cloud) * 0.45)[..., None])
    specks = smoothstep(0.92, 0.97, noise2(rng, N, N, 420, 420))
    return mix(col, rgb('#06301f')[None, None], (specks * 0.45)[..., None])


def gold(rng):
    u, v = grid()
    brush = fbm2(rng, N, N, 220, 3, octaves=3)
    broad = fbm2(rng, N, N, 3, 3, octaves=4)
    col = mix(rgb('#a8781e')[None, None], rgb('#f6d77a')[None, None], (0.35 + 0.5 * broad + 0.25 * (brush - 0.5))[..., None])
    sheen = np.exp(-((u - 0.35) * 2.2) ** 2 - ((v - 0.3) * 1.6) ** 2)
    return np.clip(col + (sheen * 0.18)[..., None], 0, 1)


def ivory(rng):
    u, v = grid()
    base = fbm2(rng, N, N, 2, 2, octaves=5)
    lines = fbm2(rng, N, N, 3, 120, octaves=3)
    col = mix(rgb('#fbf3df')[None, None], rgb('#e8d9b5')[None, None], (base * 0.7)[..., None])
    return col * (0.97 + 0.05 * lines)[..., None]


def bamboo(rng):
    u, v = grid()
    fib = fbm2(rng, N, N, 3, 200, octaves=3)
    col = mix(rgb('#e3c770')[None, None], rgb('#b9973d')[None, None], (0.3 + 0.5 * fbm2(rng, N, N, 2, 4, octaves=4))[..., None])
    col *= (0.9 + 0.16 * fib)[..., None]
    for y in (0.22, 0.61, 0.93):   # nodes across the stalk
        band = np.exp(-((v - y) / 0.012) ** 2)
        col = mix(col, rgb('#7a5a1c')[None, None], (band * 0.75)[..., None])
        col = mix(col, rgb('#f3e2a2')[None, None], (np.exp(-((v - y - 0.02) / 0.01) ** 2) * 0.5)[..., None])
    return col


def obsidian(rng):
    u, v = grid()
    m = fbm2(rng, N, N, 3, 3, octaves=6)
    col = mix(rgb('#07070c')[None, None], rgb('#1c1b2e')[None, None], (m * 0.8)[..., None])
    ripple = np.sin((u * 3 + m * 6) * 6.28) * 0.5 + 0.5
    col += rgb('#4a5cff')[None, None] * (smoothstep(0.6, 0.95, m) * 0.18 * ripple)[..., None]
    sheen = np.exp(-((u - 0.3) * 2.5) ** 2 - ((v - 0.25) * 2.0) ** 2)
    return np.clip(col + (sheen * 0.12)[..., None], 0, 1)


def rosequartz(rng):
    u, v = grid()
    m = fbm2(rng, N, N, 3, 3, octaves=6)
    col = mix(rgb('#f2b8c6')[None, None], rgb('#e08aa3')[None, None], smoothstep(0.35, 0.8, m)[..., None])
    col = mix(col, np.ones(3, np.float32)[None, None], (veins(rng, u, v, 7, 9, 0.06) * 0.35)[..., None])
    return col


def lapis(rng):
    u, v = grid()
    m = fbm2(rng, N, N, 4, 4, octaves=6)
    col = mix(rgb('#0b1f6b')[None, None], rgb('#2c4fc4')[None, None], smoothstep(0.25, 0.8, m)[..., None])
    col = mix(col, rgb('#d8dbe8')[None, None], (veins(rng, u, v, 11, 9, 0.035) * 0.4)[..., None])
    fleck = smoothstep(0.93, 0.98, noise2(rng, N, N, 260, 260))
    return mix(col, rgb('#f1c95a')[None, None], (fleck * 0.9)[..., None])


MATERIALS = {'marble': marble, 'jadestone': jadestone, 'gold': gold, 'ivory': ivory, 'bamboo': bamboo,
             'obsidianglass': obsidian, 'rosequartz': rosequartz, 'lapis': lapis}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, (name, fn) in enumerate(MATERIALS.items()):
        rng = np.random.default_rng(7000 + k)
        arr = np.clip(fn(rng), 0, 1)
        Image.fromarray(to8(arr, np.random.default_rng(k))).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=93, method=6)
        print(name, os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'KB')
