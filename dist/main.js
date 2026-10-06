import { registerBrowserTools } from './browser-tools.js';
import { OutputEditor } from './output-editor.js?v=transparent-png-1';
import { ToonEditor } from './toon-editor.js?v=stop-blending-1';
import { EtchEngine } from './engine.js?v=obj-faces-1';
import { defaults, depthKeys, hardKeys, hatchingSettings, lightDefaults, definitions, builtinPresets, PRESET_STORAGE_KEY, readSavedPresets, saveNamedPreset, settingsMatch } from './settings.js?v=cross-angle-1';

import { starterSigil } from './sigil-data.js?v=sigil-rotation-1';
import { cameraDefaults, projections } from './lenses.js';
import { SCENE_STORAGE_KEY, readSavedScenes, saveNamedScene, snapshotScene, localModel } from './scenes.js?v=cross-angle-1';

const $ = id => document.getElementById(id);
let engine, importBusy = false, toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6000); }
function tab(which) { for(const name of ['hatch','selection','depth','toon']){const active=which===name;$(name+'-settings').hidden=!active;$(name+'-tab').classList.toggle('active',active);$(name+'-tab').setAttribute('aria-selected',String(active));} }
const controls = new Map();
let savedPresets = [], selectedPresetId = 'engraving', hatchTarget = null, toonTarget = null, savedScenes = [], selectedSceneId = '', sceneBusy = false, localPaths = false;
const cameraControls = new Map();
let sigilEditor,toonEditor;
async function editSigil(entry) { if (sigilEditor && !sigilEditor.closed) return; try { const { SigilEditor } = await import('./sigil-editor.js?v=sigil-performance-1'); engine.select(entry); sigilEditor = new SigilEditor(entry, async (design, mesh) => { await engine.updateSigil(entry, design, mesh); tab('selection'); }); } catch (error) { console.error(error.stack); toast(`Could not open sigil editor: ${error.message}`); } }
async function addSigil() {
  if (importBusy || sceneBusy) return toast('Wait for scene loading to finish.'); importBusy = true; $('loading').hidden = false; $('loading').textContent = 'Growing sigil geometry…'; $('add-sigil').disabled = true;
  try { let name='Nature sigil',i=1; while(engine.models.some(e=>e.name===name)) name=`Nature sigil ${++i}`; const entry=await engine.createSigil(starterSigil(),name); engine.select(entry); engine.frame(entry); tab('selection'); await editSigil(entry); } catch(e) { toast(e.message); } finally { importBusy=false; $('loading').hidden=true; $('add-sigil').disabled=false; }
}

const hatchParams = () => hatchTarget ? engine.styleFor(hatchTarget) : engine.params;
function setHatch(patch) { const clean=hatchingSettings({...hatchParams(),...patch});if (hatchTarget) engine.setObjectParams(hatchTarget, clean); else engine.setParams(clean); }
const toonParams=()=>toonTarget?engine.styleFor(toonTarget):engine.params;
function setToonScope(entry){toonTarget=entry;populateHatchScope();refreshSettings();}
function changeToon(patch){if(toonTarget)engine.setObjectToon(toonTarget,patch);else engine.setParams(patch);populateHatchScope();refreshSettings();viewMode('hatch');}
function populateHatchScope() {
  if (hatchTarget && !engine.models.includes(hatchTarget)) hatchTarget = null;
  $('hatch-scope').replaceChildren(new Option('Global · inherited objects', 'global'), ...engine.models.map(e => new Option(`${e.name}${e.hatch ? ' · own style' : ' · global'}`, e.id)));
  $('hatch-scope').value = hatchTarget?.id || 'global';
  $('depth-scope').replaceChildren(new Option('Global · inherited objects','global'),...engine.models.map(e=>new Option(`${e.name}${e.hatch?' · own style':' · global'}`,e.id)));$('depth-scope').value=hatchTarget?.id||'global';
  if(toonTarget&&!engine.models.includes(toonTarget))toonTarget=null;
  $('toon-scope').replaceChildren(new Option('Global · inherited objects','global'),...engine.models.map(e=>new Option(`${e.name}${e.toon?' · own toon':' · global toon'}`,e.id)));$('toon-scope').value=toonTarget?.id||'global';
  $('scope-hint').textContent = hatchTarget ? `Editing ${hatchTarget.name}. Render detail remains global; paper tint applies to this object's surface.` : 'Objects use the global setup unless given their own style.';
}
function setHatchScope(entry) { hatchTarget = entry; populateHatchScope(); refreshSettings(); }


