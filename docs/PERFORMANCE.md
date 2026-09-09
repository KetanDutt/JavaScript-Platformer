# Performance

Green Hills is designed to run at 60+ FPS on modest hardware while staying
dependency-free.

## Fixed-timestep simulation

Physics runs at a fixed 60 Hz using an accumulator. The render loop only draws
once per animation frame. This keeps behavior deterministic across refresh
rates and prevents physics explosions on slow devices.

## Static tile layer

`Engine.prototype._buildStaticLayer()` pre-renders all static tiles (solid,
spring, water, decoration) into an offscreen canvas when a level loads. Each
frame `_drawTiles` draws only the visible slice via `ctx.drawImage`, avoiding
per-tile state changes and drawing calls for the static world.

This is the single biggest performance win on large maps. The engine still
keeps a live-draw fallback for environments where offscreen canvas is
unavailable.

## Culling

- Tiles, water ripples, background features, and parallax elements are culled
  to the visible range.
- Moving entities (platforms, pickups, enemies) are only drawn if they exist;
  collected pickups are skipped.

## Particle budget

The particle list is capped (`Particles.max = 1400`). When the cap is reached,
new spawns are throttled rather than growing unbounded. Reduced-motion mode
also cuts particle counts in half. The Settings panel exposes a `particles`
slider that scales all spawn counts in real time, so a low-end device can
opt-in to a much cheaper experience without losing gameplay.

## Allocation reduction

- The sky gradient is cached per viewport height.
- Particles/floaters/rings use simple arrays with in-place updates; only a few
  small objects are created per spawn.
- DOM HUD updates are kept minimal (timer text updates each step, but the DOM
  is tiny).
- The level's static layer is built once per level load and re-used.

## Win slow-mo + reduced motion

The engine has a `reducedMotion` setting (also honored via the CSS
`prefers-reduced-motion` media query). When enabled:

- screen shake is skipped,
- win confetti is skipped,
- particle counts for big bursts are reduced,
- CSS animations/transitions are disabled for UI,
- win slow-mo is disabled.

This improves both accessibility and performance for users who opt in.

## Gamepad polling

`_updateGamepad()` is called every physics step (60 Hz) and short-circuits as
soon as it sees no gamepads. It also debounces the Start and jump buttons
internally so a held press never repeats.

## Measuring

For profiling, open DevTools (`F12`) and use the Performance panel while
playing. The main bottlenecks to watch are:

- Canvas 2D draw calls (the static layer keeps this low),
- Particle count on pickups/effects,
- Per-frame `drawImage` on the static layer.

## Future ideas

- Vary static-layer resolution (e.g. 0.5x) on very low-end devices.
- Grid-space platform updates to skip platforms far off screen.
- An SVG/mask-free "draw only dirty camera tiles" mode for extremely large
  worlds.
- Web Worker physics for very large levels.
