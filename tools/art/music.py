"""Composes and renders the Jade Rush soundtrack: eight pentatonic pieces for guzheng-style plucked strings,
bamboo flute, bells, pads, frame drums and night ambience, all synthesised here (no samples).

    python3 tools/art/music.py [track ...]      ->  assets/music/<track>.m4a   (needs numpy, scipy, ffmpeg)

Every piece is generated from a fixed seed, so the output is reproducible.
"""
import os
import sys
import subprocess
import numpy as np
from scipy import signal

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'music')
GONG = [0, 2, 4, 7, 9]      # major pentatonic
YU = [0, 3, 5, 7, 10]       # minor pentatonic

TRACKS = {
    'menu': dict(root=62, mode=GONG, bpm=66, lead='flute', arp='pluck', drums=0, amb='crickets', seed=101,
                 prog=[0, 3, 1, 4], prog_b=[2, 3, 0, 4]),
    'jade': dict(root=64, mode=YU, bpm=70, lead='pluck', counter='flute', arp='pluck', drums=0, amb='water', seed=202,
                 prog=[0, 2, 3, 1], prog_b=[3, 4, 2, 0]),
    'sakura': dict(root=65, mode=GONG, bpm=76, lead='flute', counter='bell', arp='pluck', drums=1, amb='wind', seed=303,
                   prog=[0, 4, 3, 1], prog_b=[1, 3, 2, 4]),
    'lagoon': dict(root=67, mode=GONG, bpm=62, lead='bell', counter='flute', arp='pluck', drums=0, amb='water', seed=404,
                   prog=[1, 3, 0, 4], prog_b=[3, 2, 1, 4]),
    'ember': dict(root=62, mode=YU, bpm=88, lead='pluck', counter='flute', arp='pluck', drums=2, amb='fire', seed=505,
                  prog=[0, 3, 2, 4], prog_b=[3, 1, 4, 0]),
    'royal': dict(root=59, mode=YU, bpm=68, lead='flute', counter='bell', arp='pluck', drums=1, amb='wind', seed=606,
                  prog=[0, 1, 3, 2], prog_b=[2, 4, 1, 0]),
    'obsidian': dict(root=57, mode=YU, bpm=80, lead='pluck', counter='bell', arp='pluck', drums=1, amb='crickets', seed=707,
                     prog=[0, 2, 1, 4], prog_b=[3, 4, 1, 0]),
    'duel': dict(root=64, mode=YU, bpm=112, lead='flute', counter='pluck', arp='pluck', drums=3, amb=None, seed=808,
                 prog=[0, 3, 4, 2], prog_b=[3, 1, 2, 4], long=True),
}


# A second piece for every tile set, so long sessions alternate between two: same key and colour,
# different tune, tempo and lead instrument.
for _tid in ('jade', 'sakura', 'lagoon', 'ember', 'royal', 'obsidian'):
    _c = dict(TRACKS[_tid])
    _c['seed'] += 1
    _c['bpm'] = round(_c['bpm'] * (1.1 if _c['bpm'] < 80 else 0.9))
    _c['lead'], _c['counter'] = _c.get('counter', 'flute'), _c['lead']
    _c['prog'], _c['prog_b'] = _c['prog_b'][1:] + _c['prog_b'][:1], _c['prog'][2:] + _c['prog'][:2]
    TRACKS[_tid + '-2'] = _c

# Night ambience per world, layered from the generators below.
AMBIENCE = {
    'jade': ['water', 'crickets'], 'sakura': ['wind', 'chimes'], 'lagoon': ['water', 'wind'],
    'ember': ['fire', 'crickets'], 'royal': ['wind', 'chimes'], 'obsidian': ['crickets', 'water'],
}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, d, s, r, sr=SR):
    t = np.arange(n) / sr
    e = np.minimum(1, t / max(a, 1e-4))
    e = np.where(t > a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)), e)
    rel = max(1, int(r * sr))
    e[-rel:] *= np.linspace(1, 0, rel) ** 2
    return e


