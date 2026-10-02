import { validateSettings } from './settings.js';
import { projections } from './lenses.js';
import { validateSigil } from './sigil-data.js';
export const SCENE_STORAGE_KEY = 'etch.scenes.v1';
const vector = (v, positive = false) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 1e9 && (!positive || n > 0));
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
const number = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const color = value => /^#[0-9a-f]{6}$/i.test(value);
const reject = message => { throw new Error(message); };
export function validateScene(scene) {
  if (!scene || scene.version !== 1 || !Array.isArray(scene.models) || scene.models.length > 200 || !Array.isArray(scene.lights) || scene.lights.length > 8 || !Array.isArray(scene.cameras) || scene.cameras.length < 1 || scene.cameras.length > 100) reject('Invalid scene: include at least one camera, up to 200 models and eight lights.');
  const settings = validateSettings(scene.settings);
  if (!settings) reject('The scene contains invalid hatching settings.');
  const ids = new Set();
  const identity = entry => { if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !name(entry.name)) reject('The scene contains invalid or duplicate objects.'); ids.add(entry.id); };
  const models = scene.models.map(entry => {
    identity(entry); const source = entry.source;
    if (!vector(entry.position) || !vector(entry.rotation) || !vector(entry.scale, true) || typeof entry.visible !== 'boolean') reject('A model has invalid transforms.');
    if (!source || !['file', 'demo', 'sigil'].includes(source.kind) || (source.kind === 'demo' && !['knot', 'sphere', 'vessel'].includes(source.shape)) || (source.kind === 'file' && (typeof source.path !== 'string' || source.path.length > 4096 || typeof source.filename !== 'string' || !/\.(obj|glb)$/i.test(source.filename)))) reject('A model has an invalid file reference.');
    const hatch = entry.hatch ? validateSettings(entry.hatch) : null; if (entry.hatch && !hatch) reject('A model has invalid hatching settings.');
    return { id: entry.id, name: entry.name, position: [...entry.position], rotation: [...entry.rotation], scale: [...entry.scale], visible: entry.visible, hatch, source: source.kind === 'sigil' ? {kind:'sigil',design:validateSigil(source.design)} : source.kind === 'demo' ? { kind: 'demo', shape: source.shape } : { kind: 'file', path: source.path, filename: source.filename } };
  });
  const lights = scene.lights.map(entry => {
    identity(entry); if (!['sun', 'point'].includes(entry.lightType) || !vector(entry.position) || !vector(entry.target) || !number(entry.intensity, 0, 5) || !number(entry.falloff, 0, .5) || !color(entry.color) || typeof entry.visible !== 'boolean') reject('A light has invalid settings.');
    return { id: entry.id, name: entry.name, lightType: entry.lightType, position: [...entry.position], target: [...entry.target], intensity: entry.intensity, falloff: entry.falloff, color: entry.color, visible: entry.visible, helperVisible: Boolean(entry.helperVisible) };
  });
  const cameras = scene.cameras.map(entry => {
    identity(entry); if (!projections.some(([type]) => type === entry.projection) || !vector(entry.position) || !vector(entry.target) || !vector(entry.up) || Math.hypot(...entry.up) < .001 || Math.hypot(...entry.position.map((n, i) => n - entry.target[i])) < .001 || !number(entry.fov, 10, 170) || !number(entry.orthoSize, .1, 2000) || !number(entry.distortion, 0, 1) || !number(entry.near, .001, 1000) || !number(entry.far, .01, 1e7) || entry.far <= entry.near) reject('A camera has invalid settings.');
    return Object.fromEntries(['id', 'name', 'projection', 'position', 'target', 'up', 'fov', 'orthoSize', 'distortion', 'near', 'far'].map(key => [key, entry[key]]));
  });
  if (!cameras.some(camera => camera.id === scene.activeCameraId)) reject('The active camera is missing.');
  return { version: 1, settings, models, lights, cameras, activeCameraId: scene.activeCameraId, grid: Boolean(scene.grid), mode: scene.mode === 'solid' ? 'solid' : 'hatch' };
}
export function snapshotScene(engine) {
  return validateScene({ version: 1, settings: { ...engine.params }, activeCameraId: engine.activeCamera.id, grid: engine.grid.visible, mode: engine.mode,
    models: engine.models.map(e => ({ id: e.id, name: e.name, source: e.source, position: e.object.position.toArray(), rotation: [e.object.rotation.x, e.object.rotation.y, e.object.rotation.z], scale: e.object.scale.toArray(), visible: e.visible, hatch: e.hatch || null })),
    lights: engine.lights.map(e => ({ id: e.id, name: e.name, lightType: e.lightType, position: e.object.position.toArray(), target: e.target.toArray(), intensity: e.intensity, falloff: e.falloff, color: e.color, visible: e.visible, helperVisible: e.helper.visible })),
    cameras: engine.cameras.map(e => engine.cameraSnapshot(e)) });
}
export function readSavedScenes(storage) {
  const raw = storage.getItem(SCENE_STORAGE_KEY); if (!raw) return [];
  const value = JSON.parse(raw); if (value.version !== 1 || !Array.isArray(value.scenes)) reject('The saved scene list could not be read.');
  const seen = new Set(), result = [];
  for (const record of value.scenes) try { if (!name(record.name) || typeof record.id !== 'string' || !record.id.startsWith('saved-scene-') || seen.has(record.id)) continue; const scene = validateScene(record.scene); result.push({ id: record.id, name: record.name, scene }); seen.add(record.id); } catch {}
  return result;
}
export function saveNamedScene(storage, label, scene) {
  label = label.trim(); if (!name(label)) reject('Enter a scene name of 1–100 characters.');
  scene = validateScene(scene); const scenes = readSavedScenes(storage), old = scenes.find(item => item.name.toLowerCase() === label.toLowerCase());
  const record = { id: old?.id || `saved-scene-${crypto.randomUUID()}`, name: label, scene }; if (old) scenes[scenes.indexOf(old)] = record; else scenes.push(record);
  storage.setItem(SCENE_STORAGE_KEY, JSON.stringify({ version: 1, scenes })); return { scenes, record, replaced: Boolean(old) };
}
export async function localModel(path, infoOnly = false) {
  const response = await fetch(infoOnly ? '/api/model-info' : '/api/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
  if (!response.ok) { const message = await response.text(); throw new Error(message.startsWith('<') ? 'Local paths require the included local server. Reselect the model file instead.' : message); }
  if (infoOnly) return response.json();
  const filename = decodeURIComponent(response.headers.get('X-Model-Filename') || path.split(/[\\/]/).pop());
  return new File([await response.arrayBuffer()], filename);
}
