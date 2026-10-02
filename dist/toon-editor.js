import {toonDefaults,validateRamp,rampColor,hex} from './toon.js';

export class ToonEditor{
  constructor(panel,{getStyle,onChange,onScope,resetButton}){
    this.panel=panel;this.getStyle=getStyle;this.onChange=onChange;this.handles=new Map();
    panel.innerHTML=`<h2 class="depth-title">Toon shading</h2><div class="hatch-scope"><label for="toon-scope">Toon setup</label><select id="toon-scope"></select><p class="hint">Global or per-mesh style. Saved with presets and scenes.</p></div><div class="setting-section"><label class="toon-field">Rendering style<select aria-label="Rendering style"><option value="hatch">Hatching only</option><option value="toon">Toon only</option><option value="combined">Toon + hatching</option></select></label><p class="hint">Surface normals and the average light direction set the ramp value. Outlines keep their existing controls.</p></div><div class="setting-section"><h2>Color ramp</h2><label class="toon-field">Ramp blending<select aria-label="Ramp blending"><option value="linear">Linear</option><option value="constant">Constant</option></select></label><div class="toon-ramp"><div class="toon-ramp-track" aria-label="Color ramp"></div><div class="toon-ramp-labels"><span>Shadow · 0</span><span>Light · 1</span></div></div><p class="hint">Drag a color stop left or right. Select a stop to edit its color and position. Arrow keys move the selected stop.</p><div class="row toon-ramp-actions"><button class="button subtle" data-ramp="add">Add color</button><button class="button subtle" data-ramp="remove">Remove color</button></div><p class="toon-stop-name"></p><label class="toon-field">Stop position<input type="number" min="0" max="1" step=".01" aria-label="Stop position"></label><label class="inline-color">Stop color<input type="color" aria-label="Stop color"></label><button class="button subtle full" data-ramp="reset">Reset color ramp</button></div>`;
    const q=selector=>panel.querySelector(selector);this.q=q;
    q('#toon-scope').onchange=e=>onScope(e.target.value);
    q('#toon-scope').after(resetButton('Toon setup','Global',()=>onScope('global')));
    for(const [label,key]of [['Rendering style','shadeMode'],['Ramp blending','toonBlend']]){const input=q(`[aria-label="${label}"]`);input.onchange=()=>onChange({[key]:input.value});input.before(resetButton(label,toonDefaults[key],()=>onChange({[key]:toonDefaults[key]})));}
    const position=q('[aria-label="Stop position"]'),color=q('[aria-label="Stop color"]');
    const move=()=>{if(position.value!==''&&Number.isFinite(+position.value)&&+position.value>=0&&+position.value<=1)this.updateStop({position:+position.value});};position.oninput=move;position.onchange=()=>{move();this.refresh();};color.oninput=()=>this.updateStop({color:color.value});
    for(const [input,label,key,fallback]of [[position,'Stop position','position',.5],[color,'Stop color','color','#ffffff']]){const reset=resetButton(label,'Initial ramp',()=>this.updateStop({[key]:toonDefaults.toonRamp.find(s=>s.id===this.selected)?.[key]??fallback}));input.type==='color'?input.after(reset):input.before(reset);}
    q('[data-ramp="reset"]').onclick=()=>onChange({toonRamp:validateRamp(toonDefaults.toonRamp)});
    q('[data-ramp="add"]').onclick=()=>{const stops=this.getStyle().toonRamp;let from=0,to=stops[0].position;for(let i=0;i<stops.length;i++){const a=stops[i].position,b=stops[i+1]?.position??1;if(b-a>to-from){from=a;to=b;}}const position=(from+to)/2,id=`stop-${crypto.randomUUID()}`;this.selected=id;onChange({toonRamp:validateRamp([...stops,{id,position,color:hex(rampColor(stops,position,this.getStyle().toonBlend))}])});};
    q('[data-ramp="remove"]').onclick=()=>{const stops=this.getStyle().toonRamp;if(stops.length<=2)return;onChange({toonRamp:stops.filter(s=>s.id!==this.selected)});};
    const track=q('.toon-ramp-track');
    track.onpointermove=e=>{if(!this.drag||this.drag.id!==e.pointerId)return;const rect=track.getBoundingClientRect();this.updateStop({position:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))});};
    const end=e=>{if(this.drag?.id===e.pointerId){this.drag=null;this.refresh();}};for(const event of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(event,end);
    this.refresh();
  }
  updateStop(patch){this.onChange({toonRamp:validateRamp(this.getStyle().toonRamp.map(s=>s.id===this.selected?{...s,...patch}:s))});}
  refresh(value=this.getStyle()){
    const stops=value.toonRamp;if(!stops.some(s=>s.id===this.selected))this.selected=stops[0].id;
    this.q('[aria-label="Rendering style"]').value=value.shadeMode;this.q('[aria-label="Ramp blending"]').value=value.toonBlend;
    const track=this.q('.toon-ramp-track'),gradient=[];
    if(value.toonBlend==='linear')for(const stop of stops)gradient.push(`${stop.color} ${stop.position*100}%`);
    else{gradient.push(`${stops[0].color} 0%`);for(let i=1;i<stops.length;i++)gradient.push(`${stops[i-1].color} ${stops[i].position*100}%`,`${stops[i].color} ${stops[i].position*100}%`);gradient.push(`${stops.at(-1).color} 100%`);}
    track.style.background=`linear-gradient(to right,${gradient.join(',')})`;
    for(const [id,handle]of this.handles)if(!stops.some(s=>s.id===id)){handle.remove();this.handles.delete(id);}
    stops.forEach((stop,index)=>{let handle=this.handles.get(stop.id);if(!handle){handle=document.createElement('button');handle.type='button';handle.className='toon-ramp-stop';track.append(handle);this.handles.set(stop.id,handle);
        handle.onclick=()=>{this.selected=stop.id;this.refresh();};handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.selected=stop.id;this.drag={id:e.pointerId};handle.setPointerCapture(e.pointerId);this.refresh();};
        handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();this.selected=stop.id;const current=this.getStyle().toonRamp.find(s=>s.id===stop.id),amount=e.shiftKey?.1:.01;this.updateStop({position:e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,current.position+(e.key==='ArrowRight'?amount:-amount)))});};
      }handle.style.left=`${stop.position*100}%`;handle.style.backgroundColor=stop.color;handle.setAttribute('aria-label',`Color stop ${index+1}`);handle.setAttribute('aria-pressed',String(stop.id===this.selected));handle.title=`${stop.position.toFixed(3)} · ${stop.color}`;});
    const selected=stops.find(s=>s.id===this.selected);this.q('.toon-stop-name').textContent=`Stop ${stops.indexOf(selected)+1} of ${stops.length}`;
    for(const [label,key]of [['Stop position','position'],['Stop color','color']]){const input=this.q(`[aria-label="${label}"]`);if(input!==document.activeElement)input.value=selected[key];}
    this.q('[data-ramp="remove"]').disabled=stops.length<=2;this.q('[data-ramp="add"]').disabled=stops.length>=128;
  }
}
