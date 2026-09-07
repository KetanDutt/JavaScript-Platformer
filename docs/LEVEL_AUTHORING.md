# Level authoring

Levels are plain JSON objects loaded via `fetch('level1.json')`. You can edit
the generated `level1.json` directly, or (recommended) edit
`tools/generate-level.js` and run `npm run build` to regenerate it.

## Level structure

```json
{
  "name": "My Level",
  "tile_size": 16,
  "lives": 3,
  "max_lives": 5,
  "keys": [
    { "id": 0, "type": "empty" },
    { "id": 1, "type": "solid", "fill": "#6bbf4b", "top": "#8fd96a" }
  ],
  "data": [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0]
  ],
  "gravity":   { "x": 0, "y": 0.25 },
  "vel_limit": { "x": 3.0, "y": 13 },
  "movement_speed": { "jump": 6.5, "left": 0.4, "right": 0.4, "air": 0.35 },
  "player": { "x": 2.5, "y": 12, "colour": "#3D5AFE" },
  "startId": 11
}
```

- `data` is a 2D array of integers; each integer references a `key`'s `id`.
- `keys` defines the tile palette. Only keys used in `data` should exist.
- `player.x` / `player.y` are **tile coordinates** (not pixels).
- Spawn coordinates for entities placed as tiles are also tile coordinates.
- `max_lives` caps how many lives a heart can restore.

## Tile reference

| id | type         | description                                                 |
| -- | ------------ | ----------------------------------------------------------- |
| 0  | `empty`      | Nothing.                                                    |
| 1  | `solid`      | Grass surface (green top over dirt).                        |
| 2  | `solid`      | Dirt block.                                                 |
| 3  | `solid`      | Stone block.                                                |
| 4  | `coin`       | Collectible (score +100).                                   |
| 5  | `hazard`     | Spikes — touching them kills you.                           |
| 6  | `spring`     | Bounce pad (`bounce` = launch velocity).                    |
| 7  | `checkpoint` | Sets the respawn point.                                     |
| 8  | `goal`       | Reaching it wins the level.                                 |
| 9  | `water`      | Low-gravity zone (reduces gravity, damping).                |
| 10 | `deco`       | Decorative flower/bush.                                     |
| 11 | `start`      | Start marker (`startId`).                                   |
| 12 | `solid`      | Crate block.                                                |
| 13 | `enemy`      | Patrolling enemy; `dir`, `range` (tiles), `speed` (px/s).   |
| 14 | `moving`     | Moving platform. See options below.                         |
| 15 | `heart`      | Restores +1 life (or +250 at max lives).                    |
| 16 | `star`       | Collectible bonus worth +500.                               |

### Tile key options

```json
{ "id": 1, "type": "solid", "fill": "#6bbf4b", "top": "#8fd96a" }
```

- `fill` — main body colour.
- `top` — highlight strip colour for solid tiles.
- `bounce` (spring) — upward launch velocity.
- `dir`, `range`, `speed` (enemy) — patrol direction, range in tiles, speed in
  px/s.

### Moving platforms

```json
{
  "id": 14,
  "type": "moving",
  "axis": "y",
  "range": 4,
  "speed": 45,
  "width": 2,
  "fill": "#8c9eff"
}
```

- `axis` — `"x"` (horizontal) or `"y"` (vertical).
- `range` — travel range in tiles from the base tile.
- `speed` — movement speed in px/s.
- `width` — platform width in tiles (default `1`).
- `fill` — platform colour.

## Physics tuning

- `gravity.y` — downward acceleration per 60 Hz step (e.g. `0.25`).
- `vel_limit.x` — max horizontal speed (px/step).
- `vel_limit.y` — max fall speed (px/step).
- `movement_speed.jump` — initial jump impulse (px/step).
- `movement_speed.left/right` — horizontal acceleration (px/step).
- `movement_speed.air` — airborne acceleration multiplier (e.g. `0.35`).

## Authoring tool

`tools/generate-level.js` provides helpers so you don't hand-write massive
arrays:

```js
rect(x1, y1, x2, y2, id);    // fill a rectangle of tiles
platform(x, y, w, id);       // a single-row platform
set(x, y, id);               // set one tile
mound(cx, w, h, topId);      // a grassy hill
coinRow(x1, y1, x2, y2);     // a run of coins
```

Then:

```bash
npm run build
```

writes the JSON to `level1.json`.

## Tips

- Keep the outer edges safe: wall the level off with solid tiles or rely on the
  engine's player bounds clamp.
- Place a `start` tile (id `startId`, default `11`) and a `goal` tile for a
  playable level.
- Use `checkpoint` tiles before difficult sections so failures feel fair.
- Water is easiest as a shallow channel (2-3 tiles deep) sitting on solid ground
  with entry/exit lips.
- Moving platforms are a great way to gate rewards like stars or hearts.
