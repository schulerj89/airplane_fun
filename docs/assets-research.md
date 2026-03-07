# Asset Research

Phase 1 uses procedural voxel-style meshes and generated audio so the game stays self-contained, easy to test, and free from external runtime dependencies.

## Good current sources for future swaps
- Kenney UI Pack: https://kenney.nl/assets/ui-pack
  - Useful for button and HUD skinning
  - Listed as CC0 on the official page
- Quaternius Spaceships Pack: https://quaternius.com/packs/spaceships.html
  - Useful reference source for simple low-poly enemy craft
  - Listed as CC0 on the official page
- OpenGameArt CC0 sound collections:
  - https://opengameart.org/content/soundfx-library-cc0
  - https://opengameart.org/content/button-click-sound-effect-cc0public-domain
  - Useful for UI clicks, laser, and impact replacements

## Decision for this version
- Keep aircraft models procedural for maintainability and art consistency.
- Keep sounds synthesized in code for zero-asset setup and easier automated testing.
- Revisit downloadable art/audio once gameplay scope expands beyond the current loop.
