import {toonDefaults,toonKeys,validateRamp} from './toon.js?v=stop-blending-1';
export const defaults = { width: 0.8, spacing: 3.5, lightSpacing: 16, length: 1400, flow: 1, angle: 0, contrast: 1.25, depthSpacing: 0.35, cavity: 1, highlight: 0.08, cross: true, crossThreshold: 0.66, crossAngle: 90, ink: '#1b2026', paper: '#ffffff', outline: true, outlineWidth: 1.5, outlineColor: '#1b2026', ambient: 0.14, quality: 1100,depthOutline:false,depthThreshold:.02,depthFloor:.01,depthRadius:1,depthWidth:1.2,depthOpacity:1,depthMinLength:6,depthSmooth:1,depthSlope:1,depthAcross:true,depthColor:'#1b2026',hardContour:false,hardAngle:45,hardWidth:1.5,hardColor:'#1b2026',...toonDefaults };
export const depthKeys=['depthOutline','depthThreshold','depthFloor','depthRadius','depthWidth','depthOpacity','depthMinLength','depthSmooth','depthSlope','depthAcross','depthColor'];
export const hardKeys=['hardContour','hardAngle','hardWidth','hardColor'];
export const hatchingKeys=Object.keys(defaults).filter(key=>!toonKeys.includes(key));

export const lightDefaults = {
  sun: { position: [-3, 4, 4], target: [0, 0, 0], intensity: 1, falloff: 0.055, color: '#ffffff' },
  point: { position: [2, 4, 4], intensity: 2.2, falloff: 0.055, color: '#ffffff' }
};

export const definitions = [
  ['stroke-controls', 'width', 'Line thickness', 0.3, 3, 0.05, ' px'],
  ['stroke-controls', 'spacing', 'Shadow spacing', 1, 16, 0.5, ' px'],
  ['stroke-controls', 'lightSpacing', 'Light spacing', 1, 60, 1, ' px'],
  ['stroke-controls', 'length', 'Maximum line length', 100, 1800, 50, ' px'],
  ['flow-controls', 'flow', 'Curvature follow', 0, 1, 0.05, '%'],
  ['flow-controls', 'angle', 'Flow rotation', -90, 90, 1, '°'],
  ['tone-controls', 'ambient', 'Ambient light', 0, 1, 0.01, '%'],
  ['tone-controls', 'contrast', 'Tone contrast', 0.3, 3, 0.05, ''],
  ['tone-controls', 'depthSpacing', 'Depth spacing', 0, 2, 0.05, '%'],
  ['tone-controls', 'cavity', 'Valley emphasis', 0, 3, 0.1, ''],
  ['tone-controls', 'highlight', 'Highlight clearing', 0, 0.5, 0.01, '%'],
  ['cross-controls', 'crossThreshold', 'Shadow threshold', 0.15, 0.95, 0.01, '%'],
  ['cross-controls', 'crossAngle', 'Relative angle', 0, 180, 1, '°'],
  ['outline-controls', 'outlineWidth', 'Outline thickness', 0.5, 6, 0.1, ' px'],
  ['hard-contour-controls','hardAngle','Face angle threshold',0,180,1,'°'],
  ['hard-contour-controls','hardWidth','Hard contour thickness',.3,8,.1,' px'],
  ['depth-outline-controls','depthThreshold','Depth threshold',.001,.25,.001,'%'],
  ['depth-outline-controls','depthFloor','Minimum depth jump',0,.5,.005,' units'],
  ['depth-outline-controls','depthWidth','Depth line thickness',.3,6,.1,' px'],
  ['depth-outline-controls','depthOpacity','Depth line opacity',.05,1,.05,'%'],
  ['depth-outline-controls','depthRadius','Sampling distance',.5,5,.5,' px'],
  ['depth-outline-controls','depthSlope','Slope rejection',0,1.5,.05,''],
  ['depth-outline-controls','depthMinLength','Minimum edge length',0,80,1,' px'],
  ['depth-outline-controls','depthSmooth','Edge smoothing',0,5,1,'']
];

