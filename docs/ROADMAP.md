# Roadmap

This is a curated list of improvements that fit the project's
dependency-free, browser-only philosophy. Some are easy; some are larger
projects.

## Gameplay

- **More tile types**: ice (slippery), conveyor belts, doors/keys, breakable
  blocks, timed spikes, and lava.
- **More enemies**: flying enemies, turrets, and bosses with simple state
  machines (patrol → chase → attack).
- **Power-ups**: double jump, dash, magnet, shield.
- **Multiple levels & progression**: level-select screen, unlockable levels, a
  small world map.
- **Combo / timer scoring systems** for replay value.

## Feel & accessibility

- **Keyboard rebinding** and saved control profiles.
- **Platformer-feel tuning menu** — expose gravity / jump / friction sliders.
- **Color-blind-safe palette** toggle.
- **Language/i18n support** (currently English-only).
- **Adaptive difficulty** that scales enemy speed/spawns based on performance.

## Online

- **Leaderboards** with a small backend/service.
- **Cloud save** for best score and settings.
- **Shareable level URLs** if levels become downloadable.

## Performance

- **Dirty-tile rendering** for extremely large worlds.
- **Worker-based physics** for levels with hundreds of entities.
- **Adaptive resolution / dynamic quality** to hold 60 FPS on low-end devices.

## Tooling

- **Level editor UI** (visual, in-browser).
- **Asset-import pipeline** (while keeping the generated-code fallback).
- **Visual regression tests** and automated browser checks.

## Publishing

- **GitHub Actions** for CI (syntax + smoke test) and Pages deployment.
- **Pre-release checks** for responsive layouts, touch, and gamepad input.
