"""Photo-real wood for the tile faces, one 1024x1024 texture per tile set.

Plain-sawn boards: growth rings cut at a shallow angle (the "cathedral" arches), wavy fibre, open pores
along the grain, medullary-ray flecks, and slow colour drift across the board. Colours come from each
set's face/grain colours in js/tiles.js.     python3 tools/art/wood.py   (numpy, scipy, Pillow)
"""
import os
import numpy as np
from PIL import Image
from common import rgb, mix, smoothstep, fbm2, noise2, to8

N = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'wood')
WOODS = {
    # id: face light, face dark, grain, ring density, figure strength, ray flecks
    'jade': ('#efd6a6', '#dcb57d', '#a26b33', 9, 0.55, 0.0),     # maple: fine, pale, subtle
    'sakura': ('#e7b28f', '#cd8a66', '#86432a', 7, 0.6, 0.15),   # cherry: warm, smooth
    'lagoon': ('#f4e7cc', '#e2cda7', '#b0915f', 11, 0.4, 0.0),   # birch: very pale, faint
    'ember': ('#dca46a', '#be8048', '#6f4019', 6, 0.75, 0.25),   # teak: bold, oily
    'royal': ('#a9614a', '#874434', '#4a1d14', 8, 0.85, 0.1),    # rosewood: dark streaks
    'obsidian': ('#43352e', '#261c18', '#0c0806', 10, 0.6, 0.0),  # ebony: near black, satin
}


def wood(tid, seed):
    light, darkc, grain, rings, figure, rays = WOODS[tid]
    L, D, G = rgb(light), rgb(darkc), rgb(grain)
    rng = np.random.default_rng(seed)
    v, u = np.mgrid[0:N, 0:N].astype(np.float32) / N
    # tileable-ish warp fields
    warp_u = (fbm2(rng, N, N, 3, 2, octaves=4) - 0.5) * 0.045
    warp_v = (fbm2(rng, N, N, 2, 3, octaves=4) - 0.5) * 0.08
    uu = u + warp_u
    # Plain-sawn: ring index grows with distance from the pith (off to one side, below the board) plus
    # the board's slope along its length -> nested arches pointing along the grain.
    pith = 0.5 + 0.08 * np.sin(v * 1.7 + 1.3)
    ring_val = np.sqrt((uu - pith) ** 2 * 1.6 + (0.05 + 0.55 * (v + warp_v)) ** 2) * rings * 2.2
    ring_val += (fbm2(rng, N, N, 4, 8, octaves=4) - 0.5) * 0.35
    frac = ring_val - np.floor(ring_val)
    # earlywood -> latewood: slow lightening then a sharp dark band
    late = smoothstep(0.78, 0.93, frac) * (1 - smoothstep(0.95, 1.0, frac)) + 0.25 * smoothstep(0.3, 0.93, frac)
    # fibre: long streaks along v
    fibre = fbm2(rng, N, N, 3, 160, octaves=3)
    fibre2 = fbm2(rng, N, N, 8, 380, octaves=2)
    # slow colour drift and figure
    drift = fbm2(rng, N, N, 2, 2, octaves=4)
    streak = fbm2(rng, N, N, 1, 14, octaves=4)
    col = mix(L[None, None], D[None, None], (0.25 + 0.6 * drift)[..., None])
    col = mix(col, G[None, None], (late * figure * 0.55)[..., None])
    col = mix(col, D[None, None] * 0.9, (smoothstep(0.55, 0.8, streak) * figure * 0.5)[..., None])
    col *= (0.9 + 0.12 * fibre + 0.06 * fibre2)[..., None]
    # pores: tiny dark dashes along the grain, denser in the latewood
    pore_field = noise2(rng, N, N, 300, 900)
    pores = smoothstep(0.82, 0.95, pore_field) * (0.35 + 0.65 * late)
    col = mix(col, G[None, None] * 0.6, (pores * 0.45)[..., None])
    if rays:
        rf = fbm2(rng, N, N, 90, 30, octaves=2)
        flecks = smoothstep(0.8, 0.9, rf) * rays * 0.5
        col = mix(col, mix(L, np.ones(3, np.float32), 0.3)[None, None], flecks[..., None])
    # satin sheen catching the fibre
    col += (fibre2 - 0.5)[..., None] * 0.04
    return np.clip(col, 0, 1)


def main():
    os.makedirs(OUT, exist_ok=True)
    for k, tid in enumerate(WOODS):
        arr = wood(tid, 3100 + k)
        rng = np.random.default_rng(k)
        Image.fromarray(to8(arr, rng)).save(os.path.join(OUT, tid + '.webp'), 'WEBP', quality=94, method=6)
        print(tid, os.path.getsize(os.path.join(OUT, tid + '.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