# ----------------------------------------------------------------------------- instruments
def pluck(f, dur, vel=1.0, bend=0.0, bright=0.6, rng=None):
    """Guzheng-like plucked string: inharmonic partials with frequency-dependent decay, a pick
    transient, and an optional pitch bend (the player pressing the string behind the bridge)."""
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    fm = f * (1 + bend * (1 - np.exp(-t / 0.18)))
    phase = 2 * np.pi * np.cumsum(fm) / SR
    out = np.zeros(n)
    B = 0.00018
    for k in range(1, 15):
        if f * k > 14000:
            break
        amp = (bright ** (k - 1)) / k ** 0.7 * (1 + 0.6 * np.sin(k * 1.7) ** 2)
        dec = 0.9 + 1.1 * k ** 1.15
        out += amp * np.sin(k * np.sqrt(1 + B * k * k) * phase + k * 0.3) * np.exp(-t * dec * (f / 330) ** 0.4)
    att = np.minimum(1, t / 0.0025)
    if rng is not None:
        nz = rng.standard_normal(int(0.03 * SR))
        b, a = signal.butter(2, [min(f * 2, 9000) / (SR / 2), min(f * 6, 20000) / (SR / 2)], 'band')
        tr = signal.lfilter(b, a, nz) * np.exp(-np.arange(len(nz)) / (0.006 * SR)) * 0.6
        out[:len(tr)] += tr
    rel = env_adsr(n, 0.001, 1, 1, 0.25)
    return out * att * rel * vel * 0.28


def flute(f, dur, vel=1.0, rng=None, grace=None):
    """Bamboo flute (dizi): breathy fundamental, soft harmonics, delayed vibrato, and the paper
    membrane's buzz as a touch of upper harmonics."""
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0055 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.25) / 0.4, 0, 1)
    fm = f * vib
    if grace is not None:  # a quick grace note from above
        g = np.exp(-t / 0.045)
        fm = fm * (1 + (2 ** (grace / 12) - 1) * g)
    ph = 2 * np.pi * np.cumsum(fm) / SR
    tone = np.sin(ph) + 0.32 * np.sin(2 * ph + 0.4) + 0.12 * np.sin(3 * ph) + 0.05 * np.sin(4 * ph) + 0.03 * np.sin(6 * ph)
    e = env_adsr(n, 0.07, 0.3, 0.82, 0.22)
    swell = 1 + 0.12 * np.sin(np.pi * np.clip(t / max(dur, 0.1), 0, 1))
    out = tone * e * swell
    if rng is not None:
        nz = rng.standard_normal(n)
        b, a = signal.butter(2, [min(f * 0.8, 8000) / (SR / 2), min(f * 3.5, 20000) / (SR / 2)], 'band')
        out += signal.lfilter(b, a, nz) * e * 0.09
    return out * vel * 0.2