function resetButton(name, defaultValue, callback) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'property-reset'; button.textContent = '↺';
  button.setAttribute('aria-label', `Reset ${name} to default`); button.title = `Revert to default: ${defaultValue}`; button.onclick = callback; return button;
}
function attachReset(input, name, defaultValue, callback) {
  const button = resetButton(name, defaultValue, callback), label = input.closest('label');
  if (label) {
    const row = document.createElement('div'); row.className = 'property-row';
    if (label.classList.contains('check-heading')) row.classList.add('check-property');
    if (label.classList.contains('inline-color')) row.classList.add('color-property-row');
    label.before(row); row.append(label, button);
  } else input.after(button);
  return button;
}
function currentPreset() { return [...builtinPresets, ...savedPresets].find(item => item.id === selectedPresetId); }
function updatePresetStatus() {
  const preset = currentPreset();
  const modified = !preset || !settingsMatch(hatchParams(), preset.settings);
  $('preset-status').textContent = modified ? 'Modified · save to keep these settings' : selectedPresetId.startsWith('saved-') ? 'Saved in this browser' : 'Built-in preset';
  $('preset-status').classList.toggle('modified', modified); $('load-preset').disabled = !preset;
}
function populatePresets() {
  $('preset').replaceChildren();
  for (const [label, entries] of [['Built-in presets', builtinPresets], ['Saved presets', savedPresets]]) {
    if (!entries.length) continue;
    const group = document.createElement('optgroup'); group.label = label;
    for (const entry of entries) { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; group.append(option); }
    $('preset').append(group);
  }
  if (!currentPreset()) selectedPresetId = 'engraving';
  $('preset').value = selectedPresetId;
}
function loadPreset(id) {
  const preset = [...builtinPresets, ...savedPresets].find(item => item.id === id);
  if (!preset) return toast('That preset is no longer available.');
  selectedPresetId = id; $('preset').value = id; setHatch({ ...preset.settings }); refreshSettings();
}
function applyHatchPatch(patch) {
  const adjusted = { ...patch };
  if ('spacing' in patch && patch.spacing > (patch.lightSpacing ?? hatchParams().lightSpacing)) adjusted.lightSpacing = patch.spacing;
  if ('lightSpacing' in patch && patch.lightSpacing < (patch.spacing ?? hatchParams().spacing)) adjusted.spacing = patch.lightSpacing;
  setHatch(adjusted); refreshSettings();
}
function range(parent, key, name, min, max, step, suffix, value, callback, defaultValue = value) {
  const wrap = document.createElement('div'); wrap.className = 'control';
  const labelRow = document.createElement('div'); labelRow.className = 'control-label';
  const label = document.createElement('label'), output = document.createElement('output'), input = document.createElement('input');
  input.id = `parameter-${key}`; input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value; label.htmlFor = input.id; label.textContent = name; output.htmlFor = input.id;
  const update = v => { if (key === 'camera-size') input.max = Math.max(30, Math.ceil(v)); input.value = v; output.value = suffix === '%' ? `${key==='depthThreshold'?Number((v*100).toFixed(1)):Math.round(v * 100)}%` : `${Number(Number(v).toFixed(3))}${suffix}`; };
  update(value); input.addEventListener('input', () => { update(+input.value); callback(+input.value); });
  const actions = document.createElement('div'); actions.className = 'property-actions';
  actions.append(output, resetButton(name, defaultValue, () => { update(defaultValue); callback(defaultValue); }));
  labelRow.append(label, actions); wrap.append(labelRow, input); parent.append(wrap); return { input, update, wrap };
}
function sceneList() {
  for (const [list, entries] of [[$('model-list'), engine.models.filter(e=>e.type==='model')], [$('sigil-list'), engine.models.filter(e=>e.type==='sigil')], [$('light-list'), engine.lights], [$('camera-list'), engine.cameras]]) {
    list.replaceChildren();
    if (!entries.length) { const empty = document.createElement('div'); empty.className = 'hint'; empty.textContent = list.id === 'model-list' ? 'Import a model to begin.' : list.id === 'sigil-list' ? 'Grow a curve-based sigil.' : 'Add a sun or point light.'; list.append(empty); }
    for (const entry of entries) {
      const row = document.createElement('div'); row.className = `scene-item${engine.selected === entry ? ' selected' : ''}`;
      const select = document.createElement('button'); select.className = 'select-item'; select.title = entry.name; select.setAttribute('aria-label', `Select ${entry.name}`);
      const icon = document.createElement('span'); icon.className = 'object-icon'; icon.textContent = entry.type === 'model' ? '◇' : entry.type === 'sigil' ? '❧' : entry.type === 'camera' ? '▣' : entry.lightType === 'sun' ? '☼' : '◉';
      const name = document.createElement('span'); name.className = 'item-name'; name.textContent = entry.name + (entry === engine.activeCamera ? ' · active' : '');
      select.append(icon, name); select.onclick = () => { engine.select(entry); tab('selection'); };
      const visibility = document.createElement('button'); visibility.className = 'visibility'; visibility.textContent = entry.visible ? '◉' : '○'; visibility.title = entry.visible ? 'Hide' : 'Show'; visibility.setAttribute('aria-label', `${entry.visible ? 'Hide' : 'Show'} ${entry.name}`); visibility.setAttribute('aria-pressed', String(entry.visible)); visibility.onclick = () => engine.setVisible(entry, !entry.visible);
      if (entry.type === 'camera') { row.append(select); list.append(row); continue; }
      if (entry.type === 'sigil') { const edit = document.createElement('button'); edit.className='property-reset sigil-edit-button'; edit.textContent='✎'; edit.title='Edit curves & generated mesh'; edit.setAttribute('aria-label',`Edit ${entry.name} curves`); edit.onclick=()=>editSigil(entry); row.append(select,edit,visibility); } else row.append(select,visibility); row.append(resetButton(`${entry.name} visibility`, 'visible', () => engine.setVisible(entry, true))); list.append(row);
    }
  }
  $('scene-count').textContent = `${engine.models.length} ${engine.models.length === 1 ? 'object' : 'objects'}`;
  $('light-count').textContent = `${engine.lights.length} / 8`;
  $('add-sun').disabled = $('add-point').disabled = engine.lights.length >= 8;
  $('camera-count').textContent = engine.cameras.length;
  $('add-camera').disabled = engine.cameras.length >= 100;
  $('delete').disabled = !engine.selected || (engine.selected.type === 'camera' && engine.cameras.length === 1);
  document.querySelectorAll('[data-transform]').forEach(button=>{button.disabled=engine.selected?.type==='light'&&button.dataset.transform!=='translate';button.classList.toggle('active',button.dataset.transform===engine.transform.mode);});
  populateHatchScope();
  refreshSettings();
}
const transformInputs = [];
function xyz(parent, heading, values, callback, prefix, defaultValues, onReset = callback) {
  const section = document.createElement('div'); section.className = 'transform-section'; const title = document.createElement('h2'); title.textContent = heading;
  const row = document.createElement('div'); row.className = 'xyz';
  for (const [i, axis] of ['x', 'y', 'z'].entries()) {
    const cell = document.createElement('div'), label = document.createElement('label'), span = document.createElement('span'), input = document.createElement('input'), fieldRow = document.createElement('div');
    cell.className = 'axis-property'; fieldRow.className = 'axis-field'; span.textContent = axis.toUpperCase(); input.id = `selection-${prefix}-${axis}`; label.htmlFor = input.id; input.type = 'number'; input.step = heading.startsWith('Rotation') ? '1' : '0.05'; input.value = Number(values[i].toFixed(3)); input.setAttribute('aria-label', `${heading} ${axis.toUpperCase()}`);
    if (heading === 'Scale') input.min = '0.001';
    input.addEventListener('input', () => { const value = Number(input.value); if (input.value === '' || !Number.isFinite(value) || (heading === 'Scale' && value <= 0)) return; callback(axis, value); });
    input.addEventListener('change', () => { const value = Number(input.value); if (input.value === '' || !Number.isFinite(value) || (heading === 'Scale' && value <= 0)) { toast(heading === 'Scale' ? 'Enter a valid positive scale.' : 'Enter a valid number.'); syncTransform(); } });
    const defaultValue = defaultValues[i];
    label.append(span); fieldRow.append(input, resetButton(`${heading} ${axis.toUpperCase()}`, defaultValue, () => { onReset(axis, defaultValue); input.value = defaultValue; })); cell.append(label, fieldRow); row.append(cell); transformInputs.push({ input, prefix, axis });
  }
  section.append(title, row); parent.append(section); return section;
}
function syncTransform() {
  const entry = engine.selected; if (!entry) return;
  for (const { input, prefix, axis } of transformInputs) if (document.activeElement !== input) input.value = Number((prefix === 'rotation' ? entry.object.rotation[axis] * 180 / Math.PI : prefix === 'target' ? entry.target[axis] : entry.object[prefix][axis]).toFixed(3));
  if (entry.type === 'light') entry.helper.update();
}
function cameraPanel(panel, entry) {
  const update = () => { if (entry.object.position.distanceTo(entry.target) < .001) entry.target.z -= .01; engine.updateCamera(entry); syncTransform(); };
  xyz(panel, 'Position', entry.object.position.toArray(), (axis, value) => { entry.object.position[axis] = value; update(); }, 'position', cameraDefaults.position);
  xyz(panel, 'Aim at', entry.target.toArray(), (axis, value) => { entry.target[axis] = value; update(); }, 'target', cameraDefaults.target);
  const section = document.createElement('div'); section.className = 'setting-section';
  const label = document.createElement('label'); label.className = 'inline-color'; label.textContent = 'Projection';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Camera projection'); for (const [value, name] of projections) select.add(new Option(name, value)); select.value = entry.projection;
  select.onchange = () => { entry.projection = select.value; update(); selectionPanel(); }; label.append(select); section.append(label); panel.append(section);
  attachReset(select, 'Camera projection', 'Perspective', () => { entry.projection = cameraDefaults.projection; update(); selectionPanel(); });
  const fov = range(section, 'camera-fov', 'Field of view', 10, 170, 1, '°', entry.fov, value => { entry.fov = value; update(); }, cameraDefaults.fov); fov.input.disabled = entry.projection === 'orthographic'; cameraControls.set('fov', fov);
  if (entry.projection === 'orthographic') cameraControls.set('orthoSize', range(section, 'camera-size', 'View height', .1, 30, .1, '', entry.orthoSize, value => { entry.orthoSize = value; update(); }, cameraDefaults.orthoSize));
  if (['barrel', 'pincushion'].includes(entry.projection)) cameraControls.set('distortion', range(section, 'camera-distortion', 'Lens distortion', 0, 1, .01, '%', entry.distortion, value => { entry.distortion = value; update(); }, cameraDefaults.distortion));
  const clips = document.createElement('div'); clips.className = 'clip-fields';
  for (const [key, title] of [['near', 'Near clipping'], ['far', 'Far clipping']]) {
    const label = document.createElement('label'); label.textContent = title; const input = document.createElement('input'); input.type = 'number'; input.step = '.01'; input.min = key === 'near' ? '.001' : '.01'; input.max = key === 'near' ? '1000' : '10000000'; input.value = entry[key]; input.setAttribute('aria-label', title);
    const apply = value => { if (!Number.isFinite(value) || value < +input.min || value > +input.max || (key === 'near' ? value >= entry.far : value <= entry.near)) { toast('Near clipping must be positive and below far clipping.'); input.value = entry[key]; return; } entry[key] = value; input.value = value; update(); };
    input.onchange = () => apply(+input.value); label.append(input); clips.append(label); attachReset(input, title, cameraDefaults[key], () => apply(cameraDefaults[key]));
  }
  section.append(clips);
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = entry.projection === 'fisheye' ? 'Equidistant circular fisheye, up to 170°. Frame adjusts the active view. Hatch widths remain constant after distortion.' : entry.projection === 'orthographic' ? 'Parallel projection. Scroll changes view height; distance does not change object size.' : 'Orbit, pan and zoom update only this camera. Select another camera to restore its view.'; panel.append(hint);
}
function modelExtras(panel, entry) {
  const section = document.createElement('div'); section.className = 'setting-section'; panel.append(section);
  const label = document.createElement('label'); label.className = 'checkbox-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = Boolean(entry.hatch); check.setAttribute('aria-label', 'Use separate hatching setup');
  const setOwn = enabled => { entry.hatch = enabled ? hatchingSettings(engine.params) : null; engine.invalidate(); engine.draw(); engine.schedule(); if (!enabled && hatchTarget === entry) setHatchScope(null); sceneList(); selectionPanel(); };
  check.onchange = () => setOwn(check.checked); label.append(check, document.createTextNode('Use separate hatching setup')); section.append(label); attachReset(check, 'Separate hatching setup', 'off', () => setOwn(false));
  const edit = document.createElement('button'); edit.className = 'button subtle full'; edit.textContent = 'Edit this object’s hatching'; edit.onclick = () => { if (!entry.hatch) engine.setObjectParams(entry, { ...engine.params }); setHatchScope(entry); tab('hatch'); }; section.append(edit);
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = entry.hatch ? 'This object keeps its own style when global settings change.' : 'This object follows the global hatching setup.'; section.append(hint);
  if (entry.source?.kind === 'file') {
    const label = document.createElement('label'); label.className = 'file-reference'; label.textContent = 'Local model path'; const input = document.createElement('input'); input.type = 'text'; input.value = entry.source.path; input.placeholder = 'Enter full path for scene saves'; input.setAttribute('aria-label', 'Local model path'); const original = entry.source.path;
    input.onchange = () => { entry.source.path = input.value.trim().replace(/^"|"$/g, ''); }; label.append(input); section.append(label); attachReset(input, 'Local model path', original || 'empty', () => { input.value = entry.source.path = original; });
  }
}
function populateScenes() {
  if (!savedScenes.some(s => s.id === selectedSceneId)) selectedSceneId = savedScenes[0]?.id || '';
  $('saved-scene').replaceChildren(...(savedScenes.length ? savedScenes.map(s => new Option(s.name, s.id)) : [new Option('No saved scenes yet', '')])); $('saved-scene').value = selectedSceneId;
  $('load-scene').disabled = sceneBusy || !selectedSceneId; $('save-scene').disabled = sceneBusy;
}
function requestModelPath({ title, description, path = '', error = '', browse = 'relink', infoOnly = false }) {
  return new Promise(resolve => {
    const dialog = $('model-path-dialog'), form = $('model-path-form');
    $('model-path-title').textContent = title; $('model-path-description').textContent = description; $('model-path-input').value = path; $('model-path-error').textContent = error; $('model-path-error').hidden = !error;
    $('path-service-hint').textContent = localPaths ? 'Use the full path to the original file. In Windows Explorer, Shift + right-click the file → Copy as path.' : 'Direct paths require the included local server. Browse to reselect the model file.';
    $('confirm-model-path').disabled = !localPaths; $('browse-model-path').hidden = infoOnly; $('relink-file').value = '';
    let result = null;
    const clean = () => { dialog.removeEventListener('close', clean); form.onsubmit = null; $('relink-file').onchange = null; resolve(result); };
    dialog.addEventListener('close', clean);
    $('cancel-model-path').onclick = () => dialog.close(); $('browse-model-path').onclick = () => $('relink-file').click();
    $('relink-file').onchange = () => { const file = $('relink-file').files[0]; if (!file) return; result = { file, source: { kind: 'file', path: '', filename: file.name } }; dialog.close(); };
    form.onsubmit = async e => {
      e.preventDefault(); const path = $('model-path-input').value.trim().replace(/^"|"$/g, ''); $('confirm-model-path').disabled = true;
      try { const value = await localModel(path, infoOnly); result = infoOnly ? { source: { kind: 'file', path, filename: value.filename } } : { file: value, source: { kind: 'file', path, filename: value.name } }; dialog.close(); }
      catch (error) { $('model-path-error').textContent = error.message; $('model-path-error').hidden = false; }
      finally { $('confirm-model-path').disabled = !localPaths; }
    };
    dialog.showModal(); $('model-path-input').focus();
  });
}
async function restoreScene(state) {
  const staged = []; sceneBusy = true; importBusy = true; populateScenes(); $('loading').hidden = false;
  try {
    for (const saved of state.models) {
      $('loading').textContent = `Loading ${saved.name}…`; let entry;
      if (saved.source.kind === 'sigil') entry = await engine.createSigil(saved.source.design, saved.name, false);
      else if (saved.source.kind === 'demo') entry = await engine.demo(saved.source.shape, false);
      else {
        let file, source = { ...saved.source }, error;
        if (localPaths && source.path) try { file = await localModel(source.path); } catch (e) { error = e.message; }
        else error = source.path ? 'The local file service is unavailable. Reselect this model file.' : 'The saved model has no full local path. Reselect it or enter its path.';
        while (!entry) {
          if (!file) { const result = await requestModelPath({ title: `Relink ${saved.name}`, description: `The model could not be opened: ${source.path || source.filename}. Update its location to continue loading this scene.`, path: source.path, error }); if (!result) return false; file = result.file; source = {...source,...result.source}; }
          try { entry = await engine.load(file, { register: false, source }); }
          catch (e) { error = `Could not read model geometry: ${e.message}`; file = null; }
        }
      }
      entry.id = saved.id; entry.name = entry.object.name = saved.name; entry.object.position.fromArray(saved.position); entry.object.rotation.set(...saved.rotation); entry.object.scale.fromArray(saved.scale); entry.visible = entry.object.visible = saved.visible; entry.hatch = saved.hatch ? { ...saved.hatch } : null;entry.toon=saved.toon||null; staged.push(entry);
    }
    // Only replace the visible scene after every model has been resolved and parsed.
    engine.select(null); for (const entry of [...engine.models, ...engine.lights]) engine.remove(entry);
    engine.params = { ...state.settings }; engine.outputSettings=state.output; engine.models = staged; for (const entry of staged) engine.scene.add(entry.object);
    for (const saved of state.lights) { const entry = engine.addLight(saved.lightType); entry.id = saved.id; entry.name = saved.name; entry.object.position.fromArray(saved.position); entry.target.fromArray(saved.target); entry.intensity = saved.intensity; entry.falloff = saved.falloff; entry.color = saved.color; entry.visible = entry.object.visible = saved.visible; entry.helperEnabled = saved.helperVisible; engine.updateLight(entry); }
    const cameras = state.cameras.map(saved => { const entry = engine.addCamera(saved); entry.id = saved.id; return entry; }); engine.cameras = cameras; engine.activateCamera(cameras.find(c => c.id === state.activeCameraId));
    engine.serial = Math.max(engine.serial, ...[...engine.models, ...engine.lights, ...engine.cameras].map(e => Number(e.id.split('-').pop()) || 0));
    engine.grid.visible = $('grid').checked = state.grid;engine.setLightIconsVisible(state.lightIcons); viewMode(state.mode); setHatchScope(null); sceneList(); selectionPanel(); engine.invalidate(); engine.draw(); engine.schedule();
    // Retain repaired references in the named save without storing model geometry.
    const record = savedScenes.find(s => s.id === selectedSceneId);
    if (record) try { const result = saveNamedScene(localStorage, record.name, snapshotScene(engine)); savedScenes = result.scenes; populateScenes(); } catch { toast('Scene loaded, but its repaired paths could not be saved.'); }
    return true;
  } finally {
    if (engine.models !== staged) for (const entry of staged) entry.object.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); mesh.userData.fieldMaterial?.dispose(); });
    sceneBusy = false; importBusy = false; populateScenes(); $('loading').hidden = true;
  }
}
function setupSceneStorage() {
  $('saved-scene').onchange = () => { selectedSceneId = $('saved-scene').value; };
  $('save-scene').onclick = () => { $('scene-name').value = savedScenes.find(s => s.id === selectedSceneId)?.name || ''; $('save-scene-dialog').showModal(); $('scene-name').focus(); };
  $('cancel-save-scene').onclick = () => $('save-scene-dialog').close();
  $('save-scene-form').onsubmit = async e => {
    e.preventDefault(); const name = $('scene-name').value; $('save-scene-dialog').close(); if (sceneBusy || importBusy) return toast('Wait for model loading to finish.'); sceneBusy = true; populateScenes();
    try {
      if (localPaths) for (const entry of engine.models) if (entry.source?.kind === 'file') {
        let error = ''; if (entry.source.path) try { await localModel(entry.source.path, true); continue; } catch (e) { error = e.message; }
        const result = await requestModelPath({ title: `File path for ${entry.name}`, description: 'The browser does not reveal the full path of a browsed file. Enter it once so saved scenes can reopen this model automatically.', path: entry.source.path, error, infoOnly: true }); if (!result) return; entry.source = {...entry.source,...result.source};
      }
      const result = saveNamedScene(localStorage, name, snapshotScene(engine)); savedScenes = result.scenes; selectedSceneId = result.record.id; toast(`${result.replaced ? 'Updated' : 'Saved'} scene “${result.record.name}”.`);
    } catch (e) { toast(e.name === 'QuotaExceededError' ? 'Browser storage is full. The scene was not saved.' : e.message); }
    finally { sceneBusy = false; populateScenes(); selectionPanel(); }
  };
  $('load-scene').onclick = async () => { if (sceneBusy || importBusy) return toast('Wait for the current import to finish.'); const record = savedScenes.find(s => s.id === $('saved-scene').value); if (!record) return; try { if (await restoreScene(record.scene)) toast(`Loaded scene “${record.name}”.`); } catch (e) { toast(`Scene could not be loaded: ${e.message}`); } };
}
function selectionPanel() {
  const panel = $('selection-settings'); panel.replaceChildren(); transformInputs.length = 0; cameraControls.clear();
  const entry = engine.selected;
  if (!entry) { panel.innerHTML = '<div class="empty-selection"><strong>No object selected</strong>Click a model in the drawing or select an item in the scene.</div>'; return; }
  const title = document.createElement('div'); title.className = 'selection-name'; title.textContent = entry.name; const meta = document.createElement('div'); meta.className = 'selection-meta'; meta.textContent = ['model','sigil'].includes(entry.type) ? `${entry.triangles.toLocaleString()} triangles · ${entry.type === 'sigil' ? 'procedural sigil' : 'geometry only'}` : entry.type === 'camera' ? 'Active view · navigation updates this camera' : entry.lightType === 'sun' ? 'Directional light · infinite distance' : 'Point light · local illumination'; panel.append(title, meta);
  if (entry.type === 'camera') { cameraPanel(panel, entry); return; }
  const change = () => { if (entry.type === 'light') engine.updateLight(entry); else { engine.invalidate(); engine.draw(); engine.schedule(); } syncTransform(); };
  xyz(panel, 'Position', entry.object.position.toArray(), (axis, value) => { entry.object.position[axis] = value; change(); }, 'position', entry.type === 'light' ? lightDefaults[entry.lightType].position : [0, 0, 0]);
  if (['model','sigil'].includes(entry.type)) {
    xyz(panel, 'Rotation (°)', [entry.object.rotation.x, entry.object.rotation.y, entry.object.rotation.z].map(x => x * 180 / Math.PI), (axis, value) => { entry.object.rotation[axis] = value * Math.PI / 180; change(); }, 'rotation', [0, 0, 0]);
    const scaleSection = xyz(panel, 'Scale', entry.object.scale.toArray(), (axis, value) => { if ($('uniform-scale').checked) { const ratio = value / entry.object.scale[axis]; entry.object.scale.multiplyScalar(ratio); } else entry.object.scale[axis] = value; change(); }, 'scale', [1, 1, 1], (axis, value) => { entry.object.scale[axis] = value; change(); });
    const uniform = document.createElement('label'); uniform.className = 'uniform'; uniform.innerHTML = '<input type="checkbox" id="uniform-scale" checked> Link scale axes'; scaleSection.append(uniform);
    attachReset($('uniform-scale'), 'Link scale axes', 'on', () => { $('uniform-scale').checked = true; });
    const reset = document.createElement('button'); reset.className = 'button subtle full'; reset.textContent = 'Reset transform'; reset.onclick = () => { entry.object.position.set(0, 0, 0); entry.object.rotation.set(0, 0, 0); entry.object.scale.set(1, 1, 1); change(); }; panel.append(reset);
    if (entry.type === 'sigil') { const edit=document.createElement('button');edit.className='button accent full';edit.textContent='Edit curves & mesh';edit.onclick=()=>editSigil(entry);panel.append(edit); }
    modelExtras(panel, entry);
  } else {
    const factory = lightDefaults[entry.lightType];
    if (entry.lightType === 'sun') {
      const row=document.createElement('div');row.className='segmented light-edit-modes';row.setAttribute('role','group');row.setAttribute('aria-label','Sun light gizmo');
      for(const [mode,name]of [['position','Move light'],['aim','Aim light']]){const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-pressed',String(engine.lightEditMode===mode));button.classList.toggle('active',engine.lightEditMode===mode);button.onclick=()=>{engine.setLightEditMode(mode);selectionPanel();};row.append(button);}
      panel.append(row,resetButton('Sun light gizmo','Aim light',()=>{engine.setLightEditMode('aim');selectionPanel();}));
      xyz(panel, 'Aim at', entry.target.toArray(), (axis, value) => { entry.target[axis] = value; change(); }, 'target', factory.target);
    }
    const section = document.createElement('div'); section.className = 'setting-section'; panel.append(section);
    range(section, 'light-intensity', 'Intensity', 0, 5, 0.05, '', entry.intensity, value => { entry.intensity = value; change(); }, factory.intensity);
    if (entry.lightType === 'point') range(section, 'light-falloff', 'Distance falloff', 0, 0.5, 0.005, '', entry.falloff, value => { entry.falloff = value; change(); }, factory.falloff);
    const color = document.createElement('label'); color.className = 'inline-color'; color.append(document.createTextNode('Light color')); const input = document.createElement('input'); input.type = 'color'; input.value = entry.color; input.setAttribute('aria-label', 'Light color'); input.oninput = () => { entry.color = input.value; change(); }; color.append(input); section.append(color);
    attachReset(input, 'Light color', factory.color, () => { input.value = entry.color = factory.color; change(); });
    const helpers = document.createElement('label'); helpers.className = 'checkbox-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = entry.helperEnabled; check.onchange = () => { entry.helperEnabled = check.checked; engine.draw(); }; helpers.append(check, document.createTextNode('Show light helper')); panel.append(helpers);
    attachReset(check, 'Show light helper', 'off', () => { check.checked = entry.helperEnabled = false; engine.draw(); });
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = entry.lightType === 'sun' ? 'Aim light places the gizmo at the sun’s target. Drag its axes to point the light; Move light changes the source position. The arrow shows its direction.' : 'Move the light with the gizmo. Higher falloff reduces illumination with distance.'; panel.append(hint);
  }
}
function refreshSettings() {
  const params = hatchParams();
  toonEditor?.refresh(toonParams());const drawing=document.querySelector('[data-view="hatch"]');if(drawing)drawing.textContent=engine.params.shadeMode==='toon'?'Toon':engine.params.shadeMode==='combined'?'Toon + hatching':'Hatching';
  for (const [key, control] of controls) control.update(params[key]);
  $('ink').value = params.ink; $('paper-color').value = params.paper; $('outline-color').value = params.outlineColor;
  $('depth-line-color').value=params.depthColor;$('depth-outline').checked=params.depthOutline;$('depth-across').checked=params.depthAcross;
  for(const key of depthKeys){const control=controls.get(key);if(control)control.input.disabled=!params.depthOutline;}$('depth-line-color').disabled=$('depth-across').disabled=!params.depthOutline;
  $('hard-contour').checked=params.hardContour;$('hard-line-color').value=params.hardColor;
  for(const key of hardKeys){const control=controls.get(key);if(control)control.input.disabled=!params.hardContour;}$('hard-line-color').disabled=!params.hardContour;
  $('cross').checked = params.cross; $('outline').checked = params.outline; $('quality').value = engine.params.quality;
  for(const key of ['crossThreshold','crossAngle'])controls.get(key).input.disabled = !params.cross; controls.get('outlineWidth').input.disabled = !params.outline;
  updatePresetStatus();
}
async function loadFiles(files, source = null) {
  if (importBusy || sceneBusy) { toast('Please wait for scene loading or saving to finish.'); return; }
  importBusy = true; $('import').disabled = true;
  for (const file of files) {
    $('loading').hidden = false; $('loading').textContent = `Reading ${file.name}…`;
    try {const before=engine.models.length;await engine.load(file, { source });tab('selection');const count=engine.models.length-before;toast(`Imported ${file.name}${count>1?` · ${count} separate objects`:''}`);} catch (e) { toast(`Could not import ${file.name}: ${e.message}`); }
  }
  importBusy = false; $('import').disabled = false; $('loading').hidden = true; $('file').value = '';
}
function transformMode(mode) { mode=engine.setTransform(mode); document.querySelectorAll('[data-transform]').forEach(button => button.classList.toggle('active', button.dataset.transform === mode)); }
function viewMode(mode) { engine.setMode(mode); document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === mode)); }

