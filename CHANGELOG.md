# Changelog

All notable changes to this project are documented here.

## [1.2.0] — 2026-09-09

### Added
- **Pit-out death**: the player now dies if they fall past
  `mapHeight + 4 * tile_size`, so walking off the world is safe and routes
  through the normal respawn flow.
- **Combo multiplier**: chaining pickups in quick succession (within 2.5 s)
  adds a small bonus to the next pickup and lights up a HUD combo chip.
- **Achievements**: a small persistent set of one-time achievements
  (`First Victory`, `Star Power`, `Tight Purse`, `Star Collector`,
  `Speedrunner`) tracked in `localStorage` and announced via toast.
- **Best time**: the fastest clean time is persisted alongside the best
  score and shown on the HUD and the win screen.
- **Par time**: a `par_time` field in the level JSON shows the target time
  on the win screen.
- **Settings additions**:
  - **Particle density** slider (0–100%) — scales all spawn counts in real
    time, useful for low-end hardware or for users who prefer fewer
    effects.
  - **Color-blind-friendly mode** toggle (placeholder for shape-based
    pickup indicators; the engine already draws distinct shapes for
    coins / hearts / stars / flags).
  - **Music ducking**: big SFX (jump, pickup, stomp, win) now briefly lower
    the music bus so they punch through the mix.
  - **Mute shortcut (`M`)** and **fullscreen shortcut (`F`)** on the
    keyboard.
- **Level intro card** that slides in from the top of the canvas at the
  start of every level and fades out.
- **Screen flash** overlay on start, checkpoint, and death.
- **Expanding ring VFX** around pickups, checkpoints, spring pads, and the
  goal for a satisfying tactile "you got it" feedback.
- **Vignette** overlay for a subtle cinematic frame.
- **Player motion trail** while moving fast in the air.
- **Player blink + speed-aware mouth** for a more lively character.
- **Auto-pause on tab visibility loss** so a background tab doesn't drain
  lives.
- **HUD progress bar** that fills as the player advances through the level.
- **Best time chip** in the HUD and the win screen.
- **CSS polish**: focus-visible outlines, `prefers-contrast: more` support,
  button shine animation on the primary action, combo chip pulse, stat
  card hover lift, overlay-in animation, toast bouncier entry, and a
  shimmer animation on the title gradient.

### Fixed
- **Gamepad start-to-pause no longer spams** on a held press (was a
  re-triggerable toggle that could fire every frame).
- **Gamepad jump is now edge-triggered** instead of repeating on every
  polled frame, matching the keyboard jump buffer.
- **Player Y was clamped to `mapHeight - p.h`** at the end of every player
  update, which masked the pit-out death. The clamp is now applied to X
  only; Y is left free so a fall-out-of-world reaches `_checkPit()` and
  triggers a normal death.
- **`_rings` array** was inconsistently named (`_rings` in the consumer
  functions, `rings` in the constructor). Unified to `rings`.
- **Service worker** cache key bumped to `green-hills-v3` and split into a
  separate runtime cache so updates invalidate stale assets and
  third-party / cross-origin requests are ignored.
- **Smoke test stub** now supports `createRadialGradient` (used by the
  new vignette) and the **smoke test** also asserts the new pit-out
  death, the new combo system, and the new color-blind / particles
  settings.

### Improved
- The win path is dramatically slowed (`_winSlowmo = 0.5` s at 40 % time
  scale) for a more cinematic finish.
- The new chime (`unlock`) plays for every new achievement, alongside
  the toast.
- The static layer is now drawn from a 8192-pixel offscreen canvas
  (up from 4096) so very long levels stay pre-rendered.
- The level has 46 coins, 2 hearts, 3 stars, and 3 checkpoints (up from
  40/1/2/3) for a richer experience.
- The level now ships with `par_time: 60` and `max_lives: 5` so the
  achievement "Speedrunner" is meaningful.
- Engine documentation was rewritten end-to-end (`ARCHITECTURE.md`,
  `GAMEPLAY.md`, `LEVEL_AUTHORING.md`, `PERFORMANCE.md`,
  `ACCESSIBILITY.md`, `README.md`) to cover all of the above.

## [1.1.0] — 2026-09-07

### Added
- **Moving platforms** (tile id `14`): horizontally or vertically travelling
  platforms that carry the player. Configurable `axis`, `range`, `speed`, and
  `width`.
