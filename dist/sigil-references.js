import * as THREE from 'three';
import {referenceDefaults,MAX_REFERENCES,REFERENCE_IMAGE_SIZE} from './sigil-reference-data.js';
import {ViewPlaneDrag} from './view-drag.js';

export function referenceVisual(ref,texture=new THREE.Texture()){
  texture.colorSpace=THREE.SRGBColorSpace;
  const size=3.5/Math.max(ref.width,ref.height),geometry=new THREE.PlaneGeometry(ref.width*size,ref.height*size),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:ref.opacity,side:THREE.DoubleSide,depthWrite:false,depthTest:!ref.inFront,toneMapped:false,alphaTest:.001});
  const mesh=new THREE.Mesh(geometry,material),outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#e6c398',depthTest:false,transparent:true,opacity:.8}));outline.renderOrder=100;
  return {mesh,outline,texture,ready:!!texture.image};
}
export function updateReferenceVisual(visual,ref){
  for(const object of [visual.mesh,visual.outline]){object.position.fromArray(ref.position);object.rotation.set(...ref.rotation);object.scale.fromArray(ref.scale);object.updateMatrixWorld(true);}
  visual.mesh.visible=ref.visible&&visual.ready;visual.mesh.material.opacity=ref.opacity;visual.mesh.material.depthTest=!ref.inFront;
}
async function imageFromFile(file){
  if(file.size>32*1024*1024)throw new Error(`${file.name} is too large. Choose an image smaller than 32 MB.`);
  if(!/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))throw new Error('Choose a PNG, JPG, WebP, GIF, BMP or AVIF image.');
  const url=URL.createObjectURL(file),image=new Image();
  try{image.src=url;await image.decode();const factor=Math.min(1,REFERENCE_IMAGE_SIZE/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*factor)),height=Math.max(1,Math.round(image.naturalHeight*factor));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);return {image:canvas.toDataURL('image/png'),width,height};
  }catch{throw new Error(`${file.name} could not be read as an image.`);}finally{URL.revokeObjectURL(url);}
}
export class SigilReferenceEditor{
  constructor(editor){
    this.editor=editor;this.active=false;this.mode='translate';this.assets=new Map((editor.design.references||[]).map(ref=>[ref.id,ref.image]));this.visuals=new Map();this.selectedId=editor.design.references?.[0]?.id||null;
    this.normalGroup=new THREE.Group();this.frontScene=new THREE.Scene();editor.scene.add(this.normalGroup);
    this.createUI();this.sync();
  }
  get refs(){return this.editor.design.references||[];}
  get selected(){return this.refs.find(ref=>ref.id===this.selectedId);}
  message(text,error=false){const p=this.editor.q('.sigil-reference-status');p.textContent=text;p.classList.toggle('inline-error',error);}
  createUI(){
    const e=this.editor,left=e.q('.sigil-left'),curves=document.createElement('div');curves.id='sigil-curves-panel';curves.className='sigil-left-panel';curves.setAttribute('role','tabpanel');curves.setAttribute('aria-labelledby','sigil-curves-tab');curves.tabIndex=0;curves.append(...left.childNodes);
    const tabs=document.createElement('div');tabs.className='sigil-settings-tabs sigil-left-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Sigil objects');
    tabs.innerHTML='<button type="button" id="sigil-curves-tab" role="tab" aria-selected="true" aria-controls="sigil-curves-panel" data-left-tab="curves">Curves</button><button type="button" id="sigil-references-tab" role="tab" aria-selected="false" aria-controls="sigil-references-panel" data-left-tab="references" tabindex="-1">References</button>';
    const panel=document.createElement('div');panel.id='sigil-references-panel';panel.className='sigil-left-panel';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','sigil-references-tab');panel.tabIndex=0;
    panel.innerHTML='<h2>Reference images</h2><button type="button" class="button full" data-reference="import">Import images +</button><input type="file" aria-label="Reference image files" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" multiple hidden><p class="sigil-reference-status hint" role="status"></p><div class="sigil-reference-list"></div><div class="sigil-reference-inspector"></div><p class="hint">References are editor guides saved with the sigil and scene. Large images are resized to 2048 px.</p>';
    left.replaceChildren(tabs,curves,panel);
    const buttons=[...tabs.querySelectorAll('button')];buttons.forEach((button,index)=>{button.onclick=()=>this.setTab(button.dataset.leftTab);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?1:1-index;this.setTab(buttons[next].dataset.leftTab);buttons[next].focus();};});
    this.input=panel.querySelector('input');this.importButton=panel.querySelector('button');this.importButton.onclick=()=>{this.input.value='';this.input.click();};this.input.onchange=()=>this.importFiles([...this.input.files]);
  }
  setTab(name){const e=this.editor;e.endPointDrag();e.navigation.stop();this.active=name==='references';e.dialog.querySelectorAll('[data-left-tab]').forEach(button=>{const active=button.dataset.leftTab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;e.q('#'+button.getAttribute('aria-controls')).hidden=!active;});this.syncSelection();e.rebuildOverlay();e.updateRotationLock();}
  async importFiles(files){
    if(this.importing||this.editor.applying||!files.length)return;this.importing=true;this.importButton.disabled=true;this.editor.q('[data-action="apply"]').disabled=true;let imported=0;const errors=[];
    try{for(const file of files){if(this.editor.closed)return;if(this.refs.length>=MAX_REFERENCES){errors.push(`A sigil can contain up to ${MAX_REFERENCES} reference images.`);break;}
      this.message(`Loading ${file.name}…`);
      try{const image=await imageFromFile(file);if(this.editor.closed)return;let name=file.name.slice(0,90),suffix=2;while(this.refs.some(ref=>ref.name===name))name=`${file.name.slice(0,85)} (${suffix++})`;
        const ref={id:`reference-${crypto.randomUUID()}`,name,...image,...structuredClone(referenceDefaults)};(this.editor.design.references??=[]).push(ref);this.assets.set(ref.id,ref.image);this.selectedId=ref.id;imported++;this.sync();
      }catch(error){errors.push(error.message);}}
      if(imported)this.editor.record();this.message(`${imported?`Imported ${imported} reference image${imported===1?'':'s'}. `:''}${errors.join(' ')}`,!!errors.length);
    }finally{this.importing=false;if(!this.editor.closed){this.importButton.disabled=!!this.editor.applying;this.editor.q('[data-action="apply"]').disabled=!!this.editor.applying;this.input.value='';}}
  }
  sync(){
    for(const [id,visual]of this.visuals)if(!this.refs.some(ref=>ref.id===id)){this.disposeVisual(visual);this.visuals.delete(id);}
    for(const [index,ref]of this.refs.entries()){
      this.assets.set(ref.id,ref.image);let visual=this.visuals.get(ref.id);
      if(!visual){visual=referenceVisual(ref);this.visuals.set(ref.id,visual);this.editor.overlay.add(visual.outline);const current=visual;
        new THREE.TextureLoader().load(ref.image,texture=>{if(current.disposed||this.editor.closed){texture.dispose();return;}current.texture.dispose();current.texture=texture;current.ready=true;texture.colorSpace=THREE.SRGBColorSpace;current.mesh.material.map=texture;current.mesh.material.needsUpdate=true;const latest=this.refs.find(item=>item.id===ref.id);if(latest)updateReferenceVisual(current,latest);this.editor.draw();},undefined,()=>{if(!current.disposed&&!this.editor.closed)this.message(`Could not display ${ref.name}. Remove it and import the image again.`,true);});
      }
      const parent=ref.inFront?this.frontScene:this.normalGroup;if(visual.mesh.parent!==parent)parent.add(visual.mesh);visual.mesh.renderOrder=index+1;updateReferenceVisual(visual,ref);
    }
    if(!this.selected)this.selectedId=this.refs[0]?.id||null;this.renderList();this.inspector();this.syncSelection();this.editor.draw();
  }
  renderList(){
    const list=this.editor.q('.sigil-reference-list');list.replaceChildren();if(!this.refs.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='Import an image to use as a drawing guide.';list.append(empty);return;}
    for(const ref of this.refs){const row=document.createElement('div');row.className='sigil-reference-item';const select=document.createElement('button');select.type='button';select.className=`sigil-list-item${ref.id===this.selectedId?' active':''}`;select.setAttribute('aria-label',`Select reference ${ref.name}`);const thumbnail=document.createElement('img');thumbnail.src=ref.image;thumbnail.alt='';const text=document.createElement('span');text.textContent=ref.name;select.append(thumbnail,text);select.onclick=()=>this.select(ref.id);
      const visible=document.createElement('button');visible.type='button';visible.className='reference-visibility';visible.textContent=ref.visible?'◉':'○';visible.setAttribute('aria-label',`${ref.visible?'Hide':'Show'} reference ${ref.name}`);visible.setAttribute('aria-pressed',String(ref.visible));visible.onclick=()=>{ref.visible=!ref.visible;this.sync();this.editor.record();};row.append(select,visible);list.append(row);}
  }
  select(id){this.editor.endPointDrag();this.selectedId=id;this.renderList();this.inspector();this.syncSelection();this.editor.draw();}
  syncSelection(){
    const ref=this.selected;for(const [id,visual]of this.visuals)visual.outline.visible=this.active&&id===ref?.id&&ref.visible;
    if(this.active){const visual=ref&&this.visuals.get(ref.id);this.editor.transform.setMode(this.mode);this.editor.transform.setSpace(this.mode==='scale'?'local':'world');if(visual&&ref.visible)this.editor.transform.attach(visual.mesh);else this.editor.transform.detach();}
  }
  change(ref,record=true){const visual=this.visuals.get(ref.id);if(visual){const parent=ref.inFront?this.frontScene:this.normalGroup;if(visual.mesh.parent!==parent)parent.add(visual.mesh);updateReferenceVisual(visual,ref);}this.syncSelection();this.editor.draw();if(record)this.editor.record();}
  inspector(){
    const e=this.editor,panel=e.q('.sigil-reference-inspector');panel.replaceChildren();const ref=this.selected;if(!ref)return;
    const name=e.field(panel,'Reference name',ref.name,value=>{if(value.trim()){ref.name=value.trim().slice(0,100);this.renderList();e.record();}},{type:'text',reset:'Reference image'});name.maxLength=100;const commitName=name.onchange;name.onchange=name.onblur=()=>{commitName();name.value=ref.name;};
    e.choice(panel,'Reference transform',[['translate','Move'],['rotate','Rotate'],['scale','Scale']],this.mode,value=>{this.mode=value;this.syncSelection();e.draw();},'translate');
    const vector=(label,key,axes,defaults,options)=>{const title=document.createElement('h2');title.textContent=label;panel.append(title);const group=document.createElement('div');group.className='sigil-reference-vector';panel.append(group);
      for(const [i,axis]of axes.entries()){const degrees=key==='rotation',value=degrees?THREE.MathUtils.radToDeg(ref[key][i]):ref[key][i];const input=e.field(group,`Reference ${key} ${axis}`,Number(value.toFixed(3)),v=>{if(key==='scale'&&ref.keepAspect)ref.scale=[v,v,v];else ref[key][i]=degrees?THREE.MathUtils.degToRad(v):v;this.change(ref,false);this.syncInspector();}, {...options,reset:defaults[i]});const commit=input.onchange;input.onchange=input.onblur=()=>{commit();e.record();};group.lastChild.querySelector('label').firstChild.textContent=axis;group.lastChild.querySelector('.property-reset').onclick=()=>{if(key==='scale'&&ref.keepAspect)ref.scale=[1,1,1];else ref[key][i]=degrees?THREE.MathUtils.degToRad(defaults[i]):defaults[i];this.change(ref);this.syncInspector();};}
    };
    vector('Position','position',['X','Y','Z'],referenceDefaults.position,{min:-50,max:50,step:.025});vector('Rotation (°)','rotation',['X','Y','Z'],referenceDefaults.rotation,{min:-360,max:360,step:1});vector('Scale','scale',['X','Y','Z'],referenceDefaults.scale,{min:.001,max:50,step:.05});
    const check=(label,key,description)=>{const row=document.createElement('div');row.className='property-row';const l=document.createElement('label');l.className='checkbox-row';const input=document.createElement('input');input.type='checkbox';input.checked=ref[key];input.setAttribute('aria-label',label);const apply=value=>{ref[key]=value;if(key==='keepAspect'&&value)ref.scale=[ref.scale[0],ref.scale[0],ref.scale[0]];this.change(ref);this.syncInspector();this.renderList();};input.onchange=()=>apply(input.checked);l.append(input,document.createTextNode(label));row.append(l,e.resetButton(label,()=>{input.checked=referenceDefaults[key];apply(input.checked);}));panel.append(row);if(description){const hint=document.createElement('p');hint.className='hint';hint.textContent=description;panel.append(hint);}};
    check('Keep aspect ratio','keepAspect');e.field(panel,'Reference opacity',ref.opacity,v=>this.changeOpacity(ref,v,false),{min:0,max:1,step:.05,reset:referenceDefaults.opacity});const opacity=e.q('[aria-label="Reference opacity"]'),commitOpacity=opacity.onchange;opacity.onchange=opacity.onblur=()=>{commitOpacity();e.record();};panel.querySelector('[aria-label="Reset Reference opacity to default"]').onclick=()=>{opacity.value=referenceDefaults.opacity;this.changeOpacity(ref,referenceDefaults.opacity);};
    check('Reference visible','visible');check('Always in front','inFront','Draws over the sigil while transparent image pixels stay clear. Editing curves remain visible above it.');
    const remove=document.createElement('button');remove.type='button';remove.className='button subtle full';remove.textContent='Remove reference';remove.onclick=()=>{e.endPointDrag();e.design.references=this.refs.filter(item=>item.id!==ref.id);this.sync();e.record();};panel.append(remove);
  }
  changeOpacity(ref,value,record=true){ref.opacity=value;this.change(ref,record);}
  syncInspector(){const ref=this.selected;if(!ref)return;for(const key of ['position','rotation','scale'])for(const [i,axis]of ['X','Y','Z'].entries()){const input=this.editor.q(`[aria-label="Reference ${key} ${axis}"]`);if(input&&input!==document.activeElement)input.value=Number((key==='rotation'?THREE.MathUtils.radToDeg(ref[key][i]):ref[key][i]).toFixed(3));}}
  hit(event){const e=this.editor,ray=new THREE.Raycaster();e.camera.updateMatrixWorld(true);ray.setFromCamera(e.pointerFor(event),e.camera);const candidates=this.refs.map(ref=>this.visuals.get(ref.id)?.mesh).filter(mesh=>mesh?.visible);const hits=ray.intersectObjects(candidates,false);hits.sort((a,b)=>Number(b.object.material.depthTest===false)-Number(a.object.material.depthTest===false)||(a.object.material.depthTest===false?b.object.renderOrder-a.object.renderOrder:a.distance-b.distance));return hits.length?this.refs.find(ref=>this.visuals.get(ref.id).mesh===hits[0].object):null;}
  pointerDown(event){const ref=this.hit(event);if(!ref)return;event.preventDefault();event.stopImmediatePropagation();this.select(ref.id);if(this.mode!=='translate')return;
    const e=this.editor;e.pointDrag={kind:'reference',referenceId:ref.id,id:event.pointerId,plane:new ViewPlaneDrag(e.camera,new THREE.Vector3(...ref.position),e.pointerFor(event)),orbitEnabled:e.orbit.enabled};e.orbit.enabled=false;e.transform.enabled=false;e.renderer.domElement.style.cursor='grabbing';e.renderer.domElement.setPointerCapture(event.pointerId);
  }
  moveDragged(position){const ref=this.selected;if(!ref)return;ref.position=position.toArray().map(v=>Math.max(-50,Math.min(50,v)));this.change(ref,false);this.syncInspector();}
  beginTransform(){this.transformStart=this.selected?.scale.slice();}
  transformChanged(){const ref=this.selected,visual=ref&&this.visuals.get(ref.id);if(!visual)return;ref.position=visual.mesh.position.toArray().map(v=>Math.max(-50,Math.min(50,v)));ref.rotation=visual.mesh.rotation.toArray().slice(0,3);const scale=visual.mesh.scale.toArray().map(v=>Math.max(.001,Math.min(50,v)));
    if(this.mode==='scale'&&ref.keepAspect){const before=this.transformStart||ref.scale,axis=this.editor.transform.axis,index=axis==='Y'?1:axis==='Z'?2:axis==='X'?0:scale.findIndex((value,i)=>Math.abs(value-before[i])>1e-7),value=scale[Math.max(0,index)];ref.scale=[value,value,value];}else ref.scale=scale;
    this.change(ref,false);this.syncInspector();
  }
  disposeVisual(visual){visual.disposed=true;visual.mesh.removeFromParent();visual.outline.removeFromParent();visual.mesh.geometry.dispose();visual.mesh.material.dispose();visual.outline.geometry.dispose();visual.outline.material.dispose();visual.texture.dispose();}
  dispose(){for(const visual of this.visuals.values())this.disposeVisual(visual);this.visuals.clear();this.assets.clear();this.normalGroup.removeFromParent();}
}