def bell(f, dur, vel=1.0):
    n = int((dur + 3.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 0.9), (2.0, 0.45, 1.4), (2.76, 0.4, 1.8), (5.4, 0.25, 3.2), (8.93, 0.12, 5)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return out * np.minimum(1, t / 0.002) * vel * 0.13


def pad(freqs, dur, vel=1.0, rng=None):
    n = int((dur + 2.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.006, 0.0, 0.0065):
            ff = f * (1 + det)
            ph0 = rng.random() * 6.28 if rng is not None else 0
            for k in range(1, 12):
                if ff * k > 5000:
                    break
                out += np.sin(2 * np.pi * ff * k * t + ph0 * k) * (1 / k ** 1.4) * (1 + 0.3 * np.sin(2 * np.pi * 0.13 * t + k))
    e = env_adsr(n, 1.4, 2, 1, 2.4)
    return out * e * vel * 0.016 / len(freqs)


def bass(f, dur, vel=1.0):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return out * np.exp(-t * 1.1) * np.minimum(1, t / 0.006) * env_adsr(n, 0.001, 1, 1, 0.3) * vel * 0.3


def drum(kind, vel, rng):
    if kind == 'taiko':
        n = int(1.0 * SR); t = np.arange(n) / SR
        f = 55 + 70 * np.exp(-t / 0.05)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
        nz = signal.lfilter(*signal.butter(2, 900 / (SR / 2)), rng.standard_normal(n)) * np.exp(-t / 0.03) * 0.5
        return (body + nz) * vel * 0.55
    if kind == 'frame':
        n = int(0.6 * SR); t = np.arange(n) / SR
        f = 110 + 60 * np.exp(-t / 0.03)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
        nz = signal.lfilter(*signal.butter(2, [400 / (SR / 2), 3000 / (SR / 2)], 'band'), rng.standard_normal(n)) * np.exp(-t / 0.02)
        return (body * 0.8 + nz * 0.6) * vel * 0.4
    if kind == 'block':
        n = int(0.25 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 980 * t) + 0.5 * np.sin(2 * np.pi * 1530 * t)) * np.exp(-t / 0.025) * vel * 0.22
    if kind == 'shaker':
        n = int(0.12 * SR); t = np.arange(n) / SR
        nz = signal.lfilter(*signal.butter(2, 5000 / (SR / 2), 'high'), rng.standard_normal(n))
        return nz * np.sin(np.pi * np.minimum(1, t / 0.08)) ** 2 * vel * 0.07
    if kind == 'cymbal':
        n = int(2.5 * SR); t = np.arange(n) / SR
        nz = signal.lfilter(*signal.butter(2, 3000 / (SR / 2), 'high'), rng.standard_normal(n))
        return nz * np.exp(-t / 0.7) * vel * 0.08
    raise ValueError(kind)


# ----------------------------------------------------------------------------- ambience
def ambience(kind, n, rng):
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    if kind == 'chimes':
        pass
    elif kind == 'water':
        for ch in range(2):
            nz = rng.standard_normal(n)
            b, a = signal.butter(2, [300 / (SR / 2), 2400 / (SR / 2)], 'band')
            w = signal.lfilter(b, a, nz)
            mod = 0.6 + 0.4 * np.sin(2 * np.pi * (0.11 + 0.03 * ch) * t) * np.sin(2 * np.pi * 0.023 * t + ch)
            out[:, ch] = w * mod * 0.018
        for _ in range(int(n / SR * 1.5)):  # drips and ripples
            p = rng.integers(0, n - SR)
            f = 900 + rng.random() * 1400
            m = int(0.08 * SR); tt = np.arange(m) / SR
            drop = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.8 * tt / 0.08)) / SR) * np.exp(-tt / 0.02) * 0.02
            pan = rng.random()
            out[p:p + m, 0] += drop * (1 - pan); out[p:p + m, 1] += drop * pan
    elif kind == 'wind':
        for ch in range(2):
            nz = rng.standard_normal(n)
            b, a = signal.butter(2, 700 / (SR / 2))
            w = signal.lfilter(b, a, nz)
            gust = 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t + ch * 1.3)) ** 2
            out[:, ch] = w * gust * 0.04
    if kind in ('wind', 'chimes'):
        for _ in range(int(n / SR * (0.35 if kind == 'wind' else 0.9))):  # distant wind chimes
            p = rng.integers(0, n - 4 * SR)
            c = bell(hz(84 + rng.choice([0, 2, 4, 7, 9])), 0.1, 0.25)
            pan = rng.random()
            out[p:p + len(c), 0] += c * (1 - pan); out[p:p + len(c), 1] += c * pan
    if kind == 'crickets':
        for _ in range(3):
            f = 4200 + rng.random() * 900
            rate = 14 + rng.random() * 6
            pulse = np.clip(np.sin(2 * np.pi * rate * t), 0, 1) ** 3
            phrase = np.clip(np.sin(2 * np.pi * (0.25 + rng.random() * 0.2) * t + rng.random() * 6) * 2 - 0.6, 0, 1)
            chirp = np.sin(2 * np.pi * f * t) * pulse * phrase * 0.0022
            pan = rng.random()
            out[:, 0] += chirp * (1 - pan); out[:, 1] += chirp * pan
        b, a = signal.butter(2, 600 / (SR / 2))
        for ch in range(2):
            out[:, ch] += signal.lfilter(b, a, rng.standard_normal(n)) * 0.012
    if kind == 'fire':
        b, a = signal.butter(2, 500 / (SR / 2))
        for ch in range(2):
            out[:, ch] = signal.lfilter(b, a, rng.standard_normal(n)) * 0.02
        for _ in range(int(n / SR * 9)):  # crackles
            p = rng.integers(0, n - 2000)
            m = rng.integers(60, 600)
            cr = rng.standard_normal(m) * np.exp(-np.arange(m) / (m / 4)) * (0.02 + rng.random() * 0.05)
            pan = rng.random()
            out[p:p + m, 0] += cr * (1 - pan); out[p:p + m, 1] += cr * pan
    return out


