import { EtchEngine } from './engine.js';
import { defaults, lightDefaults, definitions, builtinPresets, PRESET_STORAGE_KEY, readSavedPresets, saveNamedPreset, settingsMatch } from './settings.js';

const $ = id => document.getElementById(id);
let engine, importBusy = false, toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6000); }
function tab(which) { const hatch = which === 'hatch'; $('hatch-settings').hidden = !hatch; $('selection-settings').hidden = hatch; for (const [id, active] of [['hatch-tab', hatch], ['selection-tab', !hatch]]) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-selected', String(active)); } }
const controls = new Map();
let savedPresets = [], selectedPresetId = 'engraving';

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
  const modified = !preset || !settingsMatch(engine.params, preset.settings);
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
  selectedPresetId = id; $('preset').value = id; engine.setParams({ ...preset.settings }); refreshSettings();
}
function applyHatchPatch(patch) {
  const adjusted = { ...patch };
  if ('spacing' in patch && patch.spacing > (patch.lightSpacing ?? engine.params.lightSpacing)) adjusted.lightSpacing = patch.spacing;
  if ('lightSpacing' in patch && patch.lightSpacing < (patch.spacing ?? engine.params.spacing)) adjusted.spacing = patch.lightSpacing;
  engine.setParams(adjusted); refreshSettings();
}
function range(parent, key, name, min, max, step, suffix, value, callback, defaultValue = value) {
  const wrap = document.createElement('div'); wrap.className = 'control';
  const labelRow = document.createElement('div'); labelRow.className = 'control-label';
  const label = document.createElement('label'), output = document.createElement('output'), input = document.createElement('input');
  input.id = `parameter-${key}`; input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value; label.htmlFor = input.id; label.textContent = name; output.htmlFor = input.id;
  const update = v => { input.value = v; output.value = suffix === '%' ? `${Math.round(v * 100)}%` : `${Number(Number(v).toFixed(2))}${suffix}`; };
  update(value); input.addEventListener('input', () => { update(+input.value); callback(+input.value); });
  const actions = document.createElement('div'); actions.className = 'property-actions';
  actions.append(output, resetButton(name, defaultValue, () => { update(defaultValue); callback(defaultValue); }));
  labelRow.append(label, actions); wrap.append(labelRow, input); parent.append(wrap); return { input, update, wrap };
}
function sceneList() {
  for (const [list, entries] of [[$('model-list'), engine.models], [$('light-list'), engine.lights]]) {
    list.replaceChildren();
    if (!entries.length) { const empty = document.createElement('div'); empty.className = 'hint'; empty.textContent = list.id === 'model-list' ? 'Import a model to begin.' : 'Add a sun or point light.'; list.append(empty); }
    for (const entry of entries) {
      const row = document.createElement('div'); row.className = `scene-item${engine.selected === entry ? ' selected' : ''}`;
      const select = document.createElement('button'); select.className = 'select-item'; select.title = entry.name; select.setAttribute('aria-label', `Select ${entry.name}`);
      const icon = document.createElement('span'); icon.className = 'object-icon'; icon.textContent = entry.type === 'model' ? '◇' : entry.lightType === 'sun' ? '☼' : '◉';
      const name = document.createElement('span'); name.className = 'item-name'; name.textContent = entry.name;
      select.append(icon, name); select.onclick = () => { engine.select(entry); tab('selection'); };
      const visibility = document.createElement('button'); visibility.className = 'visibility'; visibility.textContent = entry.visible ? '◉' : '○'; visibility.title = entry.visible ? 'Hide' : 'Show'; visibility.setAttribute('aria-label', `${entry.visible ? 'Hide' : 'Show'} ${entry.name}`); visibility.setAttribute('aria-pressed', String(entry.visible)); visibility.onclick = () => engine.setVisible(entry, !entry.visible);
      row.append(select, visibility, resetButton(`${entry.name} visibility`, 'visible', () => engine.setVisible(entry, true))); list.append(row);
    }
  }
  $('scene-count').textContent = `${engine.models.length} ${engine.models.length === 1 ? 'object' : 'objects'}`;
  $('light-count').textContent = `${engine.lights.length} / 8`;
  $('add-sun').disabled = $('add-point').disabled = engine.lights.length >= 8;
  $('delete').disabled = !engine.selected;
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
function selectionPanel() {
  const panel = $('selection-settings'); panel.replaceChildren(); transformInputs.length = 0;
  const entry = engine.selected;
  if (!entry) { panel.innerHTML = '<div class="empty-selection"><strong>No object selected</strong>Click a model in the drawing or select an item in the scene.</div>'; return; }
  const title = document.createElement('div'); title.className = 'selection-name'; title.textContent = entry.name; const meta = document.createElement('div'); meta.className = 'selection-meta'; meta.textContent = entry.type === 'model' ? `${entry.triangles.toLocaleString()} triangles · geometry only` : entry.lightType === 'sun' ? 'Directional light · infinite distance' : 'Point light · local illumination'; panel.append(title, meta);
  const change = () => { if (entry.type === 'light') engine.updateLight(entry); else { engine.invalidate(); engine.draw(); engine.schedule(); } syncTransform(); };
  xyz(panel, 'Position', entry.object.position.toArray(), (axis, value) => { entry.object.position[axis] = value; change(); }, 'position', entry.type === 'light' ? lightDefaults[entry.lightType].position : [0, 0, 0]);
  if (entry.type === 'model') {
    xyz(panel, 'Rotation (°)', [entry.object.rotation.x, entry.object.rotation.y, entry.object.rotation.z].map(x => x * 180 / Math.PI), (axis, value) => { entry.object.rotation[axis] = value * Math.PI / 180; change(); }, 'rotation', [0, 0, 0]);
    const scaleSection = xyz(panel, 'Scale', entry.object.scale.toArray(), (axis, value) => { if ($('uniform-scale').checked) { const ratio = value / entry.object.scale[axis]; entry.object.scale.multiplyScalar(ratio); } else entry.object.scale[axis] = value; change(); }, 'scale', [1, 1, 1], (axis, value) => { entry.object.scale[axis] = value; change(); });
    const uniform = document.createElement('label'); uniform.className = 'uniform'; uniform.innerHTML = '<input type="checkbox" id="uniform-scale" checked> Link scale axes'; scaleSection.append(uniform);
    attachReset($('uniform-scale'), 'Link scale axes', 'on', () => { $('uniform-scale').checked = true; });
    const reset = document.createElement('button'); reset.className = 'button subtle full'; reset.textContent = 'Reset transform'; reset.onclick = () => { entry.object.position.set(0, 0, 0); entry.object.rotation.set(0, 0, 0); entry.object.scale.set(1, 1, 1); change(); }; panel.append(reset);
  } else {
    const factory = lightDefaults[entry.lightType];
    if (entry.lightType === 'sun') xyz(panel, 'Aim at', entry.target.toArray(), (axis, value) => { entry.target[axis] = value; change(); }, 'target', factory.target);
    const section = document.createElement('div'); section.className = 'setting-section'; panel.append(section);
    range(section, 'light-intensity', 'Intensity', 0, 5, 0.05, '', entry.intensity, value => { entry.intensity = value; change(); }, factory.intensity);
    if (entry.lightType === 'point') range(section, 'light-falloff', 'Distance falloff', 0, 0.5, 0.005, '', entry.falloff, value => { entry.falloff = value; change(); }, factory.falloff);
    const color = document.createElement('label'); color.className = 'inline-color'; color.append(document.createTextNode('Light color')); const input = document.createElement('input'); input.type = 'color'; input.value = entry.color; input.setAttribute('aria-label', 'Light color'); input.oninput = () => { entry.color = input.value; change(); }; color.append(input); section.append(color);
    attachReset(input, 'Light color', factory.color, () => { input.value = entry.color = factory.color; change(); });
    const helpers = document.createElement('label'); helpers.className = 'checkbox-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = entry.helper.visible; check.onchange = () => { entry.helper.visible = check.checked; engine.draw(); }; helpers.append(check, document.createTextNode('Show light helper')); panel.append(helpers);
    attachReset(check, 'Show light helper', 'off', () => { check.checked = entry.helper.visible = false; engine.draw(); });
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = entry.lightType === 'sun' ? 'Position and aim define the sun direction. Distance does not reduce its brightness.' : 'Move the light with the gizmo. Higher falloff reduces illumination with distance.'; panel.append(hint);
  }
}
function refreshSettings() {
  for (const [key, control] of controls) control.update(engine.params[key]);
  $('ink').value = engine.params.ink; $('paper-color').value = engine.params.paper; $('outline-color').value = engine.params.outlineColor;
  $('cross').checked = engine.params.cross; $('outline').checked = engine.params.outline; $('quality').value = engine.params.quality;
  controls.get('crossThreshold').input.disabled = !engine.params.cross; controls.get('outlineWidth').input.disabled = !engine.params.outline;
  updatePresetStatus();
}
async function loadFiles(files) {
  if (importBusy) { toast('Please wait for the current import to finish.'); return; }
  importBusy = true; $('import').disabled = true;
  for (const file of files) {
    $('loading').hidden = false; $('loading').textContent = `Reading ${file.name}…`;
    try { await engine.load(file); tab('selection'); toast(`Imported ${file.name}`); } catch (e) { toast(`Could not import ${file.name}: ${e.message}`); }
  }
  importBusy = false; $('import').disabled = false; $('loading').hidden = true; $('file').value = '';
}
function transformMode(mode) { engine.setTransform(mode); document.querySelectorAll('[data-transform]').forEach(button => button.classList.toggle('active', button.dataset.transform === mode)); }
function viewMode(mode) { engine.setMode(mode); document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === mode)); }