async function init() {
  try { engine = new EtchEngine($('viewport'), $('paper')); } catch (e) { $('loading').textContent = 'WebGL 2 is required. Open this app in an updated browser with graphics acceleration enabled.'; toast(e.message); return; }
  toonEditor=new ToonEditor($('toon-settings'),{getStyle:toonParams,getOverride:()=>toonTarget?{custom:!!toonTarget.toon}:null,onCustom:enabled=>{if(!toonTarget)return;engine.setObjectToon(toonTarget,enabled?engine.params:null);populateHatchScope();refreshSettings();},onChange:changeToon,onScope:id=>setToonScope(engine.models.find(e=>e.id===id)||null),resetButton,onMessage:toast});
  try { savedPresets = readSavedPresets(localStorage); } catch (e) { toast(e.message || 'Browser storage is unavailable.'); }
  populatePresets();
  for (const [parent, key, name, min, max, step, suffix] of definitions) controls.set(key, range($(parent), key, name, min, max, step, suffix, engine.params[key], value => applyHatchPatch({ [key]: value }), defaults[key]));
  controls.get('crossAngle').input.title='Angle from the main hatch direction on the model surface. 90° is perpendicular; 0° and 180° follow the same direction.';
  engine.addEventListener('scene', sceneList);
  engine.addEventListener('selection', () => { sceneList(); selectionPanel(); refreshSettings(); });
  engine.addEventListener('transform', syncTransform);
  engine.addEventListener('camera-change', () => { syncTransform(); if (engine.selected?.type === 'camera') for (const [key, control] of cameraControls) if (document.activeElement !== control.input) control.update(engine.selected[key]); });
  engine.addEventListener('error', e => { toast(e.detail); $('status').textContent = 'Render failed'; $('loading').hidden = true; });
  engine.addEventListener('notice', e => toast(e.detail));
  const syncLightIcons=()=>{$('light-icons').setAttribute('aria-pressed',String(engine.showLightIcons));};
  engine.addEventListener('light-visuals',syncLightIcons);$('light-icons').onclick=()=>{engine.setLightIconsVisible(!engine.showLightIcons);};syncLightIcons();
  $('light-icons').after(resetButton('Light icons','on',()=>engine.setLightIconsVisible(true)));
  engine.addEventListener('navigation',e=>{$('fly-hint').hidden=!e.detail;});
  engine.addEventListener('rendering', () => { $('status').textContent = 'Tracing surface lines…'; });
  engine.addEventListener('rendered', e => { $('status').textContent = `${e.detail.lines.toLocaleString()} strokes${e.detail.hardEdges?` + ${e.detail.hardEdges} hard contours`:''}${e.detail.depthEdges?` + ${e.detail.depthEdges} depth edges`:''} · ${e.detail.width} × ${e.detail.height} · ${e.detail.ms} ms`; if (!importBusy) $('loading').hidden = true; });
  if(location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)&&['/','/index.html'].includes(location.pathname)){
    try { localPaths = (await fetch('/api/capabilities').then(r => r.ok ? r.json() : {})).localPaths === true; } catch {}
  }
  try { savedScenes = readSavedScenes(localStorage); } catch (e) { toast(e.message); } populateScenes();
  setupSceneStorage();
  $('add-sigil').onclick=addSigil;
  $('add-object-type').onchange=async()=>{const type=$('add-object-type').value;$('add-object-type').value='';if(type==='sigil')await addSigil();else if(type==='model')$('import').click();else if(type){try{const entry=await engine.demo(type);engine.select(entry);engine.frame(entry);tab('selection');}catch(e){toast(e.message);}}};
  $('import').onclick = $('import-secondary').onclick = async () => { if (!localPaths) return $('file').click(); const result = await requestModelPath({ title: 'Import model', description: 'Enter a full local file path to enable automatic scene reloading, or browse and enter the path when saving.', browse: 'import' }); if (result?.file) await loadFiles([result.file], result.source); };  $('file').onchange = () => loadFiles([...$('file').files]);
  $('add-camera').onclick = () => { engine.select(engine.addCamera()); tab('selection'); };
  $('hatch-scope').onchange = () => { const entry = engine.models.find(e => e.id === $('hatch-scope').value); if (entry && !entry.hatch) engine.setObjectParams(entry, { ...engine.params }); setHatchScope(entry || null); };
  attachReset($('hatch-scope'), 'Hatching setup', 'Global', () => setHatchScope(null));
  $('depth-scope').onchange=()=>{const entry=engine.models.find(e=>e.id===$('depth-scope').value);if(entry&&!entry.hatch)engine.setObjectParams(entry,{...engine.params});setHatchScope(entry||null);};
  attachReset($('depth-scope'),'Depth outline setup','Global',()=>setHatchScope(null));
  $('reset-depth').onclick=()=>{applyHatchPatch(Object.fromEntries(depthKeys.map(key=>[key,defaults[key]])));};
  $('add-sun').onclick = () => { engine.select(engine.addLight('sun')); tab('selection'); };
  $('add-point').onclick = () => { engine.select(engine.addLight('point')); tab('selection'); };
  $('delete').onclick = () => engine.remove(); $('frame').onclick = () => engine.frame(); $('reset-camera').onclick = () => engine.resetCamera();
  $('grid').onchange = () => { engine.grid.visible = $('grid').checked;if(engine.activeCamera.projection==='fisheye'){engine.invalidate();engine.schedule();}engine.draw(); };
  $('space').onchange = () => { engine.transform.setSpace($('space').value); engine.draw(); };
  attachReset($('grid'), 'Grid', 'off', () => { $('grid').checked = engine.grid.visible = false; engine.draw(); });
  attachReset($('space'), 'Transform space', 'World', () => { $('space').value = 'world'; engine.transform.setSpace('world'); engine.draw(); });
  const viewModes = document.querySelector('.view-modes'), transformModes = document.querySelector('.transform-modes');
  viewModes.after(resetButton('View mode', 'Hatching', () => viewMode('hatch')));
  transformModes.after(resetButton('Transform mode', 'Move', () => transformMode('translate')));
  document.querySelectorAll('[data-transform]').forEach(button => button.onclick = () => transformMode(button.dataset.transform));
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => viewMode(button.dataset.view));
  document.querySelectorAll('[data-demo]').forEach(button => button.onclick = async () => { try { const entry = await engine.demo(button.dataset.demo); engine.select(entry); engine.frame(entry); tab('selection'); } catch (e) { toast(e.message); } });
  $('hatch-tab').onclick = () => tab('hatch'); $('selection-tab').onclick = () => tab('selection');$('depth-tab').onclick=()=>tab('depth');$('toon-tab').onclick=()=>tab('toon');
  for (const [id, key, name] of [['ink', 'ink', 'Line color'], ['paper-color', 'paper', 'Paper'], ['outline-color', 'outlineColor', 'Outline color'],['depth-line-color','depthColor','Depth line color'],['hard-line-color','hardColor','Hard contour color']]) {
    $(id).oninput = () => applyHatchPatch({ [key]: $(id).value }); attachReset($(id), name, defaults[key], () => applyHatchPatch({ [key]: defaults[key] }));
  }
  for (const [id, key, name] of [['cross', 'cross', 'Cross-hatching'], ['outline', 'outline', 'Outer outline'],['depth-outline','depthOutline','Depth outlines'],['depth-across','depthAcross','Across object boundaries'],['hard-contour','hardContour','Hard contours']]) {
    $(id).onchange = () => applyHatchPatch({ [key]: $(id).checked }); attachReset($(id), name, defaults[key] ? 'on' : 'off', () => applyHatchPatch({ [key]: defaults[key] }));
  }
  $('quality').onchange = () => { engine.setParams({ quality: +$('quality').value }); refreshSettings(); };
  attachReset($('quality'), 'Render detail', 'Balanced · 1100 px', () => { engine.setParams({ quality: defaults.quality }); refreshSettings(); });
  $('reset-settings').onclick = () => loadPreset('engraving');
  $('preset').onchange = () => loadPreset($('preset').value);
  $('load-preset').onclick = () => loadPreset($('preset').value);
  attachReset($('preset'), 'Preset', 'Engraving', () => loadPreset('engraving'));
  $('save-preset').onclick = () => { $('preset-name').value = selectedPresetId.startsWith('saved-') ? currentPreset()?.name || '' : ''; $('save-preset-dialog').showModal(); $('preset-name').focus(); };
  $('cancel-save-preset').onclick = () => $('save-preset-dialog').close();
  $('save-preset-form').onsubmit = e => {
    e.preventDefault();
    try {
      const result = saveNamedPreset(localStorage, $('preset-name').value, hatchParams()); savedPresets = result.presets; selectedPresetId = result.preset.id;
      populatePresets(); updatePresetStatus(); $('save-preset-dialog').close(); toast(`${result.replaced ? 'Updated' : 'Saved'} preset “${result.preset.name}”.`);
    } catch (error) { toast(error.name === 'QuotaExceededError' ? 'Browser storage is full. The preset was not saved.' : error.message || 'This browser could not save the preset.'); }
  };
  window.addEventListener('storage', e => { if (e.key === SCENE_STORAGE_KEY || e.key === null) { try { savedScenes = readSavedScenes(localStorage); populateScenes(); } catch (error) { toast(error.message); } } if (e.key === PRESET_STORAGE_KEY || e.key === null) { try { savedPresets = readSavedPresets(localStorage); populatePresets(); updatePresetStatus(); } catch (error) { toast(error.message); } } });
  const outputEditor=new OutputEditor(engine);$('export').onclick=()=>outputEditor.open();
  document.addEventListener('keydown', e => {
    if (engine.navigation.active || document.querySelector('dialog[open]') || e.target.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (['delete', 'backspace', 'f', 'w', 'e', 'r', 'escape', '1', '2'].includes(key)) e.preventDefault();
    if (key === 'delete' || key === 'backspace') engine.remove();
    else if (key === 'f') engine.frame(); else if (key === 'escape') engine.select(null);
    else if (['w', 'e', 'r'].includes(key)) transformMode({ w: 'translate', e: 'rotate', r: 'scale' }[key]);
    else if (key === '1' || key === '2') viewMode(key === '1' ? 'hatch' : 'solid');
  });
  const stage = $('viewport'); let dragCount = 0;
  stage.addEventListener('dragenter', e => { e.preventDefault(); dragCount++; stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; stage.classList.remove('drag-over'); } });
  stage.addEventListener('dragover', e => e.preventDefault());
  stage.addEventListener('drop', e => { e.preventDefault(); dragCount = 0; stage.classList.remove('drag-over'); loadFiles([...e.dataTransfer.files]); });
  selectionPanel(); refreshSettings();
  engine.addLight('sun');
  try { await engine.demo(); engine.frame(null); engine.select(null); } catch (e) { toast(e.message); $('loading').hidden = true; }
  sceneList();
  registerBrowserTools(engine, refreshSettings);
}
init();
