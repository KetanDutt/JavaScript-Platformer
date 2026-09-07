# Contributing

Thanks for wanting to improve Green Hills! Contributions of all kinds are
welcome — bug fixes, polish, new tile types, better levels, docs, more tests.

## Getting set up

```bash
git clone <your-fork-url>
cd JavaScript-Platformer
npm start          # http://localhost:8080
```

## Running tests

The engine ships with a headless smoke test that needs **no browser**:

```bash
npm test
```

Run the full validation (syntax checks + build + tests):

```bash
npm run check      # syntax checks + smoke test
npm run validate   # rebuild level + run check
```

It stubs `window`/`document`/`canvas`, loads `level1.json`, simulates play, and
checks for: no crashes, finite physics, player progress, hearts/stars/moving
platforms, death/respawn, win bonus, and the settings API. Always run it before
committing.

## Code layout

| File                     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `engine.js`              | The game engine (physics/render/audio/UI)    |
| `index.html`             | App shell, overlays, bootstrap               |
| `style.css`              | Styling                                      |
| `tools/generate-level.js`| Level authoring / build tool                 |
| `tools/smoke-test.js`    | Headless tests                               |

## Authoring or changing a level

Edit `tools/generate-level.js`, then:

```bash
npm run build   # writes level1.json
npm test        # make sure it's still completable & crash-free
```

## Style & conventions

- Plain ES5-compatible JavaScript (works in all modern browsers without a build
  step). No modules/frameworks.
- Keep `engine.js` dependency-free. Effects, audio, and art are generated in
  code — no external asset files.
- Document public-ish methods and new tile types in the relevant `docs/*.md`.

## Adding a new tile / feature

1. Add the tile `id` to the palette in `tools/generate-level.js` and a matching
   `{ id, type }` key.
2. Handle its rendering in `engine.js` (`_drawStaticTile`, `_drawLiveTile`, and
   any entity scanning in `_scanEntities`).
3. Wire its gameplay effect (e.g. in `_updateCollisions`, `_moveX`, `_moveY`).
4. Add a case to the smoke test where sensible.
5. Document it in `docs/LEVEL_AUTHORING.md`.

## Reporting issues

- Include the exact steps to reproduce.
- If possible, include the browser/OS and a short video or GIF.
- Note whether it happens in `npm test` (headless) too.

## Commit messaging

Use clear, conventional messages: `fix:`, `feat:`, `docs:`, `test:`,
`refactor:`.
