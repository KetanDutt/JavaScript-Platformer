# 🏔 Green Hills — HTML5 Platformer

A **polished, production-ready** platformer built from scratch on a custom,
**dependency-free** HTML5 Canvas engine. No frameworks, no build step, no
external assets — everything (art, physics, effects, sound, music) is
generated in code, so it runs anywhere a browser runs.

<p align="center">
  <em>Collect coins, hearts and stars. Stomp enemies, ride springs, surf
  moving platforms, swim through low-gravity water, and reach the goal flag —
  with juicy particles, screen shake, synthesized SFX, a chiptune soundtrack,
  achievements, a level intro card, and a pit-out death for fair
  platforming.</em>
</p>

## ✨ Features

- **Smooth, frame-rate independent physics** — fixed-timestep simulation with
  a rendering accumulator for buttery motion on any display.
- **Tight, responsive controls** — coyote time, jump buffering and
  variable-height jumps (hold to jump higher), with debounced gamepad support.
- **Robust AABB collision** — clean axis-separated resolution, spring pads,
  spikes, water zones, **moving platforms** that carry the player, and a
  **pit-out death** when the player falls off the world.
- **Gameplay**:
  - Coin pickups (+100 + combo bonus), **hearts** (+1 life), **stars**
    (+500 + combo bonus)
  - **Combo multiplier** — chain pickups for extra points and a "ping"
  - Stompable patrolling enemies
  - Checkpoints, spring bounce pads, spike hazards, water
  - Goal flag + `+500` level-complete bonus
- **Juice & polish**:
  - Squash & stretch on jump/land + blinking eyes + mouth that adapts to
    speed + motion trail in the air
  - Particle effects (jump, landing, run dust, coin/heart/star, stomp, spring,
    death, water splash, win confetti)
  - **Expanding ring VFX** on pickups, checkpoints, and the goal
  - World-space score popups and animated pickups
  - Player-centered camera with smooth look-ahead + screen shake + screen
    flash on start / checkpoint / death
  - Parallax sky, drifting clouds, hills and bushes
  - Animated coins, stars, hearts, flags, enemies and moving platforms
  - Tween-based HUD score count-up and animated water ripples
  - **Level intro card** that slides in on game start
  - **Vignette** for a subtle cinematic frame
  - **Combo HUD chip** that lights up when chaining pickups
- **Audio** — synthesized Web Audio SFX (jump, coin, heart, star, stomp,
  spring, hit, splash, death, win, checkpoint, UI, combo, whoosh) plus a
  looping chiptune soundtrack with melody, bass, and percussion, and
  music-ducking on big SFX. Independent SFX/music volume. Zero audio files.
- **Persistent state**:
  - Best score
  - Best time (per `par_time` target)
  - Settings (sfx, music, volumes, reduced motion, particle density, color
    blind mode, on-screen controls)
  - Achievements
- **Full game UI** — HUD (score/coins/stars/lives/timer/best/combo), start
  screen, settings, pause menu, win screen (with par-time and best-time
  displays), game-over screen and toast notifications.
- **Input** — keyboard (arrows / WASD / space / Esc / M / F), touch on-screen
  controls, and **gamepad support** via the Web Gamepad API (with debounced
  start-to-pause and jump).
- **Accessibility** — `prefers-reduced-motion` support through both CSS and a
  built-in reduced-motion setting, `prefers-contrast: more` for stronger
  focus outlines, auto-pause on tab visibility loss, and color-blind mode.
- **Performance** — static tile layer pre-rendered to an offscreen canvas,
  visible-tile culling, capped particle pool, cached sky gradient, win
  slow-mo.
- **PWA-ready** — manifest, theme color, app icons and an offline service
  worker with network-first caching so the game installs to a home screen and
  works without a connection.

## 🚀 Getting started

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

## 🎮 Controls

| Action                 | Keyboard                        | Touch / on-screen | Gamepad              |
| ---------------------- | ------------------------------- | ----------------- | -------------------- |
| Move left/right        | `←` / `→` or `A` / `D`          | ◀ / ▶ buttons     | D-pad / left stick   |
| Jump (hold = higher)   | `↑` / `Space` / `W`             | ▲ button          | A / B / X / Y        |
| Pause                  | `Esc`                           | ⏸ button          | Start                |
| Mute / unmute          | `M`                             | 🔊 button          | —                    |
| Fullscreen             | `F`                             | ⛶ button          | —                    |
| Restart                | ↻ button                         | ↻ button          | —                    |

Touch controls appear automatically on touch devices and can be toggled in
Settings.

## 📁 Project structure

```
.
├── index.html            # App shell, UI overlays, bootstrap
├── style.css             # HUD / menus / responsive styling / settings
├── engine.js             # The game engine (physics, rendering, audio, juice)
├── level1.json           # Generated level data (see tools/)
├── manifest.json         # PWA manifest
├── favicon.png           # Favicon
├── icons/                # App icons (192 / 512)
├── server.js             # Zero-dependency static dev server (gzip + headers)
├── sw.js                 # PWA offline / service worker
├── package.json          # scripts + metadata
├── tools/
│   ├── generate-level.js # Level authoring / build tool
│   └── smoke-test.js     # Headless smoke test (no browser needed)
└── docs/
    ├── ARCHITECTURE.md   # How the engine works
    ├── GAMEPLAY.md       # Mechanics, scoring, difficulty
    ├── LEVEL_AUTHORING.md# Tile reference + how to build/modify levels
    ├── CONTRIBUTING.md   # How to contribute & run tests
    ├── PERFORMANCE.md    # How the game stays fast
    ├── ACCESSIBILITY.md  # Accessibility & reduced motion
    ├── TESTING.md        # Testing and validation
    └── ROADMAP.md        # Future ideas
```

## 🛠 Development & testing

```bash
# Regenerate level1.json from tools/generate-level.js
npm run build

# Run syntax checks + the headless smoke test
npm run check

# Full validation (rebuild level, then check)
npm run validate
```

The smoke test stubs the browser environment, loads the level, simulates play,
and asserts: the engine never throws, physics stay finite, the player can
move, hearts/stars/moving platforms work, death/respawn works, the goal
triggers a win with the level-complete bonus, **pit-out death** kills the
player, **combo bonuses** stack, and the settings API behaves.

## 🗺 Authoring a level

Levels are plain JSON. See [`docs/LEVEL_AUTHORING.md`](docs/LEVEL_AUTHORING.md)
for the tile reference, physics options, the optional `par_time` field, and
examples. The bundled `tools/generate-level.js` shows a comfortable way to
author a level with helper functions instead of writing big JSON arrays by
hand.

## 📚 Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the engine works
- [`docs/LEVEL_AUTHORING.md`](docs/LEVEL_AUTHORING.md) — tile reference +
  how to build/modify levels
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) — mechanics, scoring, combos
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — how to contribute
- [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) — performance strategy
- [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) — accessibility
- [`docs/TESTING.md`](docs/TESTING.md) — validation & testing
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — future improvements
- [`CHANGELOG.md`](CHANGELOG.md) — release notes

## 🧭 Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for a list of planned/potential
improvements (more tile types, multiple levels, leaderboards, i18n, etc.).

## 📄 License

MIT — see [`LICENSE`](LICENSE). Use it, learn from it, ship it.

---

Built with ❤ as a fully hand-rolled canvas engine — no libraries, no build
tools, just the browser.
