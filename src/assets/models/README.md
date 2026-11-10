# Penguin

`penguin.glb` comes from **Animals FREE v2.3**, by **ithappy**. The project
owner supplied their own download, `Unity_2021_Animals_FREE_v2.3.unitypackage`.
The original pack stays outside this repository in the owner's Downloads;
only this generated penguin is shipped with the game.

Run `npm run build:penguin` to regenerate it. The script reads the package at
`~/Downloads/3D & Game Assets/Unity_2021_Animals_FREE_v2.3.unitypackage`
directly as gzip/tar, loads `Meshes/Pinguin_001.fbx` with Three's FBXLoader,
and exports its skinned mesh and embedded idle/walk/run takes to one GLB.
It uses the installed Playwright Chromium to resize the shared `Texture.png`
palette to 128 x 128, vertically flips it to preserve FBX UV orientation,
and embeds that PNG. No Unity install, re-export, or source pack copy is needed.

The output is approximately **232 KiB**, with **818 triangles**, one skinned
mesh and one material. It welds identical vertices and deduplicates identical
binary views/accessors without changing animation keys. Constant tracks retain
one keyframe; `_rig` wrapper and `_end` leaf animation tracks are removed.
The idle/walk/run durations are 5.333 / 0.933 / 0.533 seconds. The FBX loader's
build-time notice about vertices with more than four skin weights is expected:
it keeps the four largest weights and normalizes them.

Inspected bone names (FBXLoader/GLTFLoader sanitize the source's dots):

- Flippers: `finL` -> `fin001L` -> `fin002L`, mirrored as `finR` / `fin001R` /
  `fin002R`.
- Legs: `thighL` -> `shinL` -> `footL`, mirrored with `R`.
- Head: `scull` (source spelling), below `spine005`.
- Armature: `Pinguin_001_rig`; body root: `Root`.

This direct FBX export faces **+Z**: sampled orange head vertices put the beak
tip at approximately `(0.020, 1.011, 0.442)` in idle frame zero. It does not
need the half-turn used by the sibling game's separately exported shared GLB.
Idle frame-zero bounds are approximately `(-0.326, -0.00054, -0.516)` to
`(0.269, 1.190, 0.490)`. Runtime sizing uses those posed bounds to match the
existing penguin and put its feet on the surface. Sampling the planted foot
bones gives native walk/run ground rates of approximately 0.83 / 1.43 model
units per second, before runtime size scaling.

There is no supplied swim clip. The runtime blends a horizontal body pose and
procedural flipper strokes/leg tucking after the mixer updates, using the real
bones listed above. The original procedural penguin remains the loading/error
fallback.
