import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { defaults, lightDefaults,hatchingSettings } from './settings.js';
import {validateToonSettings} from './toon.js';
import {HardContourRenderer} from './hard-contours.js?v=crease-flow-1';
import { cameraDefaults, isLens, lensMap, lensFragmentShader, warpBuffers } from './lenses.js?v=crease-flow-1';
import { starterSigil, validateSigil } from './sigil-data.js?v=sigil-rotation-1';
import { configureOrbit, FlyNavigation } from './navigation.js';
import { LightVisuals } from './light-visuals.js';
import { InfiniteGrid } from './infinite-grid.js';
import { ViewCompass, axisCameraPose, rollCameraPose } from './view-compass.js';
import { renderOutput } from './output-renderer.js?v=crease-flow-1';
import { copyOutputCamera } from './output-frame.js?v=crease-flow-1';
export { defaults } from './settings.js';

const vertexShader = `
in vec3 aFlow; in vec3 aGuide; in float aAnisotropy;
uniform float uAspect; uniform float uAngle;
out vec3 vNormal; out vec3 vPosition; out vec2 vFlow; out vec2 vCrossFlow; out vec3 vGuide; out float vConfidence;
vec2 projectLine(vec3 p, vec3 tangent) {
  vec4 a = projectionMatrix * vec4(p, 1.0);
  vec4 b = projectionMatrix * vec4(p + tangent * 0.01, 1.0);
  vec2 d = b.xy / b.w - a.xy / a.w; d.x *= uAspect; d.y = -d.y;
  d = normalize(d + vec2(0.0000001));
  return vec2(d.x*d.x - d.y*d.y, 2.0*d.x*d.y);
}
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  vPosition = p.xyz; vNormal = normalize(normalMatrix * normal);
  vec3 tangent=mat3(modelViewMatrix)*aFlow;
  tangent=normalize(tangent-vNormal*dot(tangent,vNormal));
  tangent=tangent*cos(uAngle)+cross(vNormal,tangent)*sin(uAngle);
  vFlow = projectLine(p.xyz,tangent);
  vCrossFlow = projectLine(p.xyz,cross(vNormal,tangent));
  vGuide = normalize(mat3(modelViewMatrix) * aGuide);
  vConfidence = aAnisotropy;
  gl_Position = projectionMatrix * p;
}`;
const fragmentShader = `
precision highp float;
in vec3 vNormal; in vec3 vPosition; in vec2 vFlow; in vec2 vCrossFlow; in vec3 vGuide; in float vConfidence;
uniform mat4 projectionMatrix; uniform float uAspect; uniform float uAngle;
uniform float uId; uniform float uFar; uniform float uFlow; uniform float uAmbient;
uniform int uCount; uniform int uShadeMode; uniform vec4 uLights[8]; uniform vec2 uPowers[8];
layout(location=0) out vec4 outNormal;
layout(location=1) out vec4 outField;
layout(location=2) out vec4 outDepth;
vec2 projectLine(vec3 p,vec3 tangent){
  vec4 a=projectionMatrix*vec4(p,1.0),b=projectionMatrix*vec4(tangent,0.0);
  vec2 d=b.xy*a.w-a.xy*b.w;d.x*=uAspect;d.y=-d.y;d=normalize(d+vec2(.0000001));
  return vec2(d.x*d.x-d.y*d.y,2.0*d.x*d.y);
}
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float brightness = uAmbient;
  vec3 averagedDirection=vec3(0.0);
  for(int i=0; i<8; i++) {
    if(i>=uCount) break;
    vec3 delta = uLights[i].xyz - vPosition;
    vec3 direction = uLights[i].w < 0.5 ? normalize(uLights[i].xyz) : normalize(delta);
    float attenuation = uLights[i].w < 0.5 ? 1.0 : 1.0 / (1.0 + dot(delta, delta) * uPowers[i].y);
    brightness += max(0.0, dot(n, direction)) * uPowers[i].x * attenuation;
    if(uPowers[i].x>0.000001)averagedDirection+=direction;
  }
  if(uShadeMode>0)brightness=length(averagedDirection)>0.000001?max(0.0,dot(n,normalize(averagedDirection))):0.0;
  float follow=uFlow*smoothstep(0.03,0.35,vConfidence);
  vec3 guide=normalize(vGuide-n*dot(vGuide,n));
  guide=guide*cos(uAngle)+cross(normalize(vNormal),guide)*sin(uAngle);
  vec2 flow=normalize(mix(projectLine(vPosition,guide),vFlow,follow)+vec2(.00001));
  vec2 crossFlow=normalize(mix(projectLine(vPosition,cross(n,guide)),vCrossFlow,follow)+vec2(.00001));
  float d = clamp(-vPosition.z / uFar, 0.0, 1.0) * 65535.0;
  outNormal = vec4(crossFlow*.5+.5,1.0,uId/255.0);
  outField = vec4(flow*0.5+0.5, clamp(brightness, 0.0, 1.0), 1.0);
  outDepth = vec4(floor(d/256.0)/255.0, mod(floor(d),256.0)/255.0, 0.0, 1.0);
}`;

