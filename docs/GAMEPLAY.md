# Gameplay & mechanics

This page documents how the game plays, how scoring works, and how the systems
fit together. Useful for players, testers, and modders.

## Controls

| Action               | Keyboard                 | Touch      |
| -------------------- | ------------------------ | ---------- |
| Move                 | `?`/`?` or `A`/`D`       | ? / ?      |
| Jump (hold = higher) | `?`/`W`/`Space`          | ?          |
| Pause                | `Esc`                    | ?          |
| Restart              | ?                        | ?          |
| Fullscreen           | ?                        | ?          |
| Mute                 | ??                       | ??         |

The touch controls appear automatically on touch devices and hide when a
keyboard is used.

## Core loop

1. Reach the **goal flag** at the end of the level.
2. Collect **coins** along the way.
3. **Stomp enemies** — jump on top of them to defeat them (bouncing you up).
   Touching their sides hurts you.
4. Avoid **spikes** and falling into hazards.
5. Ride **springs** to reach high platforms.
6. Pass through **checkpoints** to set your respawn point (so failure isn't
   punishing).

## Scoring

| Action        | Points |
| ------------- | ------ |
| Collect a coin | 100   |
| Stomp an enemy | 250   |

Your best score is saved to `localStorage` and shown on the HUD and the win
screen.

## Lives & death

- You start with **3 lives**.
- Touching a hazard or an enemy's side costs a life and respawns you (screen
  shake + death effect).
- If you run out of lives, a **Game Over** screen appears with your score;
  press **Try Again** to restart.
- **Checkpoints** move your respawn point forward, so you don't have to replay
  the whole level.

## Juice / feedback

The game gives constant feedback to make failures and successes readable:

- **Screen shake** on death.
- **Particles** for jumps, landings, coin pickups, stomps, springs, water
  entry, death, and the win confetti.
- **Squash & stretch** on the player during jumps and landings.
- **Synthesized sound** for every action (jump, coin, stomp, spring, death,
  win, checkpoint) plus a looping chiptune.
- **Toast notifications** ("Checkpoint!", etc.).
- **HUD pop animations** when score/coins change.

## Difficulty

The bundled level (`Green Hills`) is tuned to be forgiving early and picks up
in the middle (spike pit, water, enemies). You can adjust the tuning constants
in `level1.json` (see `docs/LEVEL_AUTHORING.md`) or redesign the level entirely
through `tools/generate-level.js`.
