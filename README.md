# Airplane Fun

Airplane Fun is a browser-based voxel-inspired airplane fighter game built with TypeScript, Vite, and Three.js.

## Gameplay
- Title screen with three playable aircraft: Falcon, Titan, and Wraith
- Keyboard and on-screen button controls
- Enemy waves, score tracking, hull meter, and restart loop
- Functional browser tests with Playwright

## Controls
- Move: `WASD` or arrow keys
- Fire: `Space` or on-screen `Fire` button

## Scripts
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test:functional`

## Architecture
- `src/game.ts`: top-level game orchestration and render loop
- `src/entities.ts`: object-oriented entity models
- `src/models.ts`: procedural voxel-style mesh builders
- `src/ui.ts`: menu, HUD, and control overlays
- `src/input.ts`: keyboard and button input mapping
- `src/sound.ts`: lightweight generated sound effects

## Notes
- Visual models are procedural to keep the initial build self-contained and easy to extend.
- Asset research for optional future swaps is documented in `docs/assets-research.md`.
