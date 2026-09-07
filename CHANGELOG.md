# Changelog

All notable changes to this project are documented here.

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
