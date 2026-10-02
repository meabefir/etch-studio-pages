# Etch · Hatching Studio

A browser-based 3D line-hatching editor. Models are processed on your device. The included small local server serves the app and reads local OBJ/GLB paths for scene reloading. No accounts or model uploads to external services are required.

## Open the app

Run the included local copy:

1. Extract the ZIP into a folder.
2. With Node.js installed, double-click **Start Etch.cmd** on Windows.
3. Open **http://127.0.0.1:4173**. Keep the server window open while using the app.

On other platforms, run `node server.mjs` in this folder and open the same address. Serve the `dist` folder through HTTP; opening `index.html` directly cannot start the rendering workers.

## Workflow

- **Import model** accepts a full local **OBJ** or **GLB** path, or lets you browse for a file. You can also drag files onto the drawing. Paths may include spaces; quotes copied from Windows Explorer are removed automatically.
- Click a model or its scene entry to select it. Use the gizmo to move, rotate, or scale it; edit exact values in **Selection**.
- Press **W**, **E**, or **R** for move, rotate, or scale. Choose local or world axes in the toolbar.
- Drag to orbit, right-drag to pan, and scroll to zoom. **F** frames the selected model, or the full scene if nothing is selected. **Escape** clears selection.
- Use the visibility button to hide objects. **Delete** removes the selected model or light.
- Add **Sun** or **Point** lights. Select a light to edit its position, intensity, and color. A sun also has an aim target; a point light has configurable distance falloff. Up to eight lights are supported.
- The **CAMERAS** category always contains at least one camera. Selecting a camera makes it active. Orbiting, panning, zooming, framing and resetting the view update that camera only. **Add camera** copies the current view and activates the new camera, preserving the previous one. Selecting a model or light keeps the same active camera. Deleting the active camera switches to another; the final camera cannot be deleted.
- Select a camera to edit its position, aim target, projection, field of view and near/far clipping. Projections include **Perspective**, **Orthographic**, a circular equidistant **Fisheye** (10–170°), **Barrel**, and **Pincushion** distortion. Orthographic uses view height instead of FOV; the distortion lenses have a strength control. Lens distortion affects both shading and the surface direction field before hatching, preserving constant final stroke widths.
- The **Hatching setup** dropdown chooses global settings or a model's separate settings. Global settings affect models that inherit them. Change line color, constant thickness, shadow and light spacing, maximum stroke length, curvature influence, direction rotation, lighting, depth spacing, cavity emphasis, and cross-hatching.
- Select a model and enable **Use separate hatching setup**, then **Edit this object’s hatching**. Its style begins as a copy of the global setup. You can apply any built-in or saved preset, then customize it independently. Switching off the checkbox returns to global inheritance. **Render detail** is always global; an object's paper tint applies to its visible surface.
- Enable the **Outer outline** and choose its thickness and color.
- The **↺** button beside each editable property reverts that property to its app default. Transform axes reset independently; a scale-axis reset does not change the other axes even when scale linking is enabled. Model defaults are position/rotation zero and scale one. Lights reset to their initial sun or point-light values.
- At the top of **Hatching**, choose **Engraving**, **Fine pen**, **Open strokes**, **Woodcut**, **Copperplate**, or **Contour study**. Choosing a preset applies it to the current hatching setup. **Load preset** reapplies the selected preset after changes.
- Click **Save preset**, enter a name, and save. Your named presets appear under **Saved presets** in the same dropdown and persist in this browser's local storage. Saving the same name updates that preset. Presets store hatching settings; scene objects and individual lights are not part of a preset. Browser profiles and site addresses each have their own saved preset list.
- Click **Save scene**, enter a name, and save. The **Saved scenes** dropdown and **Load scene** restore model transforms/visibility/styles, all lights and cameras, the active view, global hatching settings, grid and view mode. Saving an existing name updates it. Geometry is never embedded in browser storage: model saves contain only file references, while built-in study shapes are regenerated.
- Browsers do not reveal the full path of a browsed or dropped file. When saving, enter that model's path once (Windows Explorer: Shift + right-click → **Copy as path**). The local server checks it and reopens it on future loads. You can also edit **Local model path** in the model's inspector.
- If a model was moved or removed, loading displays an error and **Relink** dialog. Enter its new path, or browse to use a replacement file. Cancelling leaves the current scene intact. Corrected references are saved to the named scene automatically. Browsed replacements need their full path entered on the next save for automatic reloading.
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
- Reloading starts a demo scene; use **Load scene** to open a named local save. Scene and preset lists belong to this browser profile and app address.
- Direct path access requires the included local server. A static-hosted copy still supports browser import and scene settings, but must prompt you to reselect model files when loading. The server binds to loopback, accepts only same-origin local requests and only reads explicitly supplied OBJ/GLB paths.
- A current browser with WebGL 2, module workers, and OffscreenCanvas is required.

## Source

`dist/main.js` — UI and workflow. `dist/settings.js` — defaults and hatching presets. `dist/scenes.js` — scene validation/storage and local model reads. `dist/lenses.js` — camera defaults, lens mappings and tangent transport. `dist/engine.js` — scene, import, geometry analysis integration, and GPU buffers. `dist/curvature-worker.js` — curvature estimation. `dist/hatch-worker.js` — screen-space line tracing and per-object contours. `dist/styles.css` — layout. `server.mjs` — loopback static/file service.

Three.js r180 is bundled under its MIT license; see **THREE-LICENSE.txt**.
