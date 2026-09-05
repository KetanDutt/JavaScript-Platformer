# ?? Green Hills — HTML5 Platformer

A **polished, production-ready** platformer built from scratch on a custom,
**dependency-free** HTML5 Canvas engine. No frameworks, no build step, no
external assets — everything (art, physics, effects, sound) is generated in
code, so it runs anywhere a browser runs.

<p align="center">
  <em>Collect coins, stomp enemies, ride springs, swim through low-gravity water,
  and reach the goal flag — with juicy collisions, particles, screen shake,
  synthesized SFX and a chiptune soundtrack.</em>
</p>

## ? Features

- **Smooth, frame-rate independent physics** — fixed-timestep simulation with a
  rendering accumulator for buttery motion on any display.
- **Tight, responsive controls** — coyote time, jump buffering, and
  variable-height jumps (hold to jump higher).
- **Robust AABB collision** — clean axis-separated resolution (no frame-hack
  `while` loops), spring pads, spikes, and low-gravity water zones.
- **Gameplay**: coin pickups, stompable patrolling enemies, checkpoints,
  spring bounce pads, spike hazards, water, and a goal flag.
- **Juice & polish**:
  - Squash & stretch on jump/land
  - Particle effects (jump dust, landing dust, coin burst, stomp, death
    explosion, water splash, win confetti)
  - Smooth camera follow with look-ahead + screen shake
  - Parallax sky, clouds, hills and bushes
  - Animated coins, flags, and enemy walkers
  - Tween-based HUD score count-up
- **Audio** — synthesized (Web Audio) SFX for jump, coin, stomp, spring, death,
  win, checkpoint, plus a looping chiptune soundtrack. **Zero audio files.**
- **Full game UI** — HUD (score/coins/lives/timer/best), start screen, pause
  menu, win screen, game-over screen, and toast notifications.
- **Input** — keyboard (arrows / WASD / space), and touch on-screen controls
  for mobile, with automatic input-method detection.
- **PWA-ready** — manifest, theme color, app icons, and an **offline service
  worker** (network-first) so the game installs to a home screen and works
  without a connection.

## ?? Getting started

No dependencies are required — just serve the folder over HTTP.

### Option A — Node.js (recommended for development)

```bash
npm start            # serves the game at http://localhost:8080
# or node server.js 8080
```

Then open **http://localhost:8080** in your browser.

### Option B — any static server

```bash
python3 -m http.server 8080
# or use your favourite static host (Netlify, GitHub Pages, Vercel, etc.)
```

> Because the game `fetch`es `level1.json`, it must be served over HTTP
> (opening `index.html` directly via `file://` will not work in most browsers).

## ?? Controls

| Action          | Keyboard             | Touch / on-screen |
| --------------- | -------------------- | ----------------- |
| Move left/right | `?` / `?` or `A`/`D` | ? / ? buttons    |
| Jump (hold = higher) | `?` / `Space` / `W` | ? button        |
| Pause           | `Esc`                | ? button          |
| Restart         | ? button             | ? button          |
| Fullscreen      | ? button             | ? button          |
| Mute            | ?? button            | ?? button          |

## ?? Project structure

```
.
+-- index.html            # App shell, UI overlays, bootstrap
+-- style.css             # HUD / menus / responsive styling
+-- engine.js             # The game engine (physics, rendering, audio, juice)
+-- level1.json           # Generated level data (see tools/)
+-- manifest.json         # PWA manifest
+-- favicon.png           # Favicon
+-- icons/                # App icons (192 / 512)
+-- server.js             # Zero-dependency static dev server
+-- sw.js                 # PWA offline / service worker
+-- package.json          # scripts + metadata
+-- tools/
    +-- generate-level.js # Level authoring / build tool
    +-- smoke-test.js     # Headless smoke test (no browser needed)
```

More in-depth docs live in [`docs/`](docs/):

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the engine works.
- [`docs/LEVEL_AUTHORING.md`](docs/LEVEL_AUTHORING.md) — tile reference +
  how to build/modify levels.
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) — mechanics, scoring, difficulty.
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — how to contribute & run tests.

## ?? Development & testing

```bash
# Regenerate level1.json from tools/generate-level.js
npm run build

# Run the headless smoke test (no browser required)
npm test
```

The smoke test stubs the browser environment, loads the level, simulates play,
and asserts the engine never throws, physics stay finite, the player can move,
death/respawn works, and the goal triggers a win.

Regenerate or tweak the level by editing `tools/generate-level.js`, then run
`npm run build` to emit `level1.json`.

## ?? Authoring a level

Levels are plain JSON. See [`docs/LEVEL_AUTHORING.md`](docs/LEVEL_AUTHORING.md)
for the tile reference, physics options, and examples. The bundled
`tools/generate-level.js` shows a comfortable way to author a level with
helper functions instead of writing big JSON arrays by hand.

## ?? Suggested improvements / roadmap

If you want to take this further, here are ideas that fit the same
dependency-free, browser-only philosophy:

- **More tile types** — moving platforms, ice (slippery), conveyor belts,
  doors/keys, collectible power-ups, breakable blocks, and spikes that poke out
  on a timer.
- **More enemies** — flying enemies, turrets, and bosses with simple state
  machines (patrol ? chase ? attack).
- **Multiple levels & progression** — a level-select screen, unlockable levels,
  and a small world map.
- **Gamepad support** — wire the `Gamepad API` to the existing `setMove`
  abstractions for console-feel input.
- **Platformer-feel tuning menu** — expose gravity / jump / friction sliders so
  modders can tweak the feel live.
- **Performance** — render tiles to an offscreen canvas once (static layer) and
  only redraw dynamic entities, for huge levels at 60 fps.
- **i18n / accessibility** — keyboard-rebindable controls, color-blind-safe
  palette, and reduced-motion handling (already stubbed via
  `prefers-reduced-motion`).
- **Analytics / leaderboards** — a small backend or service to post best scores.

## ?? License

MIT — see [`LICENSE`](LICENSE). Use it, learn from it, ship it.

---

Built with ?? as a fully hand-rolled canvas engine — no libraries, no build
tools, just the browser.
