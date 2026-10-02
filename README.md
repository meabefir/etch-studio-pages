# Etch · Hatching Studio

A browser-based 3D line-hatching editor. Models are processed on your device. No backend, accounts, model uploads, or external libraries are needed while rendering.

## Open the app

Use the hosted app link supplied with this project, or run the included local copy:

1. Extract the ZIP into a folder.
2. With Node.js installed, double-click **Start Etch.cmd** on Windows.
3. Open **http://127.0.0.1:4173**. Keep the server window open while using the app.

On other platforms, run `node server.mjs` in this folder and open the same address. Serve the `dist` folder through HTTP; opening `index.html` directly cannot start the rendering workers.

## Workflow

- Import one or more **OBJ** or **GLB** files, or drag them onto the drawing.
- Click a model or its scene entry to select it. Use the gizmo to move, rotate, or scale it; edit exact values in **Selection**.
- Press **W**, **E**, or **R** for move, rotate, or scale. Choose local or world axes in the toolbar.
- Drag to orbit, right-drag to pan, and scroll to zoom. **F** frames the selected model, or the full scene if nothing is selected. **Escape** clears selection.
- Use the visibility button to hide objects. **Delete** removes the selected model or light.
- Add **Sun** or **Point** lights. Select a light to edit its position, intensity, and color. A sun also has an aim target; a point light has configurable distance falloff. Up to eight lights are supported.
- The **Hatching** inspector affects all models. Change line color, constant thickness, shadow and light spacing, maximum stroke length, curvature influence, direction rotation, lighting, depth spacing, cavity emphasis, and cross-hatching.
- Enable the **Outer outline** and choose its thickness and color.
- The **↺** button beside each editable property reverts that property to its app default. Transform axes reset independently; a scale-axis reset does not change the other axes even when scale linking is enabled. Model defaults are position/rotation zero and scale one. Lights reset to their initial sun or point-light values.
- At the top of **Hatching**, choose **Engraving**, **Fine pen**, **Open strokes**, **Woodcut**, **Copperplate**, or **Contour study**. Choosing a preset applies all global hatching settings, including colors and render detail. **Load preset** reapplies the selected preset after changes.
- Click **Save preset**, enter a name, and save. Your named presets appear under **Saved presets** in the same dropdown and persist in this browser's local storage. Saving the same name updates that preset. Presets store hatching settings; scene objects and individual lights are not part of a preset. Browser profiles and site addresses each have their own saved preset list.
- Use **Export PNG** to preview the illustration, then **Download PNG** to save it without the editing gizmo, grid, or selection box. **Render detail** sets the longest image dimension (subject to the viewport's 2× pixel limit).

## How the linework is made

The app welds coincident geometry vertices for analysis, fits a local symmetric shape operator to mesh normal variation, and smooths the resulting principal curvature line field over neighboring tangent planes. Isotropic regions use an object-space tangent guide. This field is projected into screen space.

Three.js renders visible object IDs, surface normals, projected line directions, diffuse lighting, and linear view depth into three offscreen buffers. A worker traces bidirectional streamlines with midpoint integration and checks nearby strokes to maintain spacing. Depth jumps and silhouettes stop a stroke. New seeds along accepted lines encourage long, parallel families of strokes. Cross-hatching uses the perpendicular field only in sufficiently dark areas.

Every hatch stroke uses the same screen-space width. Brightness, distance, and cavity shading vary **spacing**, not stroke thickness. Outer contours are separate complete silhouette loops with their own width.

## Practical limits

- This is a procedural engraving approximation. It follows mesh curvature and surface features; it does not reproduce an illustrator's hand-authored artistic choices. Smooth normals and enough mesh detail improve the result.
- Material colors, textures, imported lights/cameras, and animation are ignored. GLB supports embedded Draco and Meshopt geometry decoding. External geometry dependencies must be embedded in the GLB.
- Lighting uses diffuse illumination, ambient light, and a screen-space cavity approximation. It does not calculate full shadow maps or global illumination.
- During camera and gizmo interaction the app shows a shaded preview, then retraces the hatching when interaction ends. Dense models and print detail take longer to process.
- Imports and scene edits are held in memory for this session. Reloading restores the demo scene.
- A current browser with WebGL 2, module workers, and OffscreenCanvas is required.

## Source

`dist/main.js` — UI and workflow. `dist/settings.js` — defaults, built-in presets, validation, and preset storage. `dist/engine.js` — scene, import, geometry analysis integration, and GPU buffers. `dist/curvature-worker.js` — curvature estimation. `dist/hatch-worker.js` — screen-space line tracing and contours. `dist/styles.css` — layout. `server.mjs` — optional local static server.

Three.js r180 is bundled under its MIT license; see **THREE-LICENSE.txt**.
