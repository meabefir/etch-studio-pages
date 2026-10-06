import {toonDefaults,validateRamp,rampColor,stopInterpolation,hex} from './toon.js?v=stop-blending-1';
import {builtinRampPresets,rampSettings,rampSettingsMatch,readSavedRampPresets,saveNamedRampPreset} from './toon-presets.js?v=stop-blending-1';
import {attachFileControls,importSharedPreset,presetImportMessage} from './share-files.js?v=sigil-references-1';

export class ToonEditor{
  constructor(panel,{getStyle,onChange,onScope,resetButton,getOverride=()=>null,onCustom=()=>{},onMessage=()=>{},getStorage=()=>localStorage}){
    this.panel=panel;this.getStyle=getStyle;this.getOverride=getOverride;this.onChange=onChange;this.handles=new Map();
    panel.innerHTML=`<h2 class="depth-title">Toon shading</h2><div class="hatch-scope"><label for="toon-scope">Toon setup</label><select id="toon-scope"></select><div class="toon-own-setting" hidden><label class="checkbox-row"><input id="toon-own" type="checkbox"> Use separate toon setup</label></div><p class="hint">Independent of hatching presets. Saved with scenes. Editing a mesh creates its own toon setup.</p></div><div class="setting-section"><label class="toon-field">Rendering style<select aria-label="Rendering style"><option value="hatch">Hatching only</option><option value="toon">Toon only</option><option value="combined">Toon + hatching</option></select></label><p class="hint">Surface normals and the average light direction set the ramp value. Outlines keep their existing controls.</p></div><div class="setting-section"><h2>Color ramp</h2><label class="toon-field">Ramp blending<select aria-label="Ramp blending"><option value="linear">Linear</option><option value="constant">Constant</option></select></label><div class="toon-ramp"><div class="toon-ramp-track" aria-label="Color ramp"></div><div class="toon-ramp-labels"><span>Shadow · 0</span><span>Light · 1</span></div></div><p class="hint">Drag a color stop left or right. Select a stop to edit its color, position and transition to the next color. Arrow keys move the selected stop.</p><div class="row toon-ramp-actions"><button class="button subtle" data-ramp="add">Add color</button><button class="button subtle" data-ramp="remove">Remove color</button></div><p class="toon-stop-name"></p><label class="toon-field">Stop position<input type="number" min="0" max="1" step=".01" aria-label="Stop position"></label><label class="inline-color">Stop color<input type="color" aria-label="Stop color"></label><label class="toon-field">Stop interpolation<select aria-label="Stop interpolation" aria-describedby="toon-interpolation-hint"><option value="inherit">Use ramp blending</option><option value="linear">Linear</option><option value="constant">Constant</option></select></label><p class="hint" id="toon-interpolation-hint"></p><button class="button subtle full" data-ramp="reset">Reset color ramp</button></div>`;
    const q=selector=>panel.querySelector(selector);this.q=q;
    this.setupRampPresets(resetButton,onMessage,getStorage);
    q('#toon-scope').onchange=e=>onScope(e.target.value);
    q('#toon-own').onchange=e=>onCustom(e.target.checked);q('.toon-own-setting').append(resetButton('Separate toon setup','off',()=>onCustom(false)));
    q('#toon-scope').after(resetButton('Toon setup','Global',()=>onScope('global')));
    for(const [label,key]of [['Rendering style','shadeMode'],['Ramp blending','toonBlend']]){const input=q(`[aria-label="${label}"]`);input.onchange=()=>onChange({[key]:input.value});input.before(resetButton(label,toonDefaults[key],()=>onChange({[key]:toonDefaults[key]})));}
    const position=q('[aria-label="Stop position"]'),color=q('[aria-label="Stop color"]');
    const move=()=>{if(position.value!==''&&Number.isFinite(+position.value)&&+position.value>=0&&+position.value<=1)this.updateStop({position:+position.value});};position.oninput=move;position.onchange=()=>{move();this.refresh();};color.oninput=()=>this.updateStop({color:color.value});
    for(const [input,label,key,fallback]of [[position,'Stop position','position',.5],[color,'Stop color','color','#ffffff']]){const reset=resetButton(label,'Initial ramp',()=>this.updateStop({[key]:toonDefaults.toonRamp.find(s=>s.id===this.selected)?.[key]??fallback}));input.type==='color'?input.after(reset):input.before(reset);}
    const interpolation=q('[aria-label="Stop interpolation"]');interpolation.onchange=()=>this.updateStop({interpolation:interpolation.value});
    this.interpolationReset=resetButton('Stop interpolation','Use ramp blending',()=>this.updateStop({interpolation:'inherit'}));interpolation.before(this.interpolationReset);
    q('[data-ramp="reset"]').onclick=()=>onChange({toonRamp:validateRamp(toonDefaults.toonRamp)});
    q('[data-ramp="add"]').onclick=()=>{const stops=this.getStyle().toonRamp;let from=0,to=stops[0].position;for(let i=0;i<stops.length;i++){const a=stops[i].position,b=stops[i+1]?.position??1;if(b-a>to-from){from=a;to=b;}}const position=(from+to)/2,id=`stop-${crypto.randomUUID()}`,left=stops.filter(s=>s.position<=position).at(-1);this.selected=id;onChange({toonRamp:validateRamp([...stops,{id,position,color:hex(rampColor(stops,position,this.getStyle().toonBlend)),...(left?.interpolation?{interpolation:left.interpolation}:{})}])});};
    q('[data-ramp="remove"]').onclick=()=>{const stops=this.getStyle().toonRamp;if(stops.length<=2)return;onChange({toonRamp:stops.filter(s=>s.id!==this.selected)});};
    const track=q('.toon-ramp-track');
    track.onpointermove=e=>{if(!this.drag||this.drag.id!==e.pointerId)return;const rect=track.getBoundingClientRect();this.updateStop({position:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))});};
    const end=e=>{if(this.drag?.id===e.pointerId){this.drag=null;this.refresh();}};for(const event of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(event,end);
    this.refresh();
  }
  setupRampPresets(resetButton,onMessage,getStorage){
    this.savedRamps=[];this.selectedRampPreset='studio';this.getStorage=getStorage;
    try{this.savedRamps=readSavedRampPresets(getStorage());}catch(error){onMessage(error.message||'Browser storage is unavailable.');}
    const block=document.createElement('div');block.className='preset-block toon-ramp-presets';
    block.innerHTML=`<label class="toon-field" for="toon-ramp-preset">Color ramp preset<select id="toon-ramp-preset" aria-label="Color ramp preset"></select></label><div class="preset-actions"><button class="button subtle" data-ramp-preset="load">Load ramp</button><button class="button" data-ramp-preset="save">Save ramp</button></div><p class="hint" data-ramp-preset="status" aria-live="polite"></p>`;
    this.q('.toon-ramp').closest('.setting-section').querySelector('h2').after(block);
    const select=this.q('#toon-ramp-preset');select.before(resetButton('Color ramp preset','Studio',()=>this.loadRampPreset('studio')));
    select.onchange=()=>this.loadRampPreset(select.value);
    this.q('[data-ramp-preset="load"]').onclick=()=>this.loadRampPreset(select.value);
    attachFileControls(block,{type:'color-ramp',getName:()=>[...builtinRampPresets,...this.savedRamps].find(p=>p.id===this.selectedRampPreset)?.name||'Color ramp',getData:this.getStyle,onMessage,onImport:doc=>{
      const result=importSharedPreset(getStorage(),doc,this.savedRamps);this.savedRamps=result.presets;this.selectedRampPreset=result.preset.id;this.populateRampPresets();this.loadRampPreset(result.preset.id);onMessage(presetImportMessage(result,'color ramp'));
    }});
    const dialog=document.createElement('dialog');dialog.id='save-ramp-dialog';dialog.className='form-dialog';dialog.setAttribute('aria-labelledby','save-ramp-title');
    dialog.innerHTML=`<form><h2 id="save-ramp-title">Save color ramp preset</h2><label for="ramp-preset-name">Preset name</label><input id="ramp-preset-name" type="text" maxlength="60" required autocomplete="off" placeholder="e.g. Moss and copper"><p class="hint">Saves colors, stop positions, ramp blending and each stop’s interpolation in this browser. Saving with an existing name updates that ramp.</p><p class="inline-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-ramp-preset="cancel">Cancel</button><button type="submit" class="button accent">Save</button></div></form>`;
    document.body.append(dialog);this.rampDialog=dialog;
    const input=dialog.querySelector('input'),error=dialog.querySelector('.inline-error');
    this.q('[data-ramp-preset="save"]').onclick=()=>{input.value=this.savedRamps.find(p=>p.id===this.selectedRampPreset)?.name||'';error.hidden=true;dialog.showModal();input.focus();};
    dialog.querySelector('[data-ramp-preset="cancel"]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      try{
        const result=saveNamedRampPreset(getStorage(),input.value,this.getStyle());this.savedRamps=result.presets;this.selectedRampPreset=result.preset.id;
        this.populateRampPresets();this.refreshRampPreset(this.getStyle());dialog.close();onMessage(`${result.replaced?'Updated':'Saved'} color ramp “${result.preset.name}”.`);
      }catch(problem){error.textContent=problem.name==='QuotaExceededError'?'Browser storage is full. The color ramp was not saved.':problem.message||'This browser could not save the color ramp.';error.hidden=false;}
    };
    this.populateRampPresets();
  }
  populateRampPresets(){
    const select=this.q('#toon-ramp-preset');select.replaceChildren();
    for(const [label,presets]of [['Built-in ramps',builtinRampPresets],['Saved ramps',this.savedRamps]]){
      if(!presets.length)continue;const group=document.createElement('optgroup');group.label=label;
      for(const preset of presets)group.append(new Option(preset.name,preset.id));select.append(group);
    }
    select.value=this.selectedRampPreset;
  }
  loadRampPreset(id){
    const preset=[...builtinRampPresets,...this.savedRamps].find(p=>p.id===id);if(!preset)return;
    this.selectedRampPreset=id;this.selected=preset.settings.toonRamp[0].id;this.onChange(rampSettings(preset.settings));this.refresh();
  }
  refreshRampPreset(value){
    const presets=[...builtinRampPresets,...this.savedRamps];let preset=presets.find(p=>p.id===this.selectedRampPreset);
    if(!preset||!rampSettingsMatch(value,preset.settings)){const match=presets.find(p=>rampSettingsMatch(value,p.settings));if(match){preset=match;this.selectedRampPreset=match.id;}}
    const modified=!preset||!rampSettingsMatch(value,preset.settings),status=this.q('[data-ramp-preset="status"]');
    this.q('#toon-ramp-preset').value=this.selectedRampPreset;
    status.textContent=modified?'Modified · save to keep this ramp':this.selectedRampPreset.startsWith('ramp-')?'Saved in this browser':'Built-in color ramp';status.classList.toggle('modified',modified);
  }
  updateStop(patch){this.onChange({toonRamp:validateRamp(this.getStyle().toonRamp.map(s=>s.id===this.selected?{...s,...patch}:s))});}
  refresh(value=this.getStyle()){
    const override=this.getOverride();this.q('.toon-own-setting').hidden=!override;this.q('#toon-own').checked=!!override?.custom;
    const stops=value.toonRamp;if(!stops.some(s=>s.id===this.selected))this.selected=stops[0].id;
    this.q('[aria-label="Rendering style"]').value=value.shadeMode;this.q('[aria-label="Ramp blending"]').value=value.toonBlend;
    const track=this.q('.toon-ramp-track'),gradient=[];
    gradient.push(`${stops[0].color} 0%`,`${stops[0].color} ${stops[0].position*100}%`);
    for(let i=1;i<stops.length;i++){const left=stops[i-1],right=stops[i];if(stopInterpolation(left,value.toonBlend)==='constant')gradient.push(`${left.color} ${right.position*100}%`);gradient.push(`${right.color} ${right.position*100}%`);}
    gradient.push(`${stops.at(-1).color} 100%`);
    track.style.background=`linear-gradient(to right,${gradient.join(',')})`;
    for(const [id,handle]of this.handles)if(!stops.some(s=>s.id===id)){handle.remove();this.handles.delete(id);}
    stops.forEach((stop,index)=>{let handle=this.handles.get(stop.id);if(!handle){handle=document.createElement('button');handle.type='button';handle.className='toon-ramp-stop';track.append(handle);this.handles.set(stop.id,handle);
        handle.onclick=()=>{this.selected=stop.id;this.refresh();};handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.selected=stop.id;this.drag={id:e.pointerId};handle.setPointerCapture(e.pointerId);this.refresh();};
        handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();this.selected=stop.id;const current=this.getStyle().toonRamp.find(s=>s.id===stop.id),amount=e.shiftKey?.1:.01;this.updateStop({position:e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,current.position+(e.key==='ArrowRight'?amount:-amount)))});};
      }handle.style.left=`${stop.position*100}%`;handle.style.backgroundColor=stop.color;handle.setAttribute('aria-label',`Color stop ${index+1}`);handle.setAttribute('aria-pressed',String(stop.id===this.selected));handle.title=`${stop.position.toFixed(3)} · ${stop.color}`;});
    const selected=stops.find(s=>s.id===this.selected);this.q('.toon-stop-name').textContent=`Stop ${stops.indexOf(selected)+1} of ${stops.length}`;
    for(const [label,key]of [['Stop position','position'],['Stop color','color']]){const input=this.q(`[aria-label="${label}"]`);if(input!==document.activeElement)input.value=selected[key];}
    const interpolation=this.q('[aria-label="Stop interpolation"]'),last=selected===stops.at(-1);interpolation.value=selected.interpolation??'inherit';interpolation.disabled=last;this.interpolationReset.disabled=last;
    this.q('#toon-interpolation-hint').textContent=last?'The last stop has no transition to its right. Select an earlier stop to change a region.':'Controls the transition from this color to the next color on its right. Use ramp blending follows the default above.';
    this.q('[data-ramp="remove"]').disabled=stops.length<=2;this.q('[data-ramp="add"]').disabled=stops.length>=128;
    this.refreshRampPreset(value);
  }
}
