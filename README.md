# Jade Rush

A Mahjong tile-matching game with **endless levels**, a clock to beat, and **two-player duels**, including online play.
It's plain HTML, CSS and JavaScript, with no build step and no server to run.

## How it plays

Tap two matching tiles to remove them. You can only use **free** tiles: nothing stacked on top, and an open left or right side.
Most kinds have four copies, so taking the wrong pair can bury the tile you need later. Every board is dealt by simulating a full clear, so each one can always be solved, but only if you play it right.

| Mode | Goal |
| --- | --- |
| **Journey** | Clear the board before the clock runs out. Levels are generated from their number, so they never end. Boards get bigger and taller, the clock gets tighter, hints and shuffles get scarcer, and from level 13 free tiles are no longer highlighted. Clear fast without hints for 3 ★. |
| **Daily board** | One shared board per calendar day, with a streak counter. |
| **Online: Race** | Both players get the same board. You can see your rival's progress live. First to clear wins; if both run out, fewer tiles left wins. |
| **Online: Take turns** | One shared board. Each turn you make one match, with 15 seconds per turn. Winds and dragons are worth 2 points. Highest score wins. |
| **Pass & play / Vs computer** | Take-turns duel on one device, or against an AI (Easy, Normal, Hard). Hard also avoids leaving you high-value pairs. |

Look and feel: six unlockable tile sets (Jade, Sakura, Lagoon, Ember, Royal, Obsidian) that recolor the tiles and the animated table, chapters of 10 levels, tiles that lift on hover and selection, matched pairs that fly together and burst, flip animations on shuffle, combo banners, confetti, and haptics on phones.

What keeps it challenging: combo multipliers for matching within 5 seconds, hints that cost 10 seconds, limited shuffles, a time bonus, and per-level best scores.

## Run it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

To publish it, push to GitHub and turn on **Settings → Pages → Deploy from branch** for this branch. Any static host works too.

Online play uses [PeerJS](https://peerjs.com/) and its free public signaling server. Only moves travel between the players; both browsers build the same board from a shared seed.
To use your own PeerServer, set `window.NOVA_PEER_OPTIONS = { host, port, path, secure }` before `js/net.js` loads.

## Code map

| File | Purpose |
| --- | --- |
| `js/mahjong.js` | Rules, free-tile logic, layout generator, solvable dealing, reshuffle, duel AI. No DOM, so it also runs in Node. |
| `js/tiles.js` | Tile faces (dots, bamboo, characters, winds, dragons) drawn with canvas. |
| `js/board.js` | 3D board renderer, hit testing, hints, match effects. |
| `js/main.js` | Screens, timed play, duels, saved progress (`localStorage`), online protocol, home demo. |
| `js/net.js` | PeerJS room hosting and joining. |
| `js/audio.js` | WebAudio tile clacks and combo chimes. |

## Tests

```bash
node tests/mahjong.test.js
```

The test generates levels 1 to 150 and replays each solution to prove every board is clearable. It also checks determinism and reshuffles, and plays AI duels to the end.