export class EtchEngine extends EventTarget {
  constructor(container, paperCanvas) {
    super(); this.container = container; this.paperCanvas = paperCanvas;
    this.params = { ...defaults }; this.models = []; this.lights = []; this.cameras = []; this.selected = null;
    this.mode = 'hatch'; this.serial = 0; this.revision = 0; this.busy = false; this.dirty = true; this.showLightIcons=true; this.lightEditMode='aim';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setClearColor(0xffffff, 0);
    this.renderer.domElement.setAttribute('aria-label', '3D model viewport');
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.overlay = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120);
    this.camera.position.fromArray(cameraDefaults.position);
    this.activeCamera = { id: `camera-${++this.serial}`, type: 'camera', name: 'Camera 1', object: this.camera, target: new THREE.Vector3(), ...cameraDefaults };
    this.activeCamera.target = new THREE.Vector3(); this.cameras.push(this.activeCamera); this.bindOrbit();
    this.transform = new TransformControls(this.camera, this.renderer.domElement); this.transform.setSize(0.82);
    this.overlay.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', e => { this.orbit.enabled = !e.value; this.interacting = e.value; if (e.value) this.invalidate(); else this.schedule(); });
    this.transform.addEventListener('objectChange', () => {
      if(this.selected?.type==='light'){if(this.selected.lightType==='sun'&&this.lightEditMode==='aim')this.selected.target.copy(this.selected.aimObject.position);this.updateLight(this.selected);}
      this.emit('transform'); this.invalidate(); this.draw();
    });
    this.transform.addEventListener('change', () => this.draw());
    const originalPointer = this.transform._getPointer;
    this.transform._getPointer = event => { const pointer = originalPointer(event), mapped = this.viewPointer(pointer.x, pointer.y); return { ...pointer, x: mapped?.[0] ?? 10, y: mapped?.[1] ?? 10 }; };
    this.navigation = new FlyNavigation(this.renderer.domElement, {
      camera:()=>this.camera, orbit:()=>this.orbit, canStart:()=>!this.transform.dragging&&!document.querySelector('dialog[open]'),
      onStart:()=>{this.transform.enabled=false;this.interacting=true;this.invalidate();this.draw();this.emit('navigation',true);},
      onChange:()=>{this.activeCamera.target.copy(this.orbit.target);this.emit('camera-change');this.invalidate();this.draw();},
      onEnd:()=>{this.transform.enabled=true;this.interacting=false;this.schedule();this.emit('navigation',false);}
    });
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.params.ambient); this.scene.add(this.ambientLight);
    this.box = new THREE.Box3Helper(new THREE.Box3(), 0xc77c43); this.overlay.add(this.box); this.box.visible = false;
    this.grid=new InfiniteGrid();this.gridScene=new THREE.Scene();this.gridScene.add(this.grid);this.depthOnlyMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide});
    this.viewCompass=new ViewCompass(container,{align:(axis,sign)=>this.alignView(axis,sign),roll:angle=>this.rollView(angle)});
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    let down;
    this.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY, performance.now()]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || this.transform.axis || e.button !== 0) return;
      const r = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      const mapped = this.viewPointer(this.pointer.x, this.pointer.y); if (!mapped) return; this.pointer.set(...mapped);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.overlay.updateMatrixWorld(true);
      const lightHit=this.raycaster.intersectObjects(this.lights.flatMap(x=>[x.visuals.icon,x.visuals.target]).filter(x=>x.visible))[0];
      const hit = lightHit || this.raycaster.intersectObjects(this.models.filter(x=>x.visible).map(x => x.object), true)[0];
      let object = hit?.object; while (object && !object.userData.entry) object = object.parent;
      this.select(object?.userData.entry || null);
    });
    this.curvature = new Worker(new URL('./curvature-worker.js?v=crease-flow-1', import.meta.url), { type: 'module' });
    this.pendingGeometry = new Map();
    this.curvature.onmessage = ({ data }) => { const callback = this.pendingGeometry.get(data.id); if (!callback) return; this.pendingGeometry.delete(data.id); data.error ? callback.reject(new Error(data.error)) : callback.resolve(data); };
    this.curvature.onerror = e => { for (const pending of this.pendingGeometry.values()) pending.reject(new Error(e.message)); this.pendingGeometry.clear(); };
    this.hatcher = new Worker(new URL('./hatch-worker.js?v=crease-flow-1', import.meta.url), { type: 'module' });
    this.hatcher.onmessage = ({ data }) => {
      this.busy = false;
      if (data.error) { this.emit('error', data.error); return; }
      if (data.id === this.revision && !this.interacting) {
        this.paperCanvas.width = data.bitmap.width; this.paperCanvas.height = data.bitmap.height;
        this.paperCanvas.getContext('2d').drawImage(data.bitmap, 0, 0); this.ready = true;
        this.emit('rendered', { lines: data.lines,hardEdges:data.hardEdges||0,depthEdges:data.depthEdges||0, ms: data.ms, width: data.bitmap.width, height: data.bitmap.height, coveredPixels: data.coveredPixels });
      }
      data.bitmap.close(); this.draw(); if (this.dirty) this.schedule();
    };
    this.hatcher.onerror = e => { this.busy = false; this.emit('error', e.message); };
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize();
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  bindOrbit() {
    this.navigation?.stop();
    this.orbit?.dispose(); this.orbit = new OrbitControls(this.camera, this.renderer.domElement); this.orbit.target.copy(this.activeCamera.target); this.orbit.enableDamping = false; this.orbit.update();
    configureOrbit(this.orbit);
    if (this.camera.isOrthographicCamera) { const height = this.camera.top - this.camera.bottom; this.orbit.minZoom = height / 2000; this.orbit.maxZoom = height / .1; }
    this.orbit.addEventListener('start', () => { this.interacting = true; this.invalidate(); this.draw(); });
    this.orbit.addEventListener('change', () => { this.activeCamera.target.copy(this.orbit.target); this.activeCamera.orthoSize = this.camera.isOrthographicCamera ? (this.camera.top - this.camera.bottom) / this.camera.zoom : this.activeCamera.orthoSize; this.emit('camera-change'); this.invalidate(); this.draw(); });
    this.orbit.addEventListener('end', () => { this.interacting = false; this.schedule(); });
  }
  addCamera(config = null) {
    const source = config || this.cameraSnapshot(this.activeCamera);
    const object = source.projection === 'orthographic' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
    object.position.fromArray(source.position); object.up.fromArray(source.up || cameraDefaults.up);
    let number = 1; while (this.cameras.some(c => c.name === `Camera ${number}`)) number++;
    const entry = { ...cameraDefaults, ...source, id: `camera-${++this.serial}`, type: 'camera', name: config?.name || `Camera ${number}`, object, target: new THREE.Vector3().fromArray(source.target) };
    this.cameras.push(entry); this.updateCamera(entry); this.emit('scene'); return entry;
  }
  cameraSnapshot(entry) {
    if (entry === this.activeCamera) entry.target.copy(this.orbit.target);
    return { id: entry.id, name: entry.name, projection: entry.projection, fov: entry.fov, orthoSize: entry.orthoSize, distortion: entry.distortion, near: entry.object.near, far: entry.object.far, position: entry.object.position.toArray(), target: entry.target.toArray(), up: entry.object.up.toArray() };
  }
  activateCamera(entry) {
    if (entry === this.activeCamera) return;
    this.activeCamera.target.copy(this.orbit.target); this.activeCamera = entry; this.camera = entry.object; this.transform.detach(); this.transform.camera = this.camera; this.bindOrbit(); this.resize(); this.emit('scene'); this.emit('camera-change');
  }
  updateCamera(entry = this.activeCamera) {
    const orthographic = entry.projection === 'orthographic';
    if (Boolean(entry.object.isOrthographicCamera) !== orthographic) {
      const previous = entry.object, object = orthographic ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
      object.position.copy(previous.position); object.up.copy(previous.up); entry.object = object;
      if (entry === this.activeCamera) { this.camera = object; this.transform.camera = object; this.bindOrbit(); }
    }
    const camera = entry.object, r = this.container.getBoundingClientRect(), aspect = r.width / Math.max(1, r.height);
    camera.near = entry.near; camera.far = entry.far; camera.aspect = aspect;
    if (orthographic) { camera.zoom = 1; camera.top = entry.orthoSize / 2; camera.bottom = -camera.top; camera.left = -camera.top * aspect; camera.right = -camera.left; }
    else camera.fov = entry.fov;
    camera.lookAt(entry.target); camera.updateProjectionMatrix();
    if (entry === this.activeCamera) { if (orthographic) { this.orbit.minZoom = entry.orthoSize / 2000; this.orbit.maxZoom = entry.orthoSize / .1; } this.orbit.target.copy(entry.target); this.orbit.update(); this.invalidate(); this.draw(); this.schedule(); this.emit('camera-change'); }
  }
  updateLensCamera() {
    if (this.activeCamera.projection !== 'fisheye') return;
    // The infinite ground can fill the lens outside the model's projected bounds.
    if(this.grid?.visible){this.camera.fov=this.activeCamera.fov;this.camera.updateProjectionMatrix();return;}
    this.camera.updateMatrixWorld(true); let tangent = Math.tan(THREE.MathUtils.degToRad(5));
    for (const entry of this.models) if (entry.visible) entry.object.traverse(mesh => {
      if (!mesh.isMesh) return; mesh.updateWorldMatrix(true, false); if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld), center = sphere.center.applyMatrix4(this.camera.matrixWorldInverse), distance = center.length();
      if (distance <= sphere.radius || center.z >= 0) { tangent = 1000; return; }
      const spread = Math.asin(Math.min(1, sphere.radius / distance));
      const horizontal = Math.min(Math.PI/2-.001, Math.atan2(Math.abs(center.x), -center.z) + spread), vertical = Math.min(Math.PI/2-.001, Math.atan2(Math.abs(center.y), -center.z) + spread);
      tangent = Math.max(tangent, Math.tan(horizontal)/this.camera.aspect, Math.tan(vertical));
    });
    this.camera.fov = Math.min(this.activeCamera.fov, THREE.MathUtils.radToDeg(2 * Math.atan(tangent)) * 1.04); this.camera.updateProjectionMatrix();
  }
  lensSettings() { return { ...this.activeCamera, sourceFov: this.camera.fov, aspect: this.camera.aspect }; }
  viewPointer(x, y) { if (!isLens(this.activeCamera.projection)) return [x, y]; const q = lensMap(x * this.camera.aspect, y, this.lensSettings()); return q ? [q[0] / this.camera.aspect, q[1]] : null; }
  renderView(showSolid, overlay = true) {
    const lens = isLens(this.activeCamera.projection), renderer = this.renderer;
    if (lens) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (!this.lensTarget || this.lensTarget.width !== size.x || this.lensTarget.height !== size.y) { this.lensTarget?.dispose(); this.lensTarget = new THREE.WebGLRenderTarget(size.x, size.y); }
      if (!this.lensScene) {
        this.lensScene = new THREE.Scene(); this.lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.lensMaterial = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: lensFragmentShader, depthTest: false, depthWrite: false, transparent: true, uniforms: { image: { value: null }, aspect: { value: 1 }, lens: { value: 1 }, fov: { value: 35 }, sourceFov: { value: 35 }, strength: { value: .5 }, background: { value: new THREE.Vector4() } } });
        this.lensScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lensMaterial));
      }
      renderer.setRenderTarget(this.lensTarget);
    }
    renderer.setClearColor(this.params.paper, showSolid ? 1 : 0); renderer.autoClear = true;
    if(showSolid)renderer.render(this.scene,this.camera);
    else if(overlay&&this.grid.visible){const original=this.scene.overrideMaterial;this.scene.overrideMaterial=this.depthOnlyMaterial;try{renderer.render(this.scene,this.camera);}finally{this.scene.overrideMaterial=original;}}
    else renderer.clear();
    renderer.autoClear=false;
    if(overlay&&this.grid.visible){this.grid.update(this.camera,renderer);renderer.render(this.gridScene,this.camera);}
    if(overlay){renderer.clearDepth();renderer.render(this.overlay,this.camera);}
    renderer.autoClear = true;
    if (lens) {
      const u = this.lensMaterial.uniforms, c = new THREE.Color(this.params.paper);
      u.image.value = this.lensTarget.texture; u.aspect.value = this.camera.aspect; u.lens.value = { fisheye: 1, barrel: 2, pincushion: 3 }[this.activeCamera.projection]; u.fov.value = this.activeCamera.fov; u.sourceFov.value = this.camera.fov; u.strength.value = this.activeCamera.distortion;
      u.background.value.set(c.r, c.g, c.b, showSolid ? 1 : 0); renderer.setRenderTarget(null); renderer.setClearColor(this.params.paper, showSolid ? 1 : 0); renderer.render(this.lensScene, this.lensCamera);
    }
  }
  invalidate() { this.revision++; this.dirty = true; this.ready = false; }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.renderHatch(), 75); }
  resize() {
    const r = this.container.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height); this.camera.aspect = r.width / r.height;
    if (this.camera.isOrthographicCamera) { const half = this.activeCamera.orthoSize * this.camera.zoom / 2; this.camera.top = half; this.camera.bottom = -half; this.camera.left = -half * this.camera.aspect; this.camera.right = -this.camera.left; }
    this.camera.updateProjectionMatrix();
    this.invalidate(); this.draw(); this.schedule();
  }
  draw() {
    if (!this.renderer) return;
    this.updateLensCamera();
    this.camera.updateMatrixWorld(true);
    this.viewCompass?.update(this.camera);
    for(const light of this.lights){light.visuals.update(this.camera,Math.max(1,this.container.clientHeight),this.showLightIcons,this.selected===light,this.lightEditMode==='aim');light.helper.visible=this.showLightIcons&&light.visible&&light.helperEnabled;}
    this.ambientLight.intensity = this.params.ambient;
    if (['model','sigil'].includes(this.selected?.type)) { this.box.box.setFromObject(this.selected.object); this.box.visible = true; } else this.box.visible = false;
    const showSolid = this.mode === 'solid' || !this.ready;
    this.paperCanvas.style.visibility = showSolid ? 'hidden' : 'visible';
    this.renderView(showSolid);
  }
  setParams(patch) { Object.assign(this.params, patch); this.invalidate(); this.draw(); this.schedule(); }
  setMode(mode) { this.mode = mode; this.draw(); if (mode === 'hatch') this.schedule(); }
  setTransform(mode) { if(this.selected?.type==='light')mode='translate';this.transform.setMode(mode);this.draw();return mode; }
  setLightIconsVisible(visible) { this.showLightIcons=Boolean(visible);this.draw();this.emit('light-visuals'); }
  setLightEditMode(mode) { this.lightEditMode=mode==='position'?'position':'aim';this.attachSelection();this.draw();this.emit('light-edit'); }
  attachSelection() {
    const entry=this.selected;
    if(!entry||entry.type==='camera'){this.transform.detach();return;}
    if(entry.type==='light')this.transform.setMode('translate');
    this.transform.attach(entry.type==='light'&&entry.lightType==='sun'&&this.lightEditMode==='aim'?entry.aimObject:entry.object);
  }
  select(entry) { this.navigation?.stop();if (entry?.type === 'camera') this.activateCamera(entry); this.selected = entry;if(entry?.type==='light')this.lightEditMode=entry.lightType==='sun'?'aim':'position';this.attachSelection();this.draw();this.emit('selection', entry); }
  styleFor(entry) { return { ...this.params, ...entry.hatch,...entry.toon, quality:this.params.quality }; }
  setObjectParams(entry, patch) { entry.hatch = hatchingSettings({ ...this.styleFor(entry), ...patch }); this.invalidate(); this.draw(); this.schedule(); }
  setObjectToon(entry,patch){entry.toon=patch===null?null:validateToonSettings({...this.styleFor(entry),...patch});this.invalidate();this.draw();this.schedule();}
  async prepare(geometry) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const pos = geometry.attributes.position, nor = geometry.attributes.normal;
    // Flatten interleaved attributes so workers can safely read all geometry layouts.
    const position = new Float32Array(pos.count * 3), normal = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3); normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], i * 3); }
    const index = geometry.index ? new Uint32Array(geometry.index.array) : null, id = ++this.serial;
    const data = await new Promise((resolve, reject) => { this.pendingGeometry.set(id, { resolve, reject }); this.curvature.postMessage({ id, position, normal, index }, [position.buffer, normal.buffer, ...(index ? [index.buffer] : [])]); });
    // A source vertex can belong to several sharp faces. Split only those
    // corners and copy all attributes using the worker's source mapping.
    for(const [key,attribute]of Object.entries(geometry.attributes)){
      const values=new Float32Array(data.sourceIndex.length*attribute.itemSize);
      for(let i=0;i<data.sourceIndex.length;i++)for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.getComponent(data.sourceIndex[i],k);
      geometry.setAttribute(key,new THREE.BufferAttribute(values,attribute.itemSize));
    }
    geometry.setIndex(new THREE.BufferAttribute(data.index,1));geometry.setAttribute('normal',new THREE.BufferAttribute(data.normal,3));geometry.morphAttributes={};
    geometry.userData.flowHasCreases=data.creaseCount>0;
    geometry.setAttribute('aFlow', new THREE.BufferAttribute(data.flow, 3)); geometry.setAttribute('aGuide', new THREE.BufferAttribute(data.guide, 3)); geometry.setAttribute('aAnisotropy', new THREE.BufferAttribute(data.anisotropy, 1));
    return geometry;
  }
  hasFlowBarriers(){let found=false;for(const entry of this.models)if(entry.visible)entry.object.traverse(mesh=>{if(mesh.isMesh&&mesh.visible&&mesh.geometry.userData.flowHasCreases)found=true;});return found;}
  hasSurfaceCross(){return this.models.some(entry=>entry.visible&&this.styleFor(entry).cross&&this.styleFor(entry).shadeMode!=='toon');}
  fieldMaterial(id) {
    return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, side: THREE.DoubleSide, uniforms: {
      uId: { value: id }, uAspect: { value: this.camera.aspect }, uFar: { value: this.camera.far }, uFlow: { value: this.params.flow }, uAngle:{value:this.params.angle*Math.PI/180},uAmbient: { value: this.params.ambient }, uCount: { value: 0 },uShadeMode:{value:0},
      uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uPowers: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) }
    } });
  }
  async addModel(root, name, fit = true, register = true) {
    if (register && this.models.length >= 200) throw new Error('The scene supports up to 200 models.');
    root.updateMatrixWorld(true);
    const group = new THREE.Group(); let triangles = 0;
    const input = []; root.traverse(node => { if (node.isMesh && node.geometry?.attributes.position) input.push(node); });
    if (!input.length) throw new Error('This file contains no triangle geometry.');
    for (const node of input) {
      const geometry = node.geometry.clone(); geometry.applyMatrix4(node.matrixWorld); geometry.clearGroups();
      await this.prepare(geometry); triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xe5e8ed, roughness: 0.85, side: THREE.DoubleSide }));
      mesh.userData.fieldMaterial = this.fieldMaterial(this.models.length + 1); group.add(mesh);
    }
    const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() === 0) throw new Error('The model geometry is empty or invalid.');
    if (fit) { const factor = 3.7 / Math.max(size.x, size.y, size.z); for (const mesh of group.children) { mesh.geometry.translate(-center.x, -center.y, -center.z); mesh.geometry.scale(factor, factor, factor); } }
    group.name = name;
    const entry = { id: `model-${++this.serial}`, type: 'model', name, object: group, triangles: Math.round(triangles), visible: true };
    group.userData.entry = entry; if (register) { this.models.push(entry); this.scene.add(group); this.invalidate(); this.emit('scene'); this.draw(); this.schedule(); } return entry;
  }
  async demo(kind = 'knot', register = true) {
    let geometry, name;
    if (kind === 'sphere') { geometry = new THREE.SphereGeometry(1.7, 96, 64); name = 'Sphere study'; }
    else if (kind === 'vessel') { const pts = [[0, -1.7], [0.6, -1.7], [0.85, -1.5], [0.5, -1.2], [0.38, -0.5], [0.65, 0], [1.1, 0.45], [1.25, 1.0], [1.3, 1.5], [1.25, 1.55], [1.18, 1.0], [1.03, 0.5], [0.57, 0.03], [0.31, -0.5], [0.43, -1.2], [0.7, -1.48], [0, -1.48]].map(([x, y]) => new THREE.Vector2(x, y)); geometry = new THREE.LatheGeometry(pts, 128); name = 'Vessel study'; }
    else { geometry = new THREE.TorusKnotGeometry(1.15, 0.38, 280, 40, 2, 3); geometry.rotateX(Math.PI * 0.16); name = 'Twisted form'; }
    const entry = await this.addModel(new THREE.Mesh(geometry), name, true, register); geometry.dispose(); entry.source = { kind: 'demo', shape: kind }; return entry;
  }
  async createSigil(design = starterSigil(), name = 'Nature sigil', register = true, mesh = null) {
    design = validateSigil(design);
    if (!mesh) mesh = await new Promise((resolve,reject) => {
      const worker = new Worker(new URL('./sigil-worker.js', import.meta.url), { type:'module' });
      worker.onmessage = ({data}) => { if (data.error || data.mesh) { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.mesh); } };
      worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); }; worker.postMessage({id:1,design});
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(mesh.position,3)); geometry.setAttribute('normal',new THREE.BufferAttribute(mesh.normal,3)); geometry.setIndex(new THREE.BufferAttribute(mesh.index,1));
    const root=new THREE.Mesh(geometry);let entry;
    try { entry=await this.addModel(root,name,false,register); } finally { geometry.dispose();root.material.dispose(); }
    entry.type='sigil'; entry.source={kind:'sigil',design};
    entry.object.traverse(node => { if (node.isMesh) { node.material.color.set(design.settings.color); node.material.metalness=design.settings.metalness; node.material.roughness=design.settings.roughness; } });
    if (register) { this.emit('scene'); this.invalidate(); this.draw(); this.schedule(); } return entry;
  }
  async updateSigil(entry, design, mesh) {
    const replacement = await this.createSigil(design,entry.name,false,mesh);
    for (const child of [...entry.object.children]) { entry.object.remove(child); child.traverse(node=>{node.geometry?.dispose();node.material?.dispose();node.userData.fieldMaterial?.dispose();}); }
    for (const child of [...replacement.object.children]) entry.object.add(child);
    entry.source=replacement.source;entry.triangles=replacement.triangles;this.invalidate();this.emit('scene');this.emit('selection',entry);this.draw();this.schedule();
  }
  async load(file, { register = true, source = null } = {}) {
    const ext = file.name.split('.').pop().toLowerCase(); let root;
    if (ext === 'obj') root = new OBJLoader().parse(await file.text());
    else if (ext === 'glb') {
      const loader = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('./vendor/addons/libs/draco/gltf/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
      // Geometry-only import: skip texture decoding and material extension setup.
      loader.register(parser => { parser.loadMaterial = () => Promise.resolve(new THREE.MeshBasicMaterial()); return { name: 'ETCH_GEOMETRY_ONLY' }; });
      try { root = (await loader.parseAsync(await file.arrayBuffer(), '')).scene; } finally { draco.dispose(); }
    } else throw new Error('Choose an OBJ or GLB file.');
    const imported=[],baseName=file.name.replace(/\.[^.]+$/, ''),parts=[];root.traverse(node=>{if(node.isMesh&&node.geometry?.attributes.position)parts.push(node);});
    try{
      const split=ext==='obj'&&(parts.length>1||source?.part!=null)&&(register||source?.part!=null);
      if(split){
        const chosen=source?.part!=null?[parts[source.part]]:parts;if(chosen.some(node=>!node))throw new Error('The saved OBJ object is missing from this file. Relink the original file or import it again.');
        if(register&&this.models.length+chosen.length>200)throw new Error('The scene supports up to 200 models.');
        const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),factor=3.7/Math.max(size.x,size.y,size.z);
        if(!Number.isFinite(factor))throw new Error('The model geometry is empty or invalid.');root.position.sub(center).multiplyScalar(factor);root.scale.multiplyScalar(factor);root.updateMatrixWorld(true);
        for(const node of chosen){const entry=await this.addModel(node,`${baseName} · ${node.name||`Object ${parts.indexOf(node)+1}`}`,false,false),localCenter=new THREE.Box3().setFromObject(entry.object).getCenter(new THREE.Vector3());
          entry.object.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.translate(-localCenter.x,-localCenter.y,-localCenter.z);});entry.object.position.copy(localCenter);entry.source={...(source||{kind:'file',path:'',filename:file.name}),part:parts.indexOf(node)};imported.push(entry);
        }
      }else{const entry=await this.addModel(root,baseName,true,false);entry.source=source||{kind:'file',path:'',filename:file.name};imported.push(entry);}
      if(register){if(this.models.length+imported.length>200)throw new Error('The scene supports up to 200 models.');for(const entry of imported){this.models.push(entry);this.scene.add(entry.object);}this.invalidate();this.emit('scene');this.select(imported[0]);const frameGroup=new THREE.Group();for(const entry of imported){entry.object.updateMatrixWorld(true);entry.object.traverse(mesh=>{if(mesh.isMesh){const proxy=new THREE.Mesh(mesh.geometry,mesh.material);proxy.applyMatrix4(mesh.matrixWorld);frameGroup.add(proxy);}});}this.frame({type:'model',object:frameGroup});this.draw();this.schedule();}
      return imported[0];
    }catch(error){for(const entry of imported)entry.object.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();mesh.userData.fieldMaterial?.dispose();});throw error;}
    finally{root.traverse(node => { node.geometry?.dispose(); const mats = Array.isArray(node.material) ? node.material : [node.material]; for (const m of mats) m?.dispose(); });}
  }
  addLight(type = 'sun') {
    if (this.lights.length >= 8) throw new Error('Up to eight lights can be used at once.');
    const object = type === 'sun' ? new THREE.DirectionalLight(0xffffff, 1) : new THREE.PointLight(0xffffff, 20, 0, 2);
    object.position.fromArray(lightDefaults[type].position); this.scene.add(object);
    const helper = type === 'sun' ? new THREE.DirectionalLightHelper(object, 0.4, 0xc9954f) : new THREE.PointLightHelper(object, 0.15, 0xc9954f);
    this.overlay.add(helper); helper.visible = false;
    const entry = { id: `light-${++this.serial}`, type: 'light', lightType: type, name: type === 'sun' ? 'Sun light' : 'Point light', object, helper, helperEnabled:false, aimObject:new THREE.Object3D(), intensity: lightDefaults[type].intensity, falloff: lightDefaults[type].falloff, target: new THREE.Vector3(), color: lightDefaults[type].color, visible: true };
    entry.aimObject.userData.entry=entry;this.overlay.add(entry.aimObject);entry.visuals=new LightVisuals(entry);this.overlay.add(entry.visuals.object);
    this.lights.push(entry); this.updateLight(entry); this.emit('scene'); return entry;
  }
  updateLight(entry) {
    entry.object.color.set(entry.color); entry.object.intensity = entry.lightType === 'sun' ? entry.intensity : entry.intensity * 10;
    if (entry.lightType === 'sun') { entry.object.target.position.copy(entry.target);entry.aimObject.position.copy(entry.target);if (!entry.object.target.parent) this.scene.add(entry.object.target); }
    entry.helper.update(); this.invalidate(); this.draw(); this.schedule();
  }
  setVisible(entry, visible) { entry.visible = visible; entry.object.visible = visible; if (!visible && this.selected === entry) this.select(null); this.invalidate(); this.emit('scene'); this.draw(); this.schedule(); }
  remove(entry = this.selected) {
    if (!entry) return;
    if (entry.type === 'camera') {
      if (this.cameras.length === 1) { this.emit('notice', 'At least one camera must remain in the scene.'); return; }
      const active = entry === this.activeCamera; this.cameras = this.cameras.filter(x => x !== entry);
      if (active) this.activateCamera(this.cameras[0]); if (this.selected === entry) this.select(active ? this.activeCamera : null); this.emit('scene'); return;
    }
    if (this.selected === entry) this.select(null);
    this.scene.remove(entry.object);
    if (['model','sigil'].includes(entry.type)) { this.models = this.models.filter(x => x !== entry); entry.object.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); mesh.userData.fieldMaterial?.dispose(); }); }
    else { this.lights = this.lights.filter(x => x !== entry); this.scene.remove(entry.object.target);this.overlay.remove(entry.helper,entry.aimObject,entry.visuals.object);entry.helper.dispose();entry.visuals.dispose(); }
    this.invalidate(); this.emit('scene'); this.draw(); this.schedule();
  }
  frame(entry = this.selected) {
    const box = new THREE.Box3();
    if (['model','sigil'].includes(entry?.type)) box.setFromObject(entry.object); else {
      for (const model of this.models) if (model.visible) box.expandByObject(model.object);
      if(entry?.type==='light'){box.expandByPoint(entry.object.position);if(entry.lightType==='sun')box.expandByPoint(entry.target);else box.expandByPoint(entry.object.position.clone().addScalar(.5));}
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const radius = size.length() * 0.5, tan = Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 35) / 2));
    const rotation = this.camera.quaternion.clone().invert();
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(rotation);
      distance = Math.max(distance, Math.abs(corner.x) / (tan * this.camera.aspect) + corner.z, Math.abs(corner.y) / tan + corner.z);
    }
    distance = Math.max(0.1, distance * 1.1);
    if (this.activeCamera.projection === 'fisheye') {
      let sphereRadius = 0; for (const model of this.models) if (model.visible && (!entry || !['model','sigil'].includes(entry.type) || entry === model)) model.object.traverse(mesh => { if (!mesh.isMesh) return; mesh.updateWorldMatrix(true, false); if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere(); const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld); sphereRadius = Math.max(sphereRadius, sphere.center.distanceTo(center) + sphere.radius); });
      distance = Math.max(.1, sphereRadius / Math.sin(THREE.MathUtils.degToRad(this.activeCamera.fov * .38)) * 1.04);
    }
    if (this.camera.isOrthographicCamera) {
      let extent = 0; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const c = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(rotation); extent = Math.max(extent, Math.abs(c.y), Math.abs(c.x) / this.camera.aspect); }
      this.activeCamera.orthoSize = Math.max(.1, extent * 2.2); this.camera.zoom = 1; this.updateCamera(); distance = Math.max(5, radius * 3);
    }
    const direction = this.camera.position.clone().sub(this.orbit.target).normalize();
    this.orbit.target.copy(center); this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.far = this.activeCamera.far = Math.max(120, distance + radius * 8); this.camera.near = this.activeCamera.near = Math.max(0.01, distance / 2000); this.camera.updateProjectionMatrix(); this.orbit.update(); this.invalidate(); this.draw(); this.schedule();
  }
  resetCamera() { this.navigation.stop();this.camera.position.set(5,3.1,7.8);this.camera.up.fromArray(cameraDefaults.up);this.activeCamera.target.set(0,0,0);this.bindOrbit();this.frame(null); }
  alignView(axis,sign=1){
    this.navigation.stop();const entry=['model','sigil'].includes(this.selected?.type)?this.selected:null,box=new THREE.Box3();
    if(entry)box.setFromObject(entry.object);else for(const model of this.models)if(model.visible)box.expandByObject(model.object);
    const target=box.isEmpty()?this.orbit.target.clone():box.getCenter(new THREE.Vector3());axisCameraPose(this.camera,target,axis,sign);this.activeCamera.target.copy(target);this.bindOrbit();if(!box.isEmpty())this.frame(entry);else{this.invalidate();this.draw();this.schedule();}this.emit('camera-change');
  }
  rollView(degrees){this.navigation.stop();this.activeCamera.target.copy(this.orbit.target);rollCameraPose(this.camera,this.orbit.target,THREE.MathUtils.degToRad(degrees));this.bindOrbit();this.invalidate();this.draw();this.schedule();this.emit('camera-change');}
  async renderHatch() {
    if (this.busy || this.interacting || this.mode !== 'hatch') return;
    if (!this.dirty) return;
    this.dirty = false; this.busy = true; const id = this.revision;
    this.emit('rendering');
    try {
      const r = this.container.getBoundingClientRect(), scale = Math.min(2, this.params.quality / Math.max(r.width, r.height)), w = Math.max(2, Math.round(r.width * scale)), h = Math.max(2, Math.round(r.height * scale));
      if (!this.target || this.target.width !== w || this.target.height !== h) { this.target?.dispose(); this.target = new THREE.WebGLRenderTarget(w, h, { count: 3, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }); }
      const {normal,field,depth,hasFlowBarriers}=this.geometryBuffers(this.camera,w,h,this.target);
      const buffers = warpBuffers(normal, field, depth, w, h, this.lensSettings());
      this.hatcher.postMessage({ id, width: w, height: h, scale, ...buffers,hasFlowBarriers,surfaceCross:true, far: this.camera.far, params: this.params, objectParams: this.models.map(entry => this.styleFor(entry)) }, [buffers.normal.buffer, buffers.field.buffer, buffers.depth.buffer]);
    } catch (e) { this.busy = false; this.emit('error', e.message); }
  }
  geometryBuffers(camera,w,h,target){
    this.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const lights=this.lights.filter(x=>x.visible),originals=[],normal=new Uint8Array(w*h*4),field=new Uint8Array(w*h*4),depth=new Uint8Array(w*h*4),hasFlowBarriers=this.hasFlowBarriers();
    const renderer=this.renderer,oldTarget=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),auto=renderer.autoClear;
    try{
      for(let m=0;m<this.models.length;m++)this.models[m].object.traverse(mesh=>{
        if(!mesh.isMesh)return;originals.push([mesh,mesh.material]);const mat=mesh.userData.fieldMaterial;mesh.material=mat;
        const style=this.styleFor(this.models[m]),u=mat.uniforms;u.uId.value=m+1;u.uAspect.value=camera.aspect;u.uFar.value=camera.far;u.uFlow.value=style.flow;u.uAngle.value=style.angle*Math.PI/180;u.uAmbient.value=style.ambient;u.uCount.value=lights.length;u.uShadeMode.value=style.shadeMode==='toon'?1:style.shadeMode==='combined'?2:0;
        for(let i=0;i<lights.length;i++){const light=lights[i],v=light.object.getWorldPosition(new THREE.Vector3());if(light.lightType==='sun')v.sub(light.target).normalize().transformDirection(camera.matrixWorldInverse);else v.applyMatrix4(camera.matrixWorldInverse);
          u.uLights.value[i].set(v.x,v.y,v.z,light.lightType==='sun'?0:1);const c=light.object.color;u.uPowers.value[i].set(light.intensity*(c.r*.2126+c.g*.7152+c.b*.0722),light.falloff);}
      });
      renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(this.scene,camera);
      renderer.readRenderTargetPixels(target,0,0,w,h,normal,0,0);renderer.readRenderTargetPixels(target,0,0,w,h,field,0,1);renderer.readRenderTargetPixels(target,0,0,w,h,depth,0,2);
      if(hasFlowBarriers){
        this.flowEdges??=new HardContourRenderer({barrier:true});const barriers=this.flowEdges.render(this,camera,w,h);
        for(let j=0;j<depth.length;j+=4)if(barriers[j]&&barriers[j]===normal[j+3])depth[j+2]|=1;
      }
      if(this.models.some(entry=>entry.visible&&this.styleFor(entry).hardContour)){
        this.hardContours??=new HardContourRenderer();const contours=this.hardContours.render(this,camera,w,h);
        for(let j=0;j<depth.length;j+=4)if(contours[j]&&contours[j]===normal[j+3])depth[j+2]|=2;
      }
      return {normal,field,depth,hasFlowBarriers,surfaceCross:true};
    }finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);renderer.autoClear=auto;for(const [mesh,material]of originals)mesh.material=material;}
  }
  captureOutputView(){this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);return {camera:copyOutputCamera(this.camera),lens:{...this.lensSettings()},referenceHeight:Math.max(1,this.container.clientHeight),mode:this.mode,name:this.activeCamera.name};}
  exportPNG(capture,settings,options){return renderOutput(this,capture,settings,options);}
}
