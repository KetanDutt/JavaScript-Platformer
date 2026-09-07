# Architecture

This document explains how the Green Hills platformer engine is put together.
Everything gameplay-critical lives in `engine.js`, a single self-contained IIFE
that exposes a global `Engine` constructor. The UI lives in `index.html` +
`style.css`.

## Overview

```
index.html            -- creates <canvas>, new Engine(canvas), loads level, starts loop
        |
        v
engine.js  Engine     -- state machine, input, physics, rendering, audio, effects
        |
        v
level1.json           -- tile grid + physics constants + spawn data
```

## The main loop

`Engine.prototype.start()` runs a `requestAnimationFrame` loop that:

1. Measures elapsed time (`dt`).
2. Closes large gaps (tab switches, `dt > 0.1s`).
3. Accumulates real time and steps **physics at a fixed 60 Hz** through
   `update(1/60)`.
4. Calls `draw()` once per *rendered* frame.

This fixed-timestep + accumulator design makes physics deterministic and
frame-rate independent: a 30 fps laptop and a 240 Hz gaming monitor play
identically, with the rendering smoothly interpolating between physics states
via the accumulator.

## Game state machine

The engine keeps a single `state` string that gates what updates run:

| State      | What happens                                                  |
| ---------- | ------------------------------------------------------------- |
| `menu`     | Overlay shown; world is rendered but the player is hidden.    |
| `play`     | Full physics, collisions, camera, HUD, timers.                |
| `paused`   | Freeze; pause overlay shown.                                  |
| `lost`     | Death animation; after a delay respawn or game over.          |
| `won`      | Level complete overlay + confetti + bonus.                    |
| `gameover` | No lives left overlay.                                        |

## Physics

### Player movement (`_updatePlayer`)

- **Horizontal**: input sets acceleration (`movement_speed.left/right`, with a
  reduced *air* factor). When no input, friction bleeds off velocity.
- **Jump**: a *jump buffer* (`0.12s`) plus *coyote time* (`0.1s`) let presses
  register a hair before landing and jumps still fire briefly after running off
  a ledge. Holding jump applies reduced gravity while rising for a **variable
  jump height**.
- **Gravity**: applied each step; reduced in water and while holding jump
  upward.
- **Moving platforms**: the player is carried by the platform's per-frame delta
  while standing on it, then re-collides with tiles/platforms each step.

### Collision (`_moveX` / `_moveY`)

Collision is **axis-separated AABB against the tile grid plus dynamic moving
platforms**:

1. Move along X, then resolve against the first solid tile in the direction of
   travel. Moving platforms are also resolved horizontally when the player is
   not already riding them.
2. Move along Y, then resolve upward (ceiling) or downward (floor/spring/
   platform). A downward resolution sets `on_floor`, refreshes `coyote`,
   triggers landing juice, and handles spring pads (bounce) or platform
   landing.

This eliminates jitter and frame-rate dependence.

### Unit conventions

- Tile size `16` px (overridable per level).
- Player hitbox — `0.7 x 0.9` tiles.
- World coordinates are pixels; spawn coordinates in level JSON are **tile
  coordinates** (so authoring is easier).
- The world is drawn under a `ctx.scale(scale)` so a consistent number of tiles
  is visible across screen sizes. `_worldScale()` derives the scale from canvas
  height, clamped to a sane range.

## Rendering

`draw()` proceeds as:

1. Clear and paint a screen-space sky gradient (cached per viewport height).
2. Save, `scale(scale)`, translate by `-camera` (+ screen shake offset).
3. `_drawParallax` — clouds, hills, bushes with parallax offsets.
4. `_drawTiles` — when available, draw the **pre-rendered static layer** from
   an offscreen canvas with a visible-range slice; otherwise fall back to live
   tile drawing.
5. Water ripples, moving platforms, pickups, checkpoints, goal, enemies,
   player, water highlight, particles, floaters.
6. Restore.

### Culling

`_drawTiles` computes the visible tile range from `camera` and `worldScale` and
only iterates/draws those cells. The static-layer path slices the offscreen
canvas directly, so even large levels stay cheap.

## Input

- **Keyboard**: `keydown`/`keyup` map arrow keys, `A`/`D`, `W`/`Space` to
  `left` / `right` / `jump` via `_setInput`. Key repeat is harmless because we
  only track booleans.
- **Touch/on-screen**: `setMove('left', true)` etc. are wired to the DOM buttons
  in `index.html`. Pointer events are used when available for multi-touch
  friendliness.
- **Gamepad**: `_updateGamepad()` polls `navigator.getGamepads()` and maps the
  left stick/D-pad, face buttons, and Start-to-pause into the same input
  abstractions.
- **Input method detection**: the HUD hides the touch controls when a keyboard
  is used and shows them on touch devices / gamepads (if enabled in Settings).

## Audio

`AudioFX` lazily creates a single `AudioContext` on the first user gesture (to
satisfy browser autoplay policies). It exposes separate **SFX** and **music**
gain buses so the two can be toggled and volume-controlled independently.

All sounds are synthesized (`tone`, `noise`) — **no audio files**. A
look-ahead scheduler plays a looping chiptune melody + bass that can be muted.

## Effects

- **Particles** — a capped pool of circles/rects with velocity, gravity and
  life. Spawned on jump, land, run, coin, heart, star, stomp, spring, death,
  water entry, and win.
- **Floaters** — world-space text popups (e.g. `+100`, `+500`, `+1 LIFE`).
- **Tweens** — a minimal tween registry (`tween`, `_updateTweens`) with easing,
  `onUpdate`, and `onComplete`. Used for the score count-up reveal.
- **Screen shake** — `_shake(duration, magnitude)`; applied as a random offset
  while `shake.t > 0`. Disabled by reduced-motion settings.
- **Squash & stretch** — the player's `squash` value expands on jump and
  contracts on land, then eases back to 1.

## Settings

The engine stores and applies a lightweight settings object:

- `sfx` / `music` toggles
- `sfxVolume` / `musicVolume` (0–1)
- `reducedMotion`
- `showControls`

Settings persist to `localStorage` through `Engine.prototype.applySettings` and
are read at construction time. `resetSettings()` restores defaults.
