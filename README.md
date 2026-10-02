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
- Drag to orbit, hold and drag the mouse wheel to pan, and scroll to zoom. Hold the **right mouse button** to enter free flight: move the mouse to look, **WASD** to move, **Q/E** down/up, and **Shift** to move faster. Scrolling while flying adjusts movement speed. Release right mouse or press **Escape** to return to orbit; losing focus also exits. These controls work in the main view and the sigil editor. Flight updates only the active scene camera. **F** frames the selected model, or the full scene if nothing is selected. **Escape** clears selection.
- Use the visibility button to hide objects. **Delete** removes the selected model or light.
- Add **Sun** or **Point** lights. Select a light to edit its position, intensity, and color. A sun also has an aim target; a point light has configurable distance falloff. Up to eight lights are supported. The top **Light icons** button toggles the source icons and sun direction arrows. Sources outside the view appear as edge icons; click an icon to select its light. **Frame** with a light selected includes the source and its target. Selected suns default to **Aim light**, placing the axis gizmo at their target; switch to **Move light** to reposition the source. Aim changes update the lighting and hatching.
- The **CAMERAS** category always contains at least one camera. Selecting a camera makes it active. Orbiting, panning, zooming, framing and resetting the view update that camera only. **Add camera** copies the current view and activates the new camera, preserving the previous one. Selecting a model or light keeps the same active camera. Deleting the active camera switches to another; the final camera cannot be deleted.
- Select a camera to edit its position, aim target, projection, field of view and near/far clipping. Projections include **Perspective**, **Orthographic**, a circular equidistant **Fisheye** (10–170°), **Barrel**, and **Pincushion** distortion. Orthographic uses view height instead of FOV; the distortion lenses have a strength control. Lens distortion affects both shading and the surface direction field before hatching, preserving constant final stroke widths.
- The **Hatching setup** dropdown chooses global settings or a model's separate settings. Global settings affect models that inherit them. Change line color, constant thickness, shadow and light spacing, maximum stroke length, curvature influence, direction rotation, lighting, depth spacing, cavity emphasis, and cross-hatching.
- Select a model and enable **Use separate hatching setup**, then **Edit this object’s hatching**. Its style begins as a copy of the global setup. You can apply any built-in or saved preset, then customize it independently. Switching off the checkbox returns to global inheritance. **Render detail** is always global; an object's paper tint applies to its visible surface.
- Enable the **Outer outline** and choose its thickness and color.
- The separate **Depth outlines** tab adds lines at abrupt depth differences within visible geometry. Enable it and adjust **Depth threshold**, **Minimum depth jump**, line color, constant thickness and opacity. The threshold is relative to the nearer surface's camera distance; the minimum jump is in scene units. **Sampling distance** controls the detection neighborhood, **Slope rejection** suppresses lines on smooth tilted surfaces, **Minimum edge length** filters fragments, and **Edge smoothing** softens pixel steps. **Across object boundaries** includes overlaps between different objects. Its setup dropdown shares the global or per-object hatching setup. Depth settings have individual resets and are included in presets, scenes and PNG exports.
- The **↺** button beside each editable property reverts that property to its app default. Transform axes reset independently; a scale-axis reset does not change the other axes even when scale linking is enabled. Model defaults are position/rotation zero and scale one. Lights reset to their initial sun or point-light values.
- At the top of **Hatching**, choose **Engraving**, **Fine pen**, **Open strokes**, **Woodcut**, **Copperplate**, or **Contour study**. Choosing a preset applies it to the current hatching setup. **Load preset** reapplies the selected preset after changes.
- Click **Save preset**, enter a name, and save. Your named presets appear under **Saved presets** in the same dropdown and persist in this browser's local storage. Saving the same name updates that preset. Presets store hatching settings; scene objects and individual lights are not part of a preset. Browser profiles and site addresses each have their own saved preset list.
- Click **Save scene**, enter a name, and save. The **Saved scenes** dropdown and **Load scene** restore model transforms/visibility/styles, all lights and cameras, the active view, global hatching settings, grid, light icon visibility and view mode. Saving an existing name updates it. Geometry is never embedded in browser storage: imported models contain file references, while study shapes and procedural sigils are regenerated.
- Browsers do not reveal the full path of a browsed or dropped file. When saving, enter that model's path once (Windows Explorer: Shift + right-click → **Copy as path**). The local server checks it and reopens it on future loads. You can also edit **Local model path** in the model's inspector.
- If a model was moved or removed, loading displays an error and **Relink** dialog. Enter its new path, or browse to use a replacement file. Cancelling leaves the current scene intact. Corrected references are saved to the named scene automatically. Browsed replacements need their full path entered on the next save for automatic reloading.
- Use **Export PNG** to preview the illustration, then **Download PNG** to save it without the editing gizmo, grid, or selection box. **Render detail** sets the longest image dimension (subject to the viewport's 2× pixel limit).

## Sigil atelier

Choose **Nature / cyber sigil** from **Add object**, or click **Add sigil**. The new **SIGILS** category contains procedural objects with the same scene transforms, visibility and independent hatching as imported models. The pencil beside a sigil's name reopens its separate editor.

- Select a curve and vertex on the left, or grab its marker directly in the viewport. **Editing** chooses the vertex, incoming handle or outgoing handle. Drag a point across the current view plane; it keeps its depth from the camera. Front view moves X/Y, top view moves X/Z, and rotated views follow their current orientation. Axis gizmos are hidden by default; enable **Show axis gizmos** for constrained movement, or enter exact X/Y/Z values. Both Bézier handles on every vertex of the selected curve remain visible above the generated surface. Handle coupling can be **Free**, **Aligned** or **Mirrored**. A complete drag counts as one undo step.
- **Vertex radius** controls local thickness. **Add vertex** splits the selected outgoing segment without changing its centerline; at the last vertex it extends the curve. **Add curve** grows a branch from the current vertex.
- An endpoint's **Connect endpoint to pole** menu attaches it to a vertex on another curve. The shared position follows that pole, with optional radius inheritance. Editing a connected endpoint's radius gives it its own radius. Moving a connected vertex moves the shared pole. Deleting a pole detaches its branches at their current position.
- Six starting styles are included: **Thorn sigil**, **Chrome cybersigil**, **Living vine**, **Continuous sigil**, **Tidal coral**, and **Forged relic**. They change mesh parameters while preserving your curve network.
- Shape controls include mirror/radial symmetry, cross-section depth and twist, swelling, end taper, pointed/flat/rounded closed caps, junction blending and pole swelling. Other sections control radius ripples, centerline waves, spiral flutes, bark relief, thorn growth and curvature, flattened curled leaves, random seed and material finish. Every property has a reset button.
- Turn off **Live mesh generation** to edit without rebuilding. **Generate mesh** updates the preview manually. **Show editing curves** hides the curves, handles and gizmo for an unobstructed mesh view. **Undo/Redo** restore design edits; **Frame** fits the mesh and curves.
- **Samples per segment** controls curve sampling. **Mesh grid resolution** independently controls the generated surface detail. Higher mesh resolution captures thinner thorns, fine ripples and leaves, but costs more processing time. Increase radius or resolution if a thin feature disappears.
- Enable **Adaptive resolution** in **Resolution & finish** to automatically increase sampling for thin branches, narrowing thorn tips, leaves, ripples, bark, flutes and waves. Curve bends and thorn/leaf centerlines also receive extra samples. **Adaptive detail fidelity** sets the desired number of samples across small features; **Maximum detail boost** limits how much finer the mesh can become relative to **Mesh grid resolution**. The automatic mode chooses a finer shared grid to keep junctions and caps closed. It keeps the current curve/grid resolutions as baselines and respects a volume budget. The status shows the actual detail increase and reports when a limit is reached; raise the baseline or boost if needed. Preview, manual generation, **Apply & return**, and loading a saved scene use the same adaptive settings. Turning it off restores manual resolution.
- **Apply & return** commits the curves and generated geometry to the scene; **Cancel** discards editor changes. Applying always generates the latest design even when live generation is paused. Save the main scene to preserve the curve network and all its parameters in local storage. Sigils need no source model file.

The generator sweeps variable-radius cubic Bézier curves into a shared distance volume, blends branches at poles, and extracts a closed indexed surface. Ripples use distance along the curve; parallel-transport frames guide cross sections and growth. Adaptive mode estimates feature sizes, chooses the grid spacing, adds centerline samples where needed, and generates the closed surface at that spacing. The editor's metallic/color controls affect its shaded mesh preview. The main hatching controls determine the illustration's ink and paper.

## How the linework is made

The app welds coincident geometry vertices for analysis, fits a local symmetric shape operator to mesh normal variation, and smooths the resulting principal curvature line field over neighboring tangent planes. Isotropic regions use an object-space tangent guide. This field is projected into screen space.

Three.js renders visible object IDs, surface normals, projected line directions, diffuse lighting, and linear view depth into three offscreen buffers. A worker traces bidirectional streamlines with midpoint integration and checks nearby strokes to maintain spacing. Depth jumps and silhouettes stop a stroke. New seeds along accepted lines encourage long, parallel families of strokes. Cross-hatching uses the perpendicular field only in sufficiently dark areas.

Every hatch stroke uses the same screen-space width. Brightness, distance, and cavity shading vary **spacing**, not stroke thickness. Outer contours are separate complete silhouette loops with their own width. Optional depth outlines detect discontinuities in linear view depth, reject continuing surface slopes, thin the detected edges, and join them into smoothed paths. These lines also have constant screen-space width.

## Practical limits

- This is a procedural engraving approximation. It follows mesh curvature and surface features; it does not reproduce an illustrator's hand-authored artistic choices. Smooth normals and enough mesh detail improve the result.
- Material colors, textures, imported lights/cameras, and animation are ignored. GLB supports embedded Draco and Meshopt geometry decoding. External geometry dependencies must be embedded in the GLB.
- Lighting uses diffuse illumination, ambient light, and a screen-space cavity approximation. It does not calculate full shadow maps or global illumination.
- During camera and gizmo interaction the app shows a shaded preview, then retraces the hatching when interaction ends. Dense models and print detail take longer to process.
- Reloading starts a demo scene; use **Load scene** to open a named local save. Scene and preset lists belong to this browser profile and app address.
- Direct path access requires the included local server. A static-hosted copy still supports browser import and scene settings, but must prompt you to reselect model files when loading. The server binds to loopback, accepts only same-origin local requests and only reads explicitly supplied OBJ/GLB paths.
- A current browser with WebGL 2, module workers, and OffscreenCanvas is required.

## Source

`dist/main.js` — UI and workflow. `dist/settings.js` — defaults and hatching presets. `dist/scenes.js` — scene validation/storage and local model reads. `dist/lenses.js` — camera defaults, lens mappings and tangent transport. `dist/engine.js` — scene, import, geometry analysis integration, and GPU buffers. `dist/navigation.js` — mouse navigation and hold-to-fly camera control. `dist/light-visuals.js` — source icons and direction arrows. `dist/view-drag.js` — camera-plane point dragging. `dist/sigil-data.js` — curve designs, validation and motif presets. `dist/sigil-editor.js` / `dist/sigil.css` — curve editor. `dist/sigil-geometry.js` / `dist/sigil-worker.js` — closed surface generation. `dist/curvature-worker.js` — curvature estimation. `dist/hatch-worker.js` — screen-space line tracing, silhouettes and depth contours. `dist/styles.css` — layout. `server.mjs` — loopback static/file service.

Three.js r180 is bundled under its MIT license; see **THREE-LICENSE.txt**.

`dist/sigil-resolution.js` provides feature sizing, adaptive curve sampling and mesh generation limits.
