# Historical imported dice assets

These GLBs are optimized derivatives of the supplied models in `md/model`.
They are retained as historical source material and are **not used by the current
application or included in the Vite build**. The runtime now uses
[self-built procedural models](../../src/features/dice/MODELING.md).
The original files are not modified. The visual assets follow [the asset license](../LICENSE.md).

`manifest.json` records the original hashes, source/derivative sizes and triangle
counts from the previous GLB integration. These historical exports contain
centered Y-up geometry, `body`/`marks` material roles and 1024px textures.

Current rendering, material registration, texture replacement and shader
extension are implemented in `src/features/dice`. `npm run check:dice` verifies
the current procedural geometry and physics, rather than loading these files.
