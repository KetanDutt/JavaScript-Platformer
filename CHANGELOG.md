# Changelog

All notable changes to this project are documented here.

## [1.0.0] — 2026-09-05

### Added
- **Gameplay features:** coin pickups, stompable patrolling enemies, checkpoint
  flags, spring bounce pads, spike hazards, low-gravity water zones, and a goal
  flag win condition.
- **Lives & death:** 3 lives, death animation, respawn at checkpoints, and a
  game-over screen.
- **Score system:** coins (+100), enemy stomps (+250), persisted best score in
  `localStorage`.
- **Complete UI:** HUD (score / coins / lives / timer / best), start screen,
  pause menu, win screen, game-over screen, toast notifications, and on-screen
  touch controls with a dedicated jump button.
- **Juice:** squash & stretch, particle effects (jump, land, coin, stomp,
  spring, death, water splash, win confetti), screen shake, smooth camera
  follow with look-ahead, parallax sky/clouds/hills/bushes, and animated
  coins/flags/enemies.
- **Audio:** synthesized Web Audio SFX (jump, coin, stomp, spring, hit, death,
  win, checkpoint) plus a looping chiptune soundtrack and a mute toggle — no
  audio files required.
- **Controls:** keyboard (arrows / WASD / space) and touch with input-method
  detection, jump buffering, and coyote time.
- **Tooling:** zero-dependency `server.js`, `package.json` scripts
  (`start`/`build`/`test`), a level-authoring tool (`tools/generate-level.js`),
  and a headless smoke test (`tools/smoke-test.js`).
- **PWA:** manifest, theme color, app icons, and a network-first offline
  service worker (`sw.js`).
- **Docs:** architecture, level-authoring, gameplay, contributing, and this
  changelog.

### Fixed
- Replaced frame-hack `while`-loop overlap collision with robust axis-separated
  AABB resolution.
- Removed `alert()`-based win/death and `eval`-based level scripts.
- Fixed the player being able to walk out of the level into the void (world
  bounds clamp).
- Fixed grounded-flag logic that allowed air jumps after walking off a ledge
  (now handled with coyote time).
- Fixed enemy patrol speed unit mismatch (was far too slow).
- Fixed landing effects (squash/dust) firing every frame instead of only on a
  fresh landing.
- Made physics frame-rate independent via a fixed-timestep accumulator.
- Beveled the sky so it no longer scrolls with the world.
- Cleaned up dead code and unused fields; kept the engine dependency-free.

### Improved
- Tight, responsive platforming feel (jump buffering, coyote time, variable
  jump height).
- Camera smooth-follow with look-ahead and viewport clamping.
- Visually polished, responsive UI and HUD.
- Performance via visible-tile culling and a single-pass render.
- Production-readiness (tooling, tests, docs, licensing, PWA).
