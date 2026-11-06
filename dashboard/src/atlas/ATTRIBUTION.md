# Attribution: the physique body (`body.b64`)

`body.b64` is a mesh derived from **“Z-Anatomy — The libre 3D atlas of anatomy”**, which is based on
**“BodyParts3D, © The Database Center for Life Science”**. It was taken from the
[Svitylo 3D Anatomy Atlas](https://github.com/authorOd/3d-anatomy-atlas) data release
`@authorod/svitylo-3d-anatomy-data` 1.2.0 (adult male), which repackages Z-Anatomy
([Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy),
commit `e38ea5e6c7e22d229a975f3fde563a5aca52099e`).

- **Licence:** [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
  This derived mesh is shared under the same licence. The rest of this repository's code is not affected.
- **Changes made here** (`bake.mjs`): skin, muscle and bone meshes from the atlas scaled from 174.4 cm to
  172 cm; the skin remeshed as one closed surface, simplified to about 56,000 vertices and shrink-wrapped
  onto the muscles, recording per vertex the muscle depth, soft-tissue depth and which muscle it sits
  over; packed as gzip + base64. In the browser (`src/fig3d/body.js`) the face is smoothed to a blank
  mannequin head and a few muscle labels are reassigned by position (abs, lower back).

`mdec.js` is the meshoptimizer reference decoder, © Arseny Kapoulkine, MIT licence (header kept in the file).
