import {outputDefaults,outputMaxDimension,validateOutput} from './output-settings.js';
import {fitOutput,projectedBounds} from './output-frame.js';

export class OutputEditor{
  constructor(engine){
    this.engine=engine;this.dialog=document.getElementById('export-dialog');this.fields=new Map();this.version=0;
    this.dialog.innerHTML=`<div class="export-title"><h2 id="export-title">Image output</h2><button id="close-export" aria-label="Close render preview">✕</button></div><p class="output-camera-note"></p><div class="output-workspace"><aside class="output-controls"><h3>Image size</h3><label class="output-select">Resolution<select aria-label="Output resolution"><option value="1024">Draft · 1024 px</option><option value="2200">Standard · 2200 px</option><option value="4096">Large · 4096 px</option><option value="10000">Maximum · 10000 px</option><option value="custom">Custom dimensions</option></select></label><div class="output-dimensions"></div><p class="hint">Up to 10000 × 10000 pixels. Size is independent of the workspace preview.</p><h3>Image framing</h3><div class="row output-fit"><button class="button subtle" data-fit="all">Fit visible models</button><button class="button subtle" data-fit="selected">Fit selected</button></div><div class="output-framing"></div><button class="button subtle full" data-action="reset-frame">Reset framing</button><p class="hint">Drag the image to pan. Scroll to zoom. Framing preserves the camera pose, field of view, projection and lighting.</p><label class="output-select">Stroke sizing<select aria-label="Output stroke sizing"><option value="view">Match camera view</option><option value="pixels">Exact output pixels</option></select></label><p class="hint output-stroke-hint"></p></aside><section class="output-preview"><div class="output-image-frame" aria-label="Image framing preview"><img id="export-image" alt="Rendered hatching illustration" draggable="false"></div><p class="hint">Drag to pan · Scroll to zoom</p></section></div><div class="export-footer"><span id="export-size" role="status"></span><div class="output-actions"><button class="button subtle" id="render-output">Render full image</button><button class="button subtle" id="cancel-output" hidden>Cancel render</button><button id="download-image" class="button accent">Download PNG</button></div></div>`;
    this.q('#close-export').onclick=()=>this.dialog.close();this.dialog.addEventListener('close',()=>this.close());
    this.q('[aria-label="Output resolution"]').onchange=e=>{if(e.target.value==='custom')return;const edge=+e.target.value,ratio=this.settings.width/this.settings.height;this.update({width:Math.max(64,Math.round(ratio>=1?edge:edge*ratio)),height:Math.max(64,Math.round(ratio>=1?edge/ratio:edge))});};
    this.q('[aria-label="Output stroke sizing"]').onchange=e=>this.update({strokes:e.target.value});
    this.q('[data-fit="all"]').onclick=()=>this.fit(this.engine.models);this.q('[data-fit="selected"]').onclick=()=>this.fit([this.engine.selected]);
    this.q('[data-action="reset-frame"]').onclick=()=>this.update({zoom:1,x:0,y:0,margin:outputDefaults.margin});
    this.q('#render-output').onclick=()=>this.render(false);this.q('#download-image').onclick=()=>this.download();this.q('#cancel-output').onclick=()=>this.queue();
    const frame=this.q('.output-image-frame');
    frame.addEventListener('pointerdown',e=>{if(e.button!==0||!this.q('#export-image').src||this.fullRendering)return;e.preventDefault();const r=frame.getBoundingClientRect();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,settings:{...this.settings},height:r.height};this.abort?.abort();clearTimeout(this.timer);frame.setPointerCapture(e.pointerId);frame.classList.add('dragging');});
    frame.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y,old=this.drag.settings;this.settings={...old,x:old.x-2*dx/(this.drag.height*old.zoom),y:old.y+2*dy/(this.drag.height*old.zoom)};this.sync();this.q('#export-image').style.transform=`translate(${dx}px,${dy}px)`;this.disableDownload();});
    const end=()=>{if(!this.drag)return;const id=this.drag.id;this.drag=null;if(frame.hasPointerCapture(id))frame.releasePointerCapture(id);frame.classList.remove('dragging');this.q('#export-image').style.transform='';this.update(this.settings);};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(event,end);
    frame.addEventListener('wheel',e=>{e.preventDefault();if(this.fullRendering||this.drag)return;const r=frame.getBoundingClientRect(),x=(2*(e.clientX-r.left)/r.width-1)*(r.width/r.height),y=1-2*(e.clientY-r.top)/r.height,zoom=Math.max(.001,Math.min(16,this.settings.zoom*Math.exp(-e.deltaY*.0015)));this.update({zoom,x:this.settings.x+x*(1/this.settings.zoom-1/zoom),y:this.settings.y+y*(1/this.settings.zoom-1/zoom)});},{passive:false});
  }
  q(selector){return this.dialog.querySelector(selector);}
  field(parent,key,name,{min,max,step=1,multiplier=1}={}){
    const row=document.createElement('div');row.className='output-field';const label=document.createElement('label'),input=document.createElement('input'),reset=document.createElement('button');label.textContent=name;input.type='number';input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',name);reset.type='button';reset.className='property-reset';reset.textContent='↺';reset.setAttribute('aria-label',`Reset ${name} to default`);label.append(input);row.append(label,reset);parent.append(row);this.fields.set(key,{input,multiplier});input.oninput=()=>this.commit();input.onchange=()=>this.commit();reset.onclick=()=>this.update({[key]:this.defaults[key]});
  }
  open(){
    this.close();this.capture=this.engine.captureOutputView();const a=this.capture.camera.aspect,edge=2200;
    this.defaults={...outputDefaults,width:Math.max(64,Math.round(a>=1?edge:edge*a)),height:Math.max(64,Math.round(a>=1?edge/a:edge))};this.settings=validateOutput(this.engine.outputSettings||this.defaults);
    this.validSettings=true;this.fields.clear();this.q('.output-dimensions').replaceChildren();this.q('.output-framing').replaceChildren();
    for(const [key,name]of [['width','Image width'],['height','Image height']])this.field(this.q('.output-dimensions'),key,name,{min:64,max:outputMaxDimension});
    for(const [key,name,min,max,step]of [['zoom','Image scale (%)',.1,1600,.5],['x','Frame center X (%)',-1000000,1000000,1],['y','Frame center Y (%)',-1000000,1000000,1],['margin','Fit margin (%)',0,40,1]])this.field(this.q('.output-framing'),key,name,{min,max,step,multiplier:100});
    this.q('.output-camera-note').textContent=`Using ${this.capture.name} · ${this.capture.lens.projection} · camera view preserved`;
    this.q('[data-fit="selected"]').disabled=!['model','sigil'].includes(this.engine.selected?.type)||!this.engine.selected.visible;
    this.q('#export-image').removeAttribute('src');this.sync();this.disableDownload();this.dialog.showModal();this.queue();
  }
  commit(){const patch={};for(const [key,{input,multiplier}]of this.fields)patch[key]=input.value===''?NaN:+input.value/multiplier;this.update(patch);}
  update(patch){try{this.settings=validateOutput({...this.settings,...patch});this.validSettings=true;this.engine.outputSettings={...this.settings};this.sync();this.disableDownload();this.queue();}catch(error){clearTimeout(this.timer);this.abort?.abort();this.version++;this.fullRendering=false;this.validSettings=false;this.disableDownload();this.status(error.message,true);}}
  sync(){
    for(const [key,{input,multiplier}]of this.fields)if(input!==document.activeElement)input.value=Number((this.settings[key]*multiplier).toFixed(3));
    const edge=Math.max(this.settings.width,this.settings.height);this.q('[aria-label="Output resolution"]').value=[1024,2200,4096,10000].includes(edge)?String(edge):'custom';this.q('[aria-label="Output stroke sizing"]').value=this.settings.strokes;
    this.q('.output-image-frame').style.setProperty('--output-aspect',String(this.settings.width/this.settings.height));this.q('.output-image-frame').style.aspectRatio=`${this.settings.width}/${this.settings.height}`;
    this.q('.output-stroke-hint').textContent=this.settings.strokes==='view'?'Spacing and thickness scale with the camera image and framing. Hatch direction and lighting stay tied to the camera.':'Spacing and thickness use the exact pixel values from Hatching at the chosen output resolution, including 1-pixel spacing.';
  }
  fit(entries){try{this.engine.scene.updateMatrixWorld(true);this.update(fitOutput(projectedBounds(entries.filter(Boolean),this.capture),this.settings));}catch(error){this.status(error.message,true);}}
  status(text,error=false){this.q('#export-size').textContent=text;this.q('#export-size').classList.toggle('inline-error',error);}
  actions(){const busy=!!this.fullRendering,disabled=!this.validSettings||busy||!!this.drag;this.q('#download-image').disabled=disabled;this.q('#download-image').textContent=busy?'Rendering…':'Download PNG';this.q('#render-output').disabled=disabled;this.q('#cancel-output').hidden=!busy;}
  disableDownload(){if(this.downloadURL){URL.revokeObjectURL(this.downloadURL);this.downloadURL=null;}this.actions();}
  async download(){
    if(!this.validSettings||this.fullRendering||this.drag)return;
    const url=this.downloadURL||await this.render(false);if(!url||url!==this.downloadURL||!this.dialog.open)return;
    const link=document.createElement('a');link.href=url;link.download=`etch-${this.settings.width}x${this.settings.height}.png`;link.hidden=true;this.dialog.append(link);link.click();link.remove();
  }
  queue(){clearTimeout(this.timer);this.abort?.abort();this.version++;this.fullRendering=false;this.actions();this.status(`Output ${this.settings.width} × ${this.settings.height} px · updating preview…`);this.timer=setTimeout(()=>this.render(true),200);}
  async render(preview){
    if(!this.validSettings||this.drag)return;clearTimeout(this.timer);this.abort?.abort();this.abort=new AbortController();const id=++this.version,signal=this.abort.signal;this.fullRendering=!preview;this.actions();this.status(preview?'Tracing framing preview…':`Rendering ${this.settings.width} × ${this.settings.height} px…`);
    try{
      const result=await this.engine.exportPNG(this.capture,this.settings,{preview,signal,onProgress:text=>{if(!preview&&id===this.version&&!signal.aborted&&this.dialog.open)this.status(text);}});if(signal.aborted||id!==this.version||!this.dialog.open)return;
      if(!preview)this.status(`Encoding ${this.settings.width} × ${this.settings.height} PNG…`);const blob=await new Promise(resolve=>result.canvas.toBlob(resolve,'image/png'));if(signal.aborted||id!==this.version||!this.dialog.open)return;if(!blob)throw new Error('The image could not be encoded as PNG.');
      if(this.previewURL)URL.revokeObjectURL(this.previewURL);this.previewURL=URL.createObjectURL(blob);this.q('#export-image').src=this.previewURL;
      this.status(`${preview?'Preview':'PNG ready'} · ${result.canvas.width} × ${result.canvas.height} px${preview?` · Output ${this.settings.width} × ${this.settings.height} px`:''}${result.lines?` · ${result.lines.toLocaleString()} strokes`:''}`);
      if(!preview){this.disableDownload();this.downloadURL=URL.createObjectURL(blob);return this.downloadURL;}
    }catch(error){if(error.name!=='AbortError'&&id===this.version)this.status(error.message,true);}
    finally{if(id===this.version){this.fullRendering=false;this.actions();}}
  }
  close(){clearTimeout(this.timer);this.abort?.abort();this.version++;this.fullRendering=false;this.drag=null;this.disableDownload();if(this.previewURL){URL.revokeObjectURL(this.previewURL);this.previewURL=null;}}
}