async function init() {
  try { engine = new EtchEngine($('viewport'), $('paper')); } catch (e) { $('loading').textContent = 'WebGL 2 is required. Open this app in an updated browser with graphics acceleration enabled.'; toast(e.message); return; }
  try { savedPresets = readSavedPresets(localStorage); } catch (e) { toast(e.message || 'Browser storage is unavailable.'); }
  populatePresets();
  for (const [parent, key, name, min, max, step, suffix] of definitions) controls.set(key, range($(parent), key, name, min, max, step, suffix, engine.params[key], value => applyHatchPatch({ [key]: value }), defaults[key]));
  engine.addEventListener('scene', sceneList);
  engine.addEventListener('selection', () => { sceneList(); selectionPanel(); });
  engine.addEventListener('transform', syncTransform);
  engine.addEventListener('error', e => { toast(e.detail); $('status').textContent = 'Render failed'; $('loading').hidden = true; });
  engine.addEventListener('rendering', () => { $('status').textContent = 'Tracing surface lines…'; });
  engine.addEventListener('rendered', e => { $('status').textContent = `${e.detail.lines.toLocaleString()} strokes · ${e.detail.width} × ${e.detail.height} · ${e.detail.ms} ms`; if (!importBusy) $('loading').hidden = true; });
  $('import').onclick = $('import-secondary').onclick = () => $('file').click(); $('file').onchange = () => loadFiles([...$('file').files]);
  $('add-sun').onclick = () => { engine.select(engine.addLight('sun')); tab('selection'); };
  $('add-point').onclick = () => { engine.select(engine.addLight('point')); tab('selection'); };
  $('delete').onclick = () => engine.remove(); $('frame').onclick = () => engine.frame(); $('reset-camera').onclick = () => engine.resetCamera();
  $('grid').onchange = () => { engine.grid.visible = $('grid').checked; engine.draw(); };
  $('space').onchange = () => { engine.transform.setSpace($('space').value); engine.draw(); };
  attachReset($('grid'), 'Grid', 'off', () => { $('grid').checked = engine.grid.visible = false; engine.draw(); });
  attachReset($('space'), 'Transform space', 'World', () => { $('space').value = 'world'; engine.transform.setSpace('world'); engine.draw(); });
  const viewModes = document.querySelector('.view-modes'), transformModes = document.querySelector('.transform-modes');
  viewModes.after(resetButton('View mode', 'Hatching', () => viewMode('hatch')));
  transformModes.after(resetButton('Transform mode', 'Move', () => transformMode('translate')));
  document.querySelectorAll('[data-transform]').forEach(button => button.onclick = () => transformMode(button.dataset.transform));
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => viewMode(button.dataset.view));
  document.querySelectorAll('[data-demo]').forEach(button => button.onclick = async () => { try { const entry = await engine.demo(button.dataset.demo); engine.select(entry); engine.frame(entry); tab('selection'); } catch (e) { toast(e.message); } });
  $('hatch-tab').onclick = () => tab('hatch'); $('selection-tab').onclick = () => tab('selection');
  for (const [id, key, name] of [['ink', 'ink', 'Line color'], ['paper-color', 'paper', 'Paper'], ['outline-color', 'outlineColor', 'Outline color']]) {
    $(id).oninput = () => applyHatchPatch({ [key]: $(id).value }); attachReset($(id), name, defaults[key], () => applyHatchPatch({ [key]: defaults[key] }));
  }
  for (const [id, key, name] of [['cross', 'cross', 'Cross-hatching'], ['outline', 'outline', 'Outer outline']]) {
    $(id).onchange = () => applyHatchPatch({ [key]: $(id).checked }); attachReset($(id), name, defaults[key] ? 'on' : 'off', () => applyHatchPatch({ [key]: defaults[key] }));
  }
  $('quality').onchange = () => applyHatchPatch({ quality: +$('quality').value });
  attachReset($('quality'), 'Render detail', 'Balanced · 1100 px', () => applyHatchPatch({ quality: defaults.quality }));
  $('reset-settings').onclick = () => loadPreset('engraving');
  $('preset').onchange = () => loadPreset($('preset').value);
  $('load-preset').onclick = () => loadPreset($('preset').value);
  attachReset($('preset'), 'Preset', 'Engraving', () => loadPreset('engraving'));
  $('save-preset').onclick = () => { $('preset-name').value = selectedPresetId.startsWith('saved-') ? currentPreset()?.name || '' : ''; $('save-preset-dialog').showModal(); $('preset-name').focus(); };
  $('cancel-save-preset').onclick = () => $('save-preset-dialog').close();
  $('save-preset-form').onsubmit = e => {
    e.preventDefault();
    try {
      const result = saveNamedPreset(localStorage, $('preset-name').value, engine.params); savedPresets = result.presets; selectedPresetId = result.preset.id;
      populatePresets(); updatePresetStatus(); $('save-preset-dialog').close(); toast(`${result.replaced ? 'Updated' : 'Saved'} preset “${result.preset.name}”.`);
    } catch (error) { toast(error.name === 'QuotaExceededError' ? 'Browser storage is full. The preset was not saved.' : error.message || 'This browser could not save the preset.'); }
  };
  window.addEventListener('storage', e => { if (e.key === PRESET_STORAGE_KEY || e.key === null) { try { savedPresets = readSavedPresets(localStorage); populatePresets(); updatePresetStatus(); } catch (error) { toast(error.message); } } });
  let exportURL;
  $('export').onclick = () => { try { const canvas = engine.exportPNG(); canvas.toBlob(blob => { if (!blob) return toast('The image could not be exported.'); if (exportURL) URL.revokeObjectURL(exportURL); exportURL = URL.createObjectURL(blob); $('export-image').src = exportURL; $('download-image').href = exportURL; $('export-size').textContent = `${canvas.width} × ${canvas.height} px`; $('export-dialog').showModal(); }, 'image/png'); } catch (e) { toast(e.message); } };
  $('close-export').onclick = () => $('export-dialog').close();
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.target.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
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
  // Browser-agent access mirrors the existing controls and is optional by support.
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'read_etch_scene', title: 'Read scene', description: 'Read the current models, lights and global hatching settings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ models: engine.models.map(x => ({ id: x.id, name: x.name, triangles: x.triangles })), lights: engine.lights.map(x => ({ id: x.id, type: x.lightType, intensity: x.intensity })), settings: { ...engine.params } }) },
      { name: 'configure_hatch_spacing', title: 'Set hatch spacing', description: 'Set global shadow and light line spacing in screen pixels, using the same controls as the inspector.', inputSchema: { type: 'object', properties: { shadow: { type: 'number', minimum: 2, maximum: 16 }, light: { type: 'number', minimum: 6, maximum: 60 } }, required: ['shadow', 'light'], additionalProperties: false }, execute: input => { if (!input || !Number.isFinite(input.shadow) || !Number.isFinite(input.light) || input.shadow < 2 || input.shadow > 16 || input.light < 6 || input.light > 60 || input.shadow > input.light) throw new Error('Enter valid spacing with shadow no greater than light.'); engine.setParams({ spacing: input.shadow, lightSpacing: input.light }); refreshSettings(); return { shadow: engine.params.spacing, light: engine.params.lightSpacing }; } }
    ];
    for (const tool of tools) try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
}
init();
