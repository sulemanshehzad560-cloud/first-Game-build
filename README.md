# Nova Chain

A chain-reaction puzzle with **endless levels** and **two-player duels**, including online play.
It's plain HTML, CSS and JavaScript, so there's no build step and no server to run.

## How it plays

Every cell holds a few orbs before it bursts. The pips under each cell show its capacity: 2 in a corner, 3 on an edge, 4 in the middle.
When a cell fills up it bursts and throws one orb into each neighbour. That can make the neighbours burst too, and a single tap can set off a long chain.

| Mode | Goal |
| --- | --- |
| **Journey** | Light up every cell before you run out of taps. Matching par earns 3 ★. Levels are generated from their number, so they never run out, and each one is checked to be solvable. Boards grow and walls appear as you progress. |
| **Daily spark** | One shared puzzle per calendar day, with a streak counter. |
| **Duel: Online** | Host a room and send the 5-letter code (or the invite link) to a friend. Play happens peer to peer over WebRTC. You can send emotes during the match. |
| **Duel: Pass & play** | Two players take turns on one device. |
| **Duel: Vs Nova AI** | Easy, Normal or Hard (Hard looks two moves ahead). |

In a duel you can tap empty cells or your own. Your bursts capture the cells they spill into. Wipe out every enemy orb to win.

Hooks that keep players coming back: stars and par, hints earned from perfect clears, undo, a daily streak, a pentatonic sound that climbs with each wave of a chain, haptics on mobile, and a live demo on the home screen.

## Run it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

To publish it, push to GitHub and turn on **Settings → Pages → Deploy from branch** for this branch. Any static host works too (Netlify, Vercel, Cloudflare Pages).

Online play uses [PeerJS](https://peerjs.com/) and its free public signaling server. Only moves travel between the players; both browsers run the same deterministic engine.
To use your own PeerServer, set `window.NOVA_PEER_OPTIONS = { host, port, path, secure }` before `js/net.js` loads.

## Code map

| File | Purpose |
| --- | --- |
| `js/engine.js` | Rules, wave resolution, level generator and beam-search solver, AI. No DOM, so it also runs in Node. |
| `js/render.js` | Canvas renderer: tiles, capacity pips, orb sprites, burst waves, particles. |
| `js/main.js` | Screens, game modes, saved progress (`localStorage`), online protocol, home demo, starfield. |
| `js/net.js` | PeerJS room hosting and joining. |
| `js/audio.js` | WebAudio synth effects. |

## Tests

```bash
node tests/engine.test.js
```

The test generates and solves levels 1 to 120, checks that the same level number always produces the same board, and plays AI-vs-AI games to completion.
