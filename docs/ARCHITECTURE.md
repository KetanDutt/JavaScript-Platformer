# Architecture

This document explains how the Green Hills platformer engine is put together.
Everything lives in `engine.js`, a single self-contained IIFE that exposes a
global `Engine` constructor. The UI lives in `index.html` + `style.css`.

## Overview

```
index.html            -- creates <canvas>, new Engine(canvas), loads level, starts loop
        ¦
        ?
engine.js  Engine     -- state machine, input, physics, rendering, audio, effects
        ¦
        ?
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

| State        | What happens                                                  |
| ------------ | ------------------------------------------------------------- |
| `menu`       | Overlay shown; world is rendered but the player is hidden.    |
| `play`       | Full physics, collisions, camera, HUD, timers.                |
| `paused`     | Freeze; pause overlay shown.                                  |
| `lost`       | Death animation; after a delay respawn or game over.          |
| `won`        | Level complete overlay + confetti.                            |
| `gameover`   | No lives left overlay.                                        |

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

### Collision (`_moveX` / `_moveY`)

Collision is **axis-separated AABB vs. tile grid**:

1. Move along X, then resolve against the first solid tile in the direction of
   travel (snap flush, zero the velocity).
2. Move along Y, then resolve upward (ceiling) or downward (floor). A downward
   resolution sets `on_floor`, refreshes `coyote`, triggers landing juice, and
   handles spring pads (bounce).

This replaces the original `while`-loop overlap fixes, eliminating jitter and
frame-rate dependence.

### Unit conventions

- Tile size `16` px (overridable per level).
- Player hitbox ˜ `0.7 × 0.9` tiles.
- World coordinates are pixels; spawn coordinates in level JSON are **tile
  coordinates** (so authoring is easier).
- The world is drawn under a `ctx.scale(scale)` so a consistent number of tiles
  is visible across screen sizes. `_worldScale()` derives the scale from canvas
  height, clamped to a sane range.

## Rendering

`draw()` proceeds as:

1. Clear the canvas.
2. `_drawBackground` — screen-fixed sky gradient + parallax clouds/hills/bushes.
   Parallax layers pre-offset their world position by `camera*(1-factor)` so
   they appear to move slower than the main world.
3. Save, `scale(scale)`, translate by `-camera` (+ screen shake offset).
4. Draw tiles, decorations, coins, checkpoints, goal, enemies, player, and
   particles — all culled to the visible tile range.
5. Restore and draw HUD (the DOM handles the readable overlay; canvas handles
   world + particles).

### Culling

`_drawTiles` computes the visible tile range from `camera` and `worldScale` and
only iterates those cells, so large levels stay cheap.

## Input

- **Keyboard**: `keydown`/`keyup` map arrow keys, `A`/`D`, `W`/`Space` to
  `left` / `right` / `jump` via `_setInput`. Key repeat is harmless because we
  only track booleans.
- **Touch/on-screen**: `setMove('left', true)` etc. are wired to the DOM buttons
  in `index.html`. Jump press sets a `jumpBuffer` so a tap always registers.
- **Input method detection**: the HUD hides the touch controls when a keyboard
  is used and shows them on touch devices.

## Audio

`AudioFX` lazily creates a single `AudioContext` on the first user gesture (to
satisfy browser autoplay policies) and exposes synthesized sounds via `tone`
and `noise`. A light look-ahead scheduler plays a looping chiptune melody + bass
that can be muted. There are **no audio files**; everything is synthesized.

## Effects

- **Particles** — a simple pool of circles/rects with velocity, gravity, and
  life. Spawned on jump, land, coin, stomp, spring, death, water entry, and win.
- **Tweens** — a minimal tween registry (`tween`, `_updateTweens`) with easing,
  `onUpdate`, and `onComplete`. Used for the score count-up reveal.
- **Screen shake** — `_shake(duration, magnitude)`; applied as a random offset
  while `shake.t > 0`.
- **Squash & stretch** — the player's `squash` value expands on jump and
  contracts on land, then eases back to 1.