- **Hearts** (tile id `15`): collectible life pickup. Restores one life up to
  `max_lives`; if already at max it grants +250 points.
- **Stars** (tile id `16`): collectible bonus pickup worth +500 points.
- **Gamepad support**: D-pad / left stick, jump buttons, and Start-to-pause via
  the Web Gamepad API.
- **Settings screen**: independent SFX and music toggles, SFX/music volume
  sliders, reduced-motion toggle, on-screen controls toggle, and reset. Settings
  persist to `localStorage`.
- **+500 level-complete bonus** awarded when reaching the goal (with trophy
  toast on a new best score).
- **Reduced motion support** throughout the engine (fewer/shorter shakes,
  fewer particles, no confetti when enabled).
- **Offscreen static tile layer** pre-rendered once per level for much faster
  tile drawing on large maps.
- **World-space score popups**, water ripples, run dust, animated water waves,
  star/heart pickups, and animated moving platforms.
- **Documentation**: `PERFORMANCE.md`, `ACCESSIBILITY.md`, and `TESTING.md`.
  All docs were rewritten as clean UTF-8.
- **Tooling**: `npm run check` and `npm run validate` scripts; hardened
  `server.js` with gzip and security headers; upgraded service worker cache.

### Fixed
- Enemies are now spawned one tile **above** the solid ground surface. They
  previously replaced the ground tile, which buried them in a moving pocket
  instead of walking along the floor.
- Camera now uses **world-space viewport dimensions** (`viewport / worldScale`)
  instead of raw screen pixels, so the player and ground no longer fall off
  screen on larger windows.
- Camera recenters on window resize/orientation changes, keeping the player on
  screen at any browser inner window size.
- Spring pads no longer override the spring-stretch squash with landing squash.
- Springs no longer leave the player flagged as grounded, which had enabled an
  unintended mid-air jump immediately after a bounce.
- `_startSpot` is now reset on every level load, so reloading a map without a
  start tile cannot inherit a stale spawn point.
- Level-complete score reveal now counts up to the real final score (including
  the win bonus) and updates the HUD best score.
- Particles now respect the real fixed step instead of assuming `1/60` inside
  `update`.
- SFX methods now check mute/state before scheduling timers, reducing wasted
  work.
- All source/docs files were converted from mis-encoded Windows-1252 bytes to
  clean UTF-8 (fixes broken em dashes and characters in the browser).
- Touch input uses pointer events when available, allowing multi-touch on
  modern mobile browsers without relying solely on mouse events.

### Improved
- Better landing/spring feedback and squish behavior.
- Pickup order now processes hearts and stars before coins so pickups feel
  predictable.
- Audio now uses separate SFX and music buses with independent volume.
- UI adds a settings panel, better button contrast, and polished mobile
  layouts.
- Static assets are gzipped by the dev server; service worker caches fresh
  assets under `green-hills-v2`.

## [1.0.0] — 2026-09-05

### Added
- Gameplay features: coin pickups, stompable patrolling enemies, checkpoint
  flags, spring bounce pads, spike hazards, low-gravity water zones, and a goal
  flag win condition.
- Lives & death: 3 lives, death animation, respawn at checkpoints, and a
  game-over screen.
- Score system: coins (+100), enemy stomps (+250), persisted best score in
  `localStorage`.
- Complete UI: HUD, start screen, pause menu, win screen, game-over screen,
  toast notifications, and on-screen touch controls.
- Juice: squash & stretch, particles, screen shake, smooth camera, parallax
  background, and animated entities.
- Audio: synthesized Web Audio SFX plus a looping chiptune soundtrack.
- Controls: keyboard, touch, jump buffering, and coyote time.
- Tooling: zero-dependency `server.js`, level-authoring tool, headless smoke
  test, and PWA support.
- Docs: architecture, level-authoring, gameplay, contributing, changelog.

### Fixed
- Replaced frame-hack `while`-loop overlap collision with robust axis-separated
  AABB resolution.
- Removed `alert()`-based win/death and `eval`-based level scripts.
- Fixed player being able to walk out of the level into the void.
- Fixed grounded-flag logic that allowed air jumps after walking off a ledge.
- Fixed enemy patrol speed unit mismatch.
- Made physics frame-rate independent via a fixed-timestep accumulator.

### Improved
- Tight, responsive platforming feel.
- Camera smooth-follow with look-ahead.
- Visually polished, responsive UI and HUD.
- Performance via visible-tile culling and a single-pass render.
