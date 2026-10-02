import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { defaults, lightDefaults } from './settings.js';
import { cameraDefaults, isLens, lensMap, lensFragmentShader, warpBuffers } from './lenses.js';
export { defaults } from './settings.js';

const vertexShader = `
in vec3 aFlow; in vec3 aGuide; in float aAnisotropy;
uniform float uAspect;
out vec3 vNormal; out vec3 vPosition; out vec2 vFlow; out vec2 vGuide; out float vConfidence;
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
  vFlow = projectLine(p.xyz, normalize(mat3(modelViewMatrix) * aFlow));
  vGuide = projectLine(p.xyz, normalize(mat3(modelViewMatrix) * aGuide));
  vConfidence = aAnisotropy;
  gl_Position = projectionMatrix * p;
}`;
const fragmentShader = `
precision highp float;
in vec3 vNormal; in vec3 vPosition; in vec2 vFlow; in vec2 vGuide; in float vConfidence;
uniform float uId; uniform float uFar; uniform float uFlow; uniform float uAmbient;
uniform int uCount; uniform vec4 uLights[8]; uniform vec2 uPowers[8];
layout(location=0) out vec4 outNormal;
layout(location=1) out vec4 outField;
layout(location=2) out vec4 outDepth;
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float brightness = uAmbient;
  for(int i=0; i<8; i++) {
    if(i>=uCount) break;
    vec3 delta = uLights[i].xyz - vPosition;
    vec3 direction = uLights[i].w < 0.5 ? normalize(uLights[i].xyz) : normalize(delta);
    float attenuation = uLights[i].w < 0.5 ? 1.0 : 1.0 / (1.0 + dot(delta, delta) * uPowers[i].y);
    brightness += max(0.0, dot(n, direction)) * uPowers[i].x * attenuation;
  }
  vec2 flow = normalize(mix(vGuide, vFlow, uFlow * smoothstep(0.03, 0.35, vConfidence)) + vec2(0.00001));
  float d = clamp(-vPosition.z / uFar, 0.0, 1.0) * 65535.0;
  outNormal = vec4(n*0.5+0.5, uId/255.0);
  outField = vec4(flow*0.5+0.5, clamp(brightness, 0.0, 1.0), 1.0);
  outDepth = vec4(floor(d/256.0)/255.0, mod(floor(d),256.0)/255.0, 0.0, 1.0);
}`;

