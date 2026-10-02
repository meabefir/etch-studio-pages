export function registerBrowserTools(engine, refreshSettings) {
  // Browser-agent access mirrors the existing controls and is optional by support.
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'read_etch_scene', title: 'Read scene', description: 'Read models, their hatching styles, lights, cameras and global settings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ models: engine.models.map(x => ({ id: x.id, name: x.name, type: x.type, triangles: x.triangles, hatch: x.hatch || null, source: x.source, position: x.object.position.toArray() })), lights: engine.lights.map(x => ({ id: x.id, type: x.lightType, intensity: x.intensity,position:x.object.position.toArray(),target:x.target.toArray(),visible:x.visible })),lightIcons:engine.showLightIcons, cameras: engine.cameras.map(e => engine.cameraSnapshot(e)), activeCameraId: engine.activeCamera.id, settings: { ...engine.params } }) },
      { name: 'configure_hatch_spacing', title: 'Set hatch spacing', description: 'Set global shadow and light line spacing in screen pixels, using the same controls as the inspector.', inputSchema: { type: 'object', properties: { shadow: { type: 'number', minimum: 1, maximum: 16 }, light: { type: 'number', minimum: 1, maximum: 60 } }, required: ['shadow', 'light'], additionalProperties: false }, execute: input => { if (!input || !Number.isFinite(input.shadow) || !Number.isFinite(input.light) || input.shadow < 1 || input.shadow > 16 || input.light < 1 || input.light > 60 || input.shadow > input.light) throw new Error('Enter valid spacing with shadow no greater than light.'); engine.setParams({ spacing: input.shadow, lightSpacing: input.light }); refreshSettings(); return { shadow: engine.params.spacing, light: engine.params.lightSpacing }; } }
    ];
    for (const tool of tools) try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
}
