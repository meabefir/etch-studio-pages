import * as THREE from 'three';
import {nodeMap,pointOf,resolveNode} from './sigil-data.js?v=thorn-base-only-1';
import {selectedVertices,verticesInBox,SigilSelectionTransform} from './sigil-selection.js?v=quick-actions-1';

const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
const editing=target=>target.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
export class SigilQuickActions {
  constructor(editor) {
    this.editor=editor;this.canvas=editor.renderer.domElement;this.viewport=editor.q('.sigil-viewport');
    this.ids=new Set([editor.selected.node]);this.abort=new AbortController();this.mouse=null;
    this.canvas.tabIndex=0;
    this.box=document.createElement('div');this.box.className='sigil-selection-box';this.box.hidden=true;
    this.hint=document.createElement('div');this.hint.className='sigil-selection-hint';this.hint.setAttribute('role','status');this.hint.setAttribute('aria-label','Vertex selection');
    this.viewport.append(this.box,this.hint);this.updateHint();
    const listen=(target,type,callback,options={})=>target.addEventListener(type,callback,{...options,signal:this.abort.signal});
    listen(this.canvas,'pointerdown',e=>this.down(e),{capture:true});
    listen(this.canvas,'pointermove',e=>this.move(e),{capture:true});
    listen(this.canvas,'pointerup',e=>this.up(e),{capture:true});
    for(const name of ['pointercancel','lostpointercapture'])listen(this.canvas,name,()=>{if(this.boxDrag)this.endBox(false);if(this.operation?.drag)this.finish(false);});
    listen(editor.dialog,'pointerdown',e=>{
      if(this.menu&&!this.menu.contains(e.target)){this.closeMenu();if(e.button===0){stop(e);this.canvas.focus({preventScroll:true});return;}}
      if(this.operation&&!this.viewport.contains(e.target))this.finish(this.canConfirm());
    },{capture:true});
    listen(window,'keydown',e=>this.key(e),{capture:true});
    listen(window,'pointermove',e=>{if(this.operation&&!this.canvas.contains(e.target))this.move(e);},{capture:true});
    listen(window,'blur',()=>{this.closeMenu();this.endBox(false);this.finish(false);});
    listen(this.canvas,'wheel',e=>{if(this.operation||this.boxDrag||this.menu)stop(e);},{capture:true,passive:false});
  }
  canonicalIds() {const map=nodeMap(this.editor.design);return new Set([...this.ids].filter(id=>map.has(id)).map(id=>resolveNode(map.get(id),map).id));}
  isSelected(id) {const map=nodeMap(this.editor.design),node=map.get(id);return !!node&&this.canonicalIds().has(resolveNode(node,map).id);}
  selectOnly(pick) {this.ids=new Set([pick.node]);this.updateHint();}
  chooseVertex(pick,extend=false) {
    if(!extend)return this.setSelection(new Set([pick.node]),pick);
    const ids=new Set(this.ids),map=nodeMap(this.editor.design),canonical=resolveNode(map.get(pick.node),map).id;
    if(this.isSelected(pick.node)){for(const id of ids)if(map.has(id)&&resolveNode(map.get(id),map).id===canonical)ids.delete(id);}
    else ids.add(pick.node);
    this.setSelection(ids,pick);
  }
  clean() {const map=nodeMap(this.editor.design);this.ids=new Set([...this.ids].filter(id=>map.has(id)));this.updateHint();}
  setSelection(ids,active=null) {
    this.ids=new Set(ids);const e=this.editor;
    const picks=e.design.curves.flatMap(curve=>curve.nodes.filter(n=>this.ids.has(n.id)).map(node=>({curve:curve.id,node:node.id,part:'p'})));
    if(active)e.selected={...active,part:'p'};else if(picks.length&&!this.ids.has(e.selected.node))e.selected=picks.at(-1);
    this.updateHint();e.rebuildLists();e.rebuildOverlay();
  }
  updateHint() {
    if(this.operation)return;
    const count=selectedVertices(this.editor.design,this.ids).points.length;
    this.hint.textContent=`${count} ${count===1?'vertex':'vertices'} selected · G move · R rotate`;
    this.hint.hidden=!!this.editor.referenceEditor?.active||!this.editor.design.settings.showCurves;
  }
  down(event) {
    const e=this.editor;this.mouse={clientX:event.clientX,clientY:event.clientY};
    if(e.applying)return;
    if(this.operation){stop(event);if(event.button===2)this.finish(false);else if(event.button===0&&this.canConfirm())this.finish(true);return;}
    if(event.button===2){
      stop(event);if(e.pointDrag||e.transform.dragging||this.boxDrag)return;
      this.openMenu(event);return;
    }
    if(this.menu){this.closeMenu();if(event.button===0){stop(event);return;}}
    if(event.button!==0||e.referenceEditor?.active||!e.design.settings.showCurves||e.pointDrag||e.transform.dragging||e.design.settings.showAxes&&e.transform.axis)return;
    this.canvas.focus({preventScroll:true});
    const marker=e.pickPoint(event),pick=marker?.userData.pick;
    if(pick){
      if(pick.part!=='p'){this.selectOnly(pick);return;}
      if(event.shiftKey||event.ctrlKey||event.metaKey){
        stop(event);this.chooseVertex(pick,true);return;
      }
      if(!this.isSelected(pick.node))this.selectOnly(pick);
      if(this.canonicalIds().size>1){
        stop(event);e.selected={...pick};e.rebuildLists();this.start('move',event,true);this.capture(event.pointerId);return;
      }
      this.selectOnly(pick);
      return;
    }
    stop(event);this.closeMenu();
    this.boxDrag={id:event.pointerId,start:{x:event.clientX,y:event.clientY},end:{x:event.clientX,y:event.clientY},before:new Set(this.ids),add:event.shiftKey,subtract:event.ctrlKey||event.metaKey,moved:false,orbit:e.orbit.enabled};
    e.orbit.enabled=false;e.transform.enabled=false;this.capture(event.pointerId);
  }
  capture(id) {this.canvas.setPointerCapture(id);}
  release(id) {if(id!=null&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}
  move(event) {
    this.mouse={clientX:event.clientX,clientY:event.clientY};
    if(this.operation){stop(event);this.updateOperation();return;}
    const box=this.boxDrag;if(!box)return;
    stop(event);if(!(event.buttons&1)){this.endBox(true);return;}
    box.end={x:event.clientX,y:event.clientY};
    if(Math.hypot(box.end.x-box.start.x,box.end.y-box.start.y)>4)box.moved=true;
    const r=this.viewport.getBoundingClientRect();this.box.hidden=!box.moved;
    Object.assign(this.box.style,{left:Math.min(box.start.x,box.end.x)-r.left+'px',top:Math.min(box.start.y,box.end.y)-r.top+'px',width:Math.abs(box.end.x-box.start.x)+'px',height:Math.abs(box.end.y-box.start.y)+'px'});
  }
  up(event) {
    if(this.operation?.drag){stop(event);this.finish(this.operation.transform.valid);return;}
    if(this.boxDrag&&this.boxDrag.id===event.pointerId){stop(event);this.endBox(true);}
  }
  endBox(commit) {
    const box=this.boxDrag;if(!box)return;this.boxDrag=null;this.box.hidden=true;this.release(box.id);
    const e=this.editor;e.orbit.enabled=box.orbit;e.transform.enabled=!e.applying;
    if(commit){
      const hit=box.moved?verticesInBox(e.design,e.camera,this.canvas.getBoundingClientRect(),box.start,box.end):new Set();
      const ids=box.add||box.subtract?new Set(box.before):new Set();
      for(const id of hit)box.subtract?ids.delete(id):ids.add(id);
      this.setSelection(ids);
    }
  }
  start(kind,event=this.mouse,drag=false) {
    const e=this.editor;if(!event||!this.ids.size||e.applying||e.referenceEditor?.active||!e.design.settings.showCurves||e.pointDrag||e.transform.dragging)return;
    this.closeMenu();const transform=new SigilSelectionTransform(e.design,this.ids,e.camera,e.pointerFor(event));if(!transform.points.length)return;
    this.operation={kind,transform,number:'',axis:null,orbit:e.orbit.enabled,drag,id:drag?event.pointerId:null};
    e.orbit.enabled=false;e.transform.enabled=false;e.transform.detach();this.canvas.style.cursor=kind==='move'?'move':'crosshair';
    e.rebuildOverlay();this.operationHint();
  }
  numberValue() {const s=this.operation.number;return s!==''&&Number.isFinite(Number(s))?Number(s):null;}
  canConfirm() {const op=this.operation;return !!op&&op.transform.valid&&(op.number===''||/^-?(?:\d+\.?\d*|\.\d+)$/.test(op.number));}
  updateOperation() {
    const op=this.operation,e=this.editor;if(!op)return;
    const value=this.numberValue(),pointer=e.pointerFor(this.mouse);
    op.transform.setAxis(op.axis);
    const valid=op.kind==='move'?op.transform.move(e.camera,pointer,value):op.transform.rotate(e.camera,pointer,value);
    if(valid){e.changed(false);e.syncCoordinates();}
    this.operationHint();
  }
  operationHint() {
    const op=this.operation,number=op.number;
    const value=number!==''?number:op.kind==='rotate'?(op.transform.degrees||0).toFixed(1):op.transform.distance?.toFixed(3)||'0';
    this.hint.hidden=false;this.hint.classList.toggle('invalid',!this.canConfirm());
    this.hint.textContent=`${op.kind==='move'?'Move':'Rotate'}${op.axis?' · '+op.axis.toUpperCase(): ' · View'} · ${value}${op.kind==='rotate'?'°':' units'} · Type a value · X/Y/Z axis · Enter / click confirm · Esc / right-click cancel${op.transform.valid?'':' · Outside ±50 units'}`;
  }
  finish(commit) {
    const op=this.operation;if(!op)return;this.operation=null;this.release(op.id);
    const e=this.editor;if(!commit)op.transform.restore();
    e.orbit.enabled=op.orbit;e.transform.enabled=!e.applying;this.canvas.style.cursor='';this.hint.classList.remove('invalid');
    if(!e.closed){e.changed(false);if(commit)e.record();e.scheduleMesh();e.syncCoordinates();e.rebuildOverlay();}
    this.updateHint();
  }
  key(event) {
    const e=this.editor;if(e.closed||!e.dialog.contains(event.target)||e.applying)return;
    if(this.menu){
      if(event.key==='Escape'){stop(event);this.closeMenu();this.canvas.focus({preventScroll:true});}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){stop(event);const buttons=[...this.menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement),direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;buttons[(index+direction+buttons.length)%buttons.length]?.focus();}
      return;
    }
    if(this.boxDrag&&event.key==='Escape'){stop(event);this.endBox(false);return;}
    if(this.operation){
      stop(event);const op=this.operation,key=event.key.toLowerCase();
      if(key==='escape')this.finish(false);
      else if(key==='enter'){if(this.canConfirm())this.finish(true);}
      else if(['x','y','z'].includes(key)){op.axis=op.axis===key?null:key;this.updateOperation();}
      else if(key==='backspace'){op.number=op.number.slice(0,-1);this.updateOperation();}
      else if(key==='delete'){op.number='';this.updateOperation();}
      else if(key==='-'||key==='+'){op.number=(key==='-'?(op.number.startsWith('-')?'':'-'):'')+op.number.replace(/^[+-]/,'');this.updateOperation();}
      else if(/^\d$/.test(key)||key==='.'&&!op.number.includes('.')){op.number+=key;this.updateOperation();}
      return;
    }
    if(editing(event.target)||event.ctrlKey||event.metaKey||event.altKey||event.repeat||e.referenceEditor?.active||!e.design.settings.showCurves||e.pointDrag||e.transform.dragging)return;
    if(['g','r'].includes(event.key.toLowerCase())){
      const bounds=this.canvas.getBoundingClientRect();this.mouse??={clientX:bounds.left+bounds.width/2,clientY:bounds.top+bounds.height/2};
      stop(event);this.start(event.key.toLowerCase()==='g'?'move':'rotate');
    }
  }
  openMenu(event) {
    this.closeMenu();const e=this.editor,bounds=this.viewport.getBoundingClientRect(),size=Math.min(280,bounds.width-12,bounds.height-12);
    const menu=this.menu=document.createElement('div');menu.className='sigil-radial-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Quick curve actions');
    Object.assign(menu.style,{left:THREE.MathUtils.clamp(event.clientX-bounds.left-size/2,6,bounds.width-size-6)+'px',top:THREE.MathUtils.clamp(event.clientY-bounds.top-size/2,6,bounds.height-size-6)+'px',width:size+'px',height:size+'px'});
    const node=e.currentNode(),p=node?new THREE.Vector3(...pointOf(node,nodeMap(e.design))):e.orbit.target;
    const ray=new THREE.Raycaster();ray.setFromCamera(e.pointerFor(event),e.camera);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(e.camera.getWorldDirection(new THREE.Vector3()),p),position=ray.ray.intersectPlane(plane,new THREE.Vector3())?.toArray();
    const actions=[['Add vertex','＋',()=>e.addVertex({position}),e.currentCurve()?.nodes.length>=32],['Create curve','⌁',()=>e.addCurve({position}),e.design.curves.length>=24],['Detached curve','⌇',()=>e.addCurve({position,detached:true}),e.design.curves.length>=24]];
    actions.forEach(([name,icon,action,disabled],i)=>{
      const sector=document.createElement('div');sector.className='sigil-radial-sector';sector.classList.toggle('disabled',disabled);
      const b=document.createElement('button');b.type='button';b.role='menuitem';b.disabled=disabled;b.setAttribute('aria-label',name);
      const angle=-90+i*120,points=['50% 50%'];for(let a=angle-60;a<=angle+60;a+=6)points.push(`${50+50*Math.cos(a*Math.PI/180)}% ${50+50*Math.sin(a*Math.PI/180)}%`);
      sector.style.clipPath=`polygon(${points.join(',')})`;
      const label=document.createElement('span');b.style.left=50+30*Math.cos(angle*Math.PI/180)+'%';b.style.top=50+30*Math.sin(angle*Math.PI/180)+'%';
      const symbol=document.createElement('strong');symbol.textContent=icon;label.append(symbol,document.createTextNode(name));b.append(label);
      const choose=()=>{if(disabled)return;this.closeMenu();e.referenceEditor?.active&&e.referenceEditor.setTab('curves');action();this.canvas.focus({preventScroll:true});};
      b.onclick=sector.onclick=choose;b.onfocus=()=>sector.classList.add('active');b.onblur=()=>sector.classList.remove('active');menu.append(sector,b);
    });
    const center=document.createElement('span');center.className='sigil-radial-center';center.textContent='Quick actions';menu.append(center);this.viewport.append(menu);menu.querySelector('button:not(:disabled)')?.focus();
  }
  closeMenu() {this.menu?.remove();this.menu=null;}
  reset() {this.closeMenu();this.endBox(false);this.finish(false);}
  dispose() {this.reset();this.abort.abort();this.box.remove();this.hint.remove();}
}