# ----------------------------------------------------------------------------- composition
class Song:
    def __init__(self, cfg, rng):
        self.cfg, self.rng = cfg, rng
        self.beat = 60 / cfg['bpm']
        self.bar = self.beat * 4
        self.notes = []  # (time, mono array, pan, reverb send)
        mode = cfg['mode']
        self.scale = sorted({cfg['root'] + o * 12 + s for o in range(-3, 5) for s in mode})

    def add(self, t, buf, pan=0.5, send=0.3):
        self.notes.append((t, buf, pan, send))

    def idx(self, midi):
        return min(range(len(self.scale)), key=lambda i: abs(self.scale[i] - midi))

    def chord(self, degree, octave=0, size=3):
        base = self.idx(self.cfg['root'] + 12 * octave) + degree
        return [self.scale[base + 2 * k] for k in range(size)]

    # -- parts
    def arpeggio(self, t0, bars, prog, density=1.0, octave=0, vel=0.55):
        r = self.rng
        patt = [0, 2, 1, 3, 2, 1, 3, 2] if density >= 1 else [0, 2, 1, 2]
        step = self.bar / len(patt)
        for b in range(bars):
            ch = self.chord(prog[(b // 2) % len(prog)], octave, 4)
            for i, p in enumerate(patt):
                if density < 1 and r.random() < 0.15:
                    continue
                f = hz(ch[p % len(ch)])
                v = vel * (1.0 if i % 4 == 0 else 0.75) * (0.85 + 0.3 * r.random())
                self.add(t0 + b * self.bar + i * step + r.normal(0, 0.006), pluck(f, step * 2.5, v, bright=0.5, rng=r), 0.35 + 0.3 * r.random(), 0.35)

    def glissando(self, t, up=True, span=10, octave=0):
        r = self.rng
        start = self.idx(self.cfg['root'] + 12 * octave)
        seq = range(start, start + span) if up else range(start + span, start, -1)
        for k, i in enumerate(seq):
            self.add(t + k * 0.045, pluck(hz(self.scale[i]), 0.6, 0.35 + 0.02 * k, bright=0.65, rng=r), 0.2 + 0.06 * k % 0.6, 0.45)

    def pads(self, t0, bars, prog, vel=1.0):
        for b in range(0, bars, 2):
            ch = self.chord(prog[(b // 2) % len(prog)], -1, 3)
            self.add(t0 + b * self.bar, pad([hz(m) for m in ch], self.bar * 2, vel, self.rng), 0.5, 0.6)

    def bassline(self, t0, bars, prog, vel=0.8):
        for b in range(bars):
            root = self.chord(prog[(b // 2) % len(prog)], -2, 1)[0]
            self.add(t0 + b * self.bar, bass(hz(root), self.bar * 0.9, vel), 0.5, 0.1)
            if self.cfg['bpm'] > 80:
                self.add(t0 + b * self.bar + self.beat * 2.5, bass(hz(root + 12 if self.rng.random() < 0.3 else root), self.beat, vel * 0.6), 0.5, 0.1)

    def motif(self, prog, bars=2, lo=0, hi=9):
        """A phrase: rhythm from a template, pitches a mostly-stepwise walk that lands on chord tones."""
        r = self.rng
        templates = [[2, 2, 1, 1, 2], [3, 1, 2, 2], [1, 1, 2, 4], [2, 1, 1, 2, 2], [4, 2, 2], [1, 1, 1, 1, 2, 2], [3, 3, 2], [2, 2, 4]]
        base = self.idx(self.cfg['root'])
        pos = base + r.integers(2, 5)
        out = []
        for b in range(bars):
            rh = templates[r.integers(len(templates))]
            if b == bars - 1:
                rh = [2, 2, 4] if r.random() < 0.5 else [3, 1, 4]
            t = 0
            for k, d in enumerate(rh):
                if k == 0:
                    tones = [self.idx(m) for m in self.chord(prog[b // 2 % len(prog)], 1, 3)]
                    pos = min(tones, key=lambda x: abs(x - pos) + r.random() * 1.5)
                else:
                    pos += int(r.choice([-2, -1, -1, 1, 1, 2, 0]))
                pos = int(np.clip(pos, base + lo, base + hi))
                out.append((b * 8 + t, d, pos))
                t += d
        return out

    def vary(self, mot):
        r = self.rng
        out = list(mot)
        for k in range(len(out) - 3, len(out)):
            s, d, p = out[k]
            out[k] = (s, d, p + int(r.choice([-1, 0, 1, 2])))
        return out

    def play(self, t0, mot, inst, octave=0, vel=0.8, pan=0.5):
        r = self.rng
        e8 = self.beat / 2
        for s, d, p in mot:
            midi = self.scale[p] + 12 * octave
            dur = d * e8
            t = t0 + s * e8 + r.normal(0, 0.008)
            v = vel * (0.85 + 0.25 * r.random())
            if inst == 'flute':
                buf = flute(hz(midi), dur * 0.96, v, r, grace=2 if d >= 2 and r.random() < 0.25 else None)
                send = 0.45
            elif inst == 'bell':
                buf = bell(hz(midi + 12), dur, v * 0.9); send = 0.55
            else:
                bend = (2 ** (2 / 12) - 1) * (1 if r.random() < 0.5 else -0.5) if d >= 3 and r.random() < 0.4 else 0
                buf = pluck(hz(midi), dur * 1.4, v * 1.1, bend=bend, bright=0.62, rng=r); send = 0.35
            self.add(t, buf, pan, send)

    def drums(self, t0, bars, level):
        r = self.rng
        for b in range(bars):
            tb = t0 + b * self.bar
            if level >= 1:
                self.add(tb, drum('frame', 0.8, r), 0.5, 0.25)
                if b % 2 == 1:
                    self.add(tb + self.beat * 2.5, drum('frame', 0.5, r), 0.45, 0.25)
            if level >= 2:
                self.add(tb, drum('taiko', 0.8 if b % 4 == 0 else 0.55, r), 0.5, 0.3)
                for i in range(8):
                    self.add(tb + i * self.beat / 2, drum('shaker', 0.8 if i % 2 else 0.5, r), 0.65, 0.1)
                if b % 2 == 0:
                    for i in (3, 5, 6):
                        self.add(tb + i * self.beat / 2, drum('block', 0.6, r), 0.3, 0.2)
            if level >= 3:
                for i in (0, 3, 6):
                    self.add(tb + i * self.beat / 2, drum('taiko', 0.6, r), 0.5, 0.3)
                self.add(tb + self.beat * 2, drum('frame', 0.9, r), 0.55, 0.25)
            if b % 8 == 0 and level >= 2:
                self.add(tb, drum('cymbal', 0.6, r), 0.6, 0.4)

    def compose(self):
        c, r = self.cfg, self.rng
        A, B = c['prog'], c['prog_b']
        lead, counter = c['lead'], c.get('counter', 'flute')
        lead_oct = 0 if lead != 'bell' else -1
        t = 0.0
        sections = [('intro', 4), ('a', 8), ('a2', 8), ('b', 8), ('break', 4), ('a3', 8), ('outro', 4)]
        if c.get('long'):
            sections = [('intro', 4), ('a', 8), ('a2', 8), ('b', 8), ('a', 8), ('b2', 8), ('break', 4), ('a3', 8), ('outro', 4)]
        ma = self.motif(A, 2)
        mb = self.motif(B, 2, lo=2, hi=10)
        for name, bars in sections:
            prog = B if name.startswith('b') else A
            self.pads(t, bars, prog, 1.0 if name != 'outro' else 0.8)
            if name == 'intro':
                self.arpeggio(t, bars, prog, 0.5, 0, 0.45)
                self.glissando(t + self.bar * (bars - 1) + self.beat * 2, True, 9)
            elif name == 'break':
                for b in range(bars):
                    ch = self.chord(prog[(b // 2) % len(prog)], 1, 3)
                    for k, m in enumerate(ch):
                        self.add(t + b * self.bar + k * self.beat * 1.33, bell(hz(m), 1.2, 0.55), 0.3 + 0.2 * k, 0.6)
                self.glissando(t + self.bar * (bars - 1) + self.beat * 2.5, False, 10, 1)
            elif name == 'outro':
                self.arpeggio(t, 2, prog, 0.5, 0, 0.4)
                fin = self.chord(prog[0], 0, 4)
                for k, m in enumerate(fin):
                    self.add(t + self.bar * 2 + k * 0.09, pluck(hz(m), 4, 0.5, bright=0.55, rng=r), 0.3 + 0.12 * k, 0.5)
                self.add(t + self.bar * 2, bell(hz(fin[0] + 12), 3, 0.5), 0.5, 0.7)
            else:
                full = name != 'a'
                self.arpeggio(t, bars, prog, 1.0 if full else 0.5, 0, 0.5 if full else 0.42)
                self.bassline(t, bars, prog, 0.7 if full else 0.5)
                if c['drums']:
                    self.drums(t, bars, c['drums'] if full else max(1, c['drums'] - 1))
                mot = mb if name.startswith('b') else ma
                for ph in range(0, bars, 2):
                    m = mot if ph % 4 == 0 else self.vary(mot)
                    if name == 'a3' and ph >= 4:
                        m = self.vary(m)
                    self.play(t + ph * self.bar, m, lead, lead_oct, 0.85, 0.5)
                    if name in ('a2', 'a3', 'b2') and ph % 4 == 2:
                        self.play(t + ph * self.bar + self.beat, self.vary(mot), counter, -1 if counter == 'flute' else 0, 0.45, 0.72)
                if name in ('b', 'b2'):
                    self.glissando(t + self.bar * bars - self.beat * 1.2, True, 12)
            t += bars * self.bar
        return t + self.bar * 1.5


def reverb_ir(seconds, rng):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        nz = rng.standard_normal(n)
        lo = signal.lfilter(*signal.butter(1, 2500 / (SR / 2)), nz)
        ir[:, ch] = (lo * np.exp(-t / (seconds / 6.5)) + nz * 0.25 * np.exp(-t / (seconds / 14)))
        for d, g in ((0.011, 0.5), (0.019, 0.4), (0.027, 0.33), (0.037, 0.25)):  # early reflections
            ir[int((d + ch * 0.003) * SR), ch] += g * 6
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    return ir


def render(name):
    cfg = TRACKS[name]
    rng = np.random.default_rng(cfg['seed'])
    song = Song(cfg, rng)
    length = song.compose()
    n = int((length + 4) * SR)
    dry = np.zeros((n, 2))
    send = np.zeros((n, 2))
    for t, buf, pan, s in song.notes:
        i = int(max(0, t) * SR)
        m = min(len(buf), n - i)
        if m <= 0:
            continue
        gl, gr = np.cos(pan * np.pi / 2), np.sin(pan * np.pi / 2)
        dry[i:i + m, 0] += buf[:m] * gl; dry[i:i + m, 1] += buf[:m] * gr
        send[i:i + m, 0] += buf[:m] * gl * s; send[i:i + m, 1] += buf[:m] * gr * s
    ir = reverb_ir(3.4, rng)
    wet = np.stack([signal.fftconvolve(send[:, ch], ir[:, ch])[:n] for ch in range(2)], -1)
    mix_ = dry + wet * 0.55
    if cfg['amb']:
        mix_ += ambience(cfg['amb'], n, rng)
    # gentle EQ: trim mud, add air
    b, a = signal.butter(1, 40 / (SR / 2), 'high')
    mix_ = signal.lfilter(b, a, mix_, axis=0)
    # fade the ending so the next loop can crossfade in
    fade = int(3.5 * SR)
    mix_[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    mix_[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]
    # level: soft-knee limiter, then normalise to -1 dBFS
    peak = np.percentile(np.abs(mix_), 99.95)
    mix_ = np.tanh(mix_ / peak * 0.9) / np.tanh(0.9)
    mix_ *= 10 ** (-6 / 20) / np.abs(mix_).max()  # leaves headroom for the sound effects
    return mix_.astype(np.float32), length


def encode(name, pcm, rate='320k'):
    os.makedirs(OUT, exist_ok=True)
    raw = (np.clip(pcm, -1, 1) * 32767).astype('<i2').tobytes()
    path = os.path.join(OUT, name + '.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-c:a', 'aac', '-b:a', rate, '-movflags', '+faststart', path], input=raw, check=True)
    return path


def render_ambience(tid, seconds=150):
    rng = np.random.default_rng(900 + sorted(AMBIENCE).index(tid))
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    for kind in AMBIENCE[tid]:
        out += ambience(kind, n, rng)
    ir = reverb_ir(2.2, rng)
    out = out + np.stack([signal.fftconvolve(out[:, ch], ir[:, ch])[:n] for ch in range(2)], -1) * 0.3
    fade = int(3.5 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out *= 10 ** (-9 / 20) / np.abs(out).max()
    return out.astype(np.float32)


if __name__ == '__main__':
    names = sys.argv[1:] or list(TRACKS) + ['amb:' + t for t in AMBIENCE]
    for name in names:
        if name.startswith('amb:'):
            tid = name[4:]
            p = encode('ambience-' + tid, render_ambience(tid), '256k')
            print(name, '%.1f MB' % (os.path.getsize(p) / 1e6))
            continue
        pcm, length = render(name)
        p = encode(name, pcm)
        print(name, '%.0fs' % length, '%.1f MB' % (os.path.getsize(p) / 1e6))
