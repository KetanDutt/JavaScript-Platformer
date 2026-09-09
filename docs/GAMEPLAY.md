# Gameplay & mechanics

This page documents how the game plays, how scoring works, and how the systems
fit together. Useful for players, testers, and modders.

## Controls

| Action                 | Keyboard              | Touch      | Gamepad         |
| ---------------------- | --------------------- | ---------- | --------------- |
| Move                   | `←`/`→` or `A`/`D`    | ◀ / ▶      | D-pad / stick   |
| Jump (hold = higher)   | `↑`/`W`/`Space`        | ▲          | A / B / X / Y   |
| Pause                  | `Esc`                 | ⏸          | Start           |
| Mute / unmute          | `M`                   | 🔊 button   | —               |
| Fullscreen             | `F`                   | ⛶ button   | —               |
| Restart                | ↻ button               | ↻ button   | —               |

Touch controls appear automatically on touch devices and can be toggled in
Settings.

## Core loop

1. Reach the **goal flag** at the end of the level to win.
2. Collect **coins** (+100), **hearts** (+1 life or +250), and **stars** (+500)
   along the way.
3. **Stomp enemies** — jump on top of them to defeat them (bouncing you up).
   Touching their sides hurts you. Enemies patrol along the ground surface
   (they are spawned one tile above solid ground).
4. Avoid **spikes**, fall into pits, and dodge enemies.
5. Ride **springs** and **moving platforms** to reach high areas.
6. Pass through **checkpoints** to set your respawn point.
7. Build a **combo** by collecting pickups in quick succession — every pickup
   adds a small bonus and a chiptune "ping" stacks on top of the coin sound.

## Scoring

| Action                     | Points                  |
| -------------------------- | ----------------------- |
| Collect a coin             | 100 + (combo × 10)      |
| Stomp an enemy             | 250                     |
| Collect a star             | 500 + (combo × 25)      |
| Collect a heart at max HP  | 250                     |
| Complete the level         | 500                     |

Your best score is saved to `localStorage` and shown on the HUD and the win
screen. Your best time is also saved and shown on the win screen.

## Lives & death

- You start with **3 lives** (configurable per level, up to `max_lives`).
- Touching a hazard, an enemy's side, or falling out of the world costs a life
  and respawns you (screen shake + death effect + red screen flash).
- **Hearts** restore a life; if you already have the maximum lives, a heart
  instead grants points.
- If you run out of lives, a **Game Over** screen appears with your score and
  stats; press **Try Again** to restart.
- **Checkpoints** move your respawn point forward, so you don't have to replay
  the whole level.

## Camera

The camera always tracks the player using the actual browser window size. The
visible world window is derived from `viewport / worldScale`, so the player
stays on-screen on any aspect ratio, window size, or orientation change. The
camera smoothly follows with a small look-ahead in the direction of movement
and is clamped to the level bounds.

## Juice / feedback

The game gives constant feedback to make failures and successes readable:

- **Screen shake** on death and on big pickups.
- **Screen flash** on start, checkpoint, and death.
- **Particles** for jumps, landings, run dust, pickups, stomps, springs, water
  entry, death and win confetti.
- **Squash & stretch** on the player during jumps, landings and springs.
- **Blinking eyes** and a mouth that changes with speed.
- **Player motion trail** when moving fast in the air.
- **World-space popups** for score gains (e.g. `+100`, `+500`, `+1 LIFE`).
- **Expanding ring VFX** on every pickup / checkpoint / win.
- **Synthesized sound** for every action plus a looping chiptune with
  percussion.
- **Toast notifications** (`Checkpoint!`, `New best score!`, `🏆 <achievement>`).
- **HUD pop animations** when score/coins/lives change.
- **Combo chip** that lights up when you chain pickups.
- **Vignette** for a subtle cinematic frame.
- **Level intro card** that slides in on game start.

## Difficulty

The bundled level (`Green Hills`) is tuned to be forgiving early and picks up in
the middle (spike pit, enemies, water, moving platforms). You can adjust the
tuning constants in `level1.json` or redesign the level entirely through
`tools/generate-level.js`.

## Achievements

Persistent achievements are awarded on first occurrence and stored in
`localStorage`. They show as a toast (with a chime) and never repeat.

| ID           | Name              | Trigger                                   |
| ------------ | ----------------- | ----------------------------------------- |
| first_win    | First Victory     | Reach the goal flag for the first time.   |
| first_star   | Star Power        | Collect any star.                         |
| all_coins    | Tight Purse       | Reach the goal with every coin collected. |
| all_stars    | Star Collector    | Reach the goal with every star collected. |
| speedrunner  | Speedrunner       | Reach the goal in under 60 seconds.       |