export class EtchEngine extends EventTarget {
  constructor(container, paperCanvas) {
    super(); this.container = container; this.paperCanvas = paperCanvas;
    this.params = { ...defaults }; this.models = []; this.lights = []; this.cameras = []; this.selected = null;
    this.mode = 'hatch'; this.serial = 0; this.revision = 0; this.busy = false; this.dirty = true;
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
    this.transform.addEventListener('objectChange', () => { this.emit('transform'); this.invalidate(); this.draw(); });
    this.transform.addEventListener('change', () => this.draw());
    const originalPointer = this.transform._getPointer;
    this.transform._getPointer = event => { const pointer = originalPointer(event), mapped = this.viewPointer(pointer.x, pointer.y); return { ...pointer, x: mapped?.[0] ?? 10, y: mapped?.[1] ?? 10 }; };
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.params.ambient); this.scene.add(this.ambientLight);
    this.box = new THREE.Box3Helper(new THREE.Box3(), 0xc77c43); this.overlay.add(this.box); this.box.visible = false;
    this.grid = new THREE.GridHelper(12, 24, 0xb8bdc7, 0xdce0e7); this.grid.position.y = -2.3; this.grid.visible = false; this.overlay.add(this.grid);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    let down;
    this.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY, performance.now()]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || this.transform.axis || e.button !== 0) return;
      const r = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      const mapped = this.viewPointer(this.pointer.x, this.pointer.y); if (!mapped) return; this.pointer.set(...mapped);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.models.map(x => x.object), true)[0];
      let object = hit?.object; while (object && !object.userData.entry) object = object.parent;
      this.select(object?.userData.entry || null);
    });
    this.curvature = new Worker(new URL('./curvature-worker.js', import.meta.url), { type: 'module' });
    this.pendingGeometry = new Map();
    this.curvature.onmessage = ({ data }) => { const callback = this.pendingGeometry.get(data.id); if (!callback) return; this.pendingGeometry.delete(data.id); data.error ? callback.reject(new Error(data.error)) : callback.resolve(data); };
    this.curvature.onerror = e => { for (const pending of this.pendingGeometry.values()) pending.reject(new Error(e.message)); this.pendingGeometry.clear(); };
    this.hatcher = new Worker(new URL('./hatch-worker.js', import.meta.url), { type: 'module' });
    this.hatcher.onmessage = ({ data }) => {
      this.busy = false;
      if (data.error) { this.emit('error', data.error); return; }
      if (data.id === this.revision && !this.interacting) {
        this.paperCanvas.width = data.bitmap.width; this.paperCanvas.height = data.bitmap.height;
        this.paperCanvas.getContext('2d').drawImage(data.bitmap, 0, 0); this.ready = true;
        this.emit('rendered', { lines: data.lines, ms: data.ms, width: data.bitmap.width, height: data.bitmap.height, coveredPixels: data.coveredPixels });
      }
      data.bitmap.close(); this.draw(); if (this.dirty) this.schedule();
    };
    this.hatcher.onerror = e => { this.busy = false; this.emit('error', e.message); };
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize();
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  bindOrbit() {
    this.orbit?.dispose(); this.orbit = new OrbitControls(this.camera, this.renderer.domElement); this.orbit.target.copy(this.activeCamera.target); this.orbit.enableDamping = false; this.orbit.update();
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
    if (showSolid) { renderer.render(this.scene, this.camera); renderer.autoClear = false; renderer.clearDepth(); }
    if (overlay) renderer.render(this.overlay, this.camera); else if (!showSolid) renderer.clear();
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
    this.ambientLight.intensity = this.params.ambient;
    if (this.selected?.type === 'model') { this.box.box.setFromObject(this.selected.object); this.box.visible = true; } else this.box.visible = false;
    const showSolid = this.mode === 'solid' || !this.ready;
    this.paperCanvas.style.visibility = showSolid ? 'hidden' : 'visible';
    this.renderView(showSolid);
  }
  setParams(patch) { Object.assign(this.params, patch); this.invalidate(); this.draw(); this.schedule(); }
  setMode(mode) { this.mode = mode; this.draw(); if (mode === 'hatch') this.schedule(); }
  setTransform(mode) { this.transform.setMode(mode); this.draw(); }
  select(entry) { if (entry?.type === 'camera') this.activateCamera(entry); this.selected = entry; entry && entry.type !== 'camera' ? this.transform.attach(entry.object) : this.transform.detach(); this.draw(); this.emit('selection', entry); }
  styleFor(entry) { return entry.hatch ? { ...this.params, ...entry.hatch, quality: this.params.quality } : this.params; }
  setObjectParams(entry, patch) { entry.hatch = { ...this.styleFor(entry), ...patch }; this.invalidate(); this.draw(); this.schedule(); }
  async prepare(geometry) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const pos = geometry.attributes.position, nor = geometry.attributes.normal;
    // Flatten interleaved attributes so workers can safely read all geometry layouts.
    const position = new Float32Array(pos.count * 3), normal = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3); normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], i * 3); }
    const index = geometry.index ? new Uint32Array(geometry.index.array) : null, id = ++this.serial;
    const data = await new Promise((resolve, reject) => { this.pendingGeometry.set(id, { resolve, reject }); this.curvature.postMessage({ id, position, normal, index }, [position.buffer, normal.buffer, ...(index ? [index.buffer] : [])]); });
    geometry.setAttribute('aFlow', new THREE.BufferAttribute(data.flow, 3)); geometry.setAttribute('aGuide', new THREE.BufferAttribute(data.guide, 3)); geometry.setAttribute('aAnisotropy', new THREE.BufferAttribute(data.anisotropy, 1));
    return geometry;
  }
  fieldMaterial(id) {
    return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, side: THREE.DoubleSide, uniforms: {
      uId: { value: id }, uAspect: { value: this.camera.aspect }, uFar: { value: this.camera.far }, uFlow: { value: this.params.flow }, uAmbient: { value: this.params.ambient }, uCount: { value: 0 },
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
  async load(file, { register = true, source = null } = {}) {
    const ext = file.name.split('.').pop().toLowerCase(); let root;
    if (ext === 'obj') root = new OBJLoader().parse(await file.text());
    else if (ext === 'glb') {
      const loader = new GLTFLoader(), draco = new DRACOLoader(); draco.setDecoderPath('./vendor/addons/libs/draco/gltf/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
      // Geometry-only import: skip texture decoding and material extension setup.
      loader.register(parser => { parser.loadMaterial = () => Promise.resolve(new THREE.MeshBasicMaterial()); return { name: 'ETCH_GEOMETRY_ONLY' }; });
      try { root = (await loader.parseAsync(await file.arrayBuffer(), '')).scene; } finally { draco.dispose(); }
    } else throw new Error('Choose an OBJ or GLB file.');
    const entry = await this.addModel(root, file.name.replace(/\.[^.]+$/, ''), true, register);
    entry.source = source || { kind: 'file', path: '', filename: file.name };
    root.traverse(node => { node.geometry?.dispose(); const mats = Array.isArray(node.material) ? node.material : [node.material]; for (const m of mats) m?.dispose(); });
    if (register) { this.select(entry); this.frame(entry); } return entry;
  }
  addLight(type = 'sun') {
    if (this.lights.length >= 8) throw new Error('Up to eight lights can be used at once.');
    const object = type === 'sun' ? new THREE.DirectionalLight(0xffffff, 1) : new THREE.PointLight(0xffffff, 20, 0, 2);
    object.position.fromArray(lightDefaults[type].position); this.scene.add(object);
    const helper = type === 'sun' ? new THREE.DirectionalLightHelper(object, 0.4, 0xc9954f) : new THREE.PointLightHelper(object, 0.15, 0xc9954f);
    this.overlay.add(helper); helper.visible = false;
    const entry = { id: `light-${++this.serial}`, type: 'light', lightType: type, name: type === 'sun' ? 'Sun light' : 'Point light', object, helper, intensity: lightDefaults[type].intensity, falloff: lightDefaults[type].falloff, target: new THREE.Vector3(), color: lightDefaults[type].color, visible: true };
    this.lights.push(entry); this.updateLight(entry); this.emit('scene'); return entry;
  }
  updateLight(entry) {
    entry.object.color.set(entry.color); entry.object.intensity = entry.lightType === 'sun' ? entry.intensity : entry.intensity * 10;
    if (entry.lightType === 'sun') { entry.object.target.position.copy(entry.target); if (!entry.object.target.parent) this.scene.add(entry.object.target); }
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
    if (entry.type === 'model') { this.models = this.models.filter(x => x !== entry); entry.object.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); mesh.userData.fieldMaterial?.dispose(); }); }
    else { this.lights = this.lights.filter(x => x !== entry); this.scene.remove(entry.object.target); this.overlay.remove(entry.helper); entry.helper.dispose(); }
    this.invalidate(); this.emit('scene'); this.draw(); this.schedule();
  }
  frame(entry = this.selected) {
    const box = new THREE.Box3();
    if (entry?.type === 'model') box.setFromObject(entry.object); else for (const model of this.models) if (model.visible) box.expandByObject(model.object);
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
      let sphereRadius = 0; for (const model of this.models) if (model.visible && (!entry || entry.type !== 'model' || entry === model)) model.object.traverse(mesh => { if (!mesh.isMesh) return; mesh.updateWorldMatrix(true, false); if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere(); const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld); sphereRadius = Math.max(sphereRadius, sphere.center.distanceTo(center) + sphere.radius); });
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
  resetCamera() { this.camera.position.set(5, 3.1, 7.8); this.orbit.target.set(0, 0, 0); this.orbit.update(); this.frame(null); }
  async renderHatch() {
    if (this.busy || this.interacting || this.mode !== 'hatch') return;
    if (!this.dirty) return;
    this.dirty = false; this.busy = true; const id = this.revision;
    this.emit('rendering');
    try {
      const r = this.container.getBoundingClientRect(), scale = Math.min(2, this.params.quality / Math.max(r.width, r.height)), w = Math.max(2, Math.round(r.width * scale)), h = Math.max(2, Math.round(r.height * scale));
      if (!this.target || this.target.width !== w || this.target.height !== h) { this.target?.dispose(); this.target = new THREE.WebGLRenderTarget(w, h, { count: 3, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }); }
      this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
      const lights = this.lights.filter(x => x.visible), originals = [];
      for (let m = 0; m < this.models.length; m++) this.models[m].object.traverse(mesh => {
        if (!mesh.isMesh) return;
        originals.push([mesh, mesh.material]); const mat = mesh.userData.fieldMaterial; mesh.material = mat;
        const style = this.styleFor(this.models[m]), u = mat.uniforms; u.uId.value = m + 1; u.uAspect.value = this.camera.aspect; u.uFar.value = this.camera.far; u.uFlow.value = style.flow; u.uAmbient.value = style.ambient; u.uCount.value = lights.length;
        for (let i = 0; i < lights.length; i++) {
          const light = lights[i], v = light.object.getWorldPosition(new THREE.Vector3());
          if (light.lightType === 'sun') v.sub(light.target).normalize().transformDirection(this.camera.matrixWorldInverse); else v.applyMatrix4(this.camera.matrixWorldInverse);
          u.uLights.value[i].set(v.x, v.y, v.z, light.lightType === 'sun' ? 0 : 1);
          const c = light.object.color, luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
          u.uPowers.value[i].set(light.intensity * luminance, light.falloff);
        }
      });
      const normal = new Uint8Array(w * h * 4), field = new Uint8Array(w * h * 4), depth = new Uint8Array(w * h * 4);
      try {
        this.renderer.setRenderTarget(this.target); this.renderer.setClearColor(0, 0); this.renderer.autoClear = true; this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, normal, 0, 0);
        this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, field, 0, 1);
        this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, depth, 0, 2);
      } finally { this.renderer.setRenderTarget(null); for (const [mesh, material] of originals) mesh.material = material; }
      const buffers = warpBuffers(normal, field, depth, w, h, this.lensSettings());
      this.hatcher.postMessage({ id, width: w, height: h, scale, ...buffers, far: this.camera.far, params: this.params, objectParams: this.models.map(entry => this.styleFor(entry)) }, [buffers.normal.buffer, buffers.field.buffer, buffers.depth.buffer]);
    } catch (e) { this.busy = false; this.emit('error', e.message); }
  }
  exportPNG() {
    if (this.mode === 'hatch' && !this.ready) throw new Error('Wait for the current hatching render to finish.');
    if (this.mode === 'hatch') return this.paperCanvas;
    // Export the illustration without transform gizmos and selection helpers.
    this.renderView(true, false);
    const copy = document.createElement('canvas'); copy.width = this.renderer.domElement.width; copy.height = this.renderer.domElement.height; copy.getContext('2d').drawImage(this.renderer.domElement, 0, 0); this.draw(); return copy;
  }
}