export const builtinPresets = [
  { id: 'engraving', name: 'Engraving', settings: { ...defaults } },
  { id: 'fine', name: 'Fine pen', settings: { ...defaults, width: 0.55, spacing: 3, lightSpacing: 15, outlineWidth: 1.1, contrast: 1.4 } },
  { id: 'open', name: 'Open strokes', settings: { ...defaults, width: 1.05, spacing: 8, lightSpacing: 30, cross: false, contrast: 0.9, outlineWidth: 1.7 } },
  { id: 'woodcut', name: 'Woodcut', settings: { ...defaults, width: 1.5, spacing: 2.5, lightSpacing: 18, contrast: 2.1, ambient: 0.1, cavity: 1.8, cross: false, outlineWidth: 3, ink: '#161616', outlineColor: '#161616' } },
  { id: 'copperplate', name: 'Copperplate', settings: { ...defaults, width: 0.65, spacing: 3, lightSpacing: 17, length: 1600, contrast: 1.7, depthSpacing: 0.65, ambient: 0.12, crossThreshold: 0.58, outlineWidth: 1, ink: '#493324', paper: '#fffaf2', outlineColor: '#493324' } },
  { id: 'contour', name: 'Contour study', settings: { ...defaults, width: 0.9, spacing: 6, lightSpacing: 22, length: 1800, cross: false, highlight: 0, contrast: 0.65, cavity: 0.4, outlineWidth: 1.8, ink: '#233543', outlineColor: '#233543' } }
].map(preset=>({...preset,settings:Object.fromEntries(hatchingKeys.map(key=>[key,preset.settings[key]]))}));

export const PRESET_STORAGE_KEY = 'etch.hatching-presets.v1';
const numericLimits = Object.fromEntries(definitions.map(([, key, , min, max]) => [key, [min, max]]));

export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Preset settings are invalid.');
  const result = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const item = (depthKeys.includes(key)||hardKeys.includes(key)||toonKeys.includes(key)||key==='crossAngle')&&value[key]===undefined?defaultValue:value[key];
    if(key==='toonRamp'){result[key]=validateRamp(item);continue;}
    if(key==='shadeMode'||key==='toonBlend'){if(!(key==='shadeMode'?['hatch','toon','combined']:['linear','constant']).includes(item))throw new Error(`Preset ${key} is invalid.`);result[key]=item;continue;}
    if (typeof defaultValue === 'number') {
      const limits = numericLimits[key];
      if (!Number.isFinite(item) || (limits && (item < limits[0] || item > limits[1])) || (key === 'quality' && ![800, 1100, 1600, 2200].includes(item))) throw new Error(`Preset ${key} is invalid.`);
      result[key] = item;
    } else if (typeof defaultValue === 'boolean') {
      if (typeof item !== 'boolean') throw new Error(`Preset ${key} is invalid.`);
      result[key] = item;
    } else {
      if (typeof item !== 'string' || !/^#[0-9a-f]{6}$/i.test(item)) throw new Error(`Preset ${key} is invalid.`);
      result[key] = item.toLowerCase();
    }
  }
  if (result.spacing > result.lightSpacing) throw new Error('Shadow spacing cannot exceed light spacing.');
  return result;
}

export function hatchingSettings(value) {
  const validated=validateSettings({...value,...toonDefaults});
  return Object.fromEntries(hatchingKeys.map(key=>[key,validated[key]]));
}

export function readSavedPresets(storage) {
  const raw = storage.getItem(PRESET_STORAGE_KEY);
  if (!raw) return [];
  let doc;
  try { doc = JSON.parse(raw); } catch { throw new Error('Saved presets could not be read.'); }
  if (doc?.version !== 1 || !Array.isArray(doc.presets)) throw new Error('Saved presets use an unsupported format.');
  const presets = [], ids = new Set();
  for (const item of doc.presets) {
    // A damaged entry cannot inject unknown settings or invalidate other presets.
    try {
      if (!item || typeof item.id !== 'string' || !/^saved-[a-z0-9-]{1,80}$/i.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 60) continue;
      presets.push({ id: item.id, name: item.name.trim(), settings: hatchingSettings(item.settings) }); ids.add(item.id);
    } catch { /* Keep other valid entries available. */ }
  }
  return presets;
}

export function saveNamedPreset(storage, name, settings) {
  const cleanName = String(name).trim();
  if (!cleanName || cleanName.length > 60) throw new Error('Use a preset name between 1 and 60 characters.');
  const validSettings = hatchingSettings(settings), presets = readSavedPresets(storage);
  const existing = presets.find(item => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  const preset = { id: existing?.id || `saved-${crypto.randomUUID()}`, name: cleanName, settings: validSettings };
  const updated = existing ? presets.map(item => item.id === existing.id ? preset : item) : [...presets, preset];
  // Update the visible list only after this succeeds (including quota failures).
  storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ version: 1, presets: updated }));
  return { presets: updated, preset, replaced: Boolean(existing) };
}

export function settingsMatch(a, b) { return hatchingKeys.every(key => a[key] === b[key]); }
