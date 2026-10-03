import * as THREE from './vendor/build/three.module.js';

export function configureOrbit(orbit) {
  orbit.mouseButtons.LEFT = null;
  // OrbitControls switches ROTATE to PAN when Shift is held.
  orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  orbit.mouseButtons.RIGHT = null;
}

// Hold-to-fly keeps the orbit focus in front of the camera, so releasing the
// button returns to orbit navigation without a jump or a stale focus point.
export class FlyNavigation {
  constructor(element, { camera, orbit, canStart = () => true, onStart = () => {}, onChange = () => {}, onEnd = () => {} }) {
    Object.assign(this, { element, camera, orbit, canStart, onStart, onChange, onEnd });
    this.keys = new Set(); this.speed = 2.5; this.abort = new AbortController();
    const listen = (target, name, callback, options = {}) => target.addEventListener(name, callback, { ...options, signal: this.abort.signal });
    listen(element, 'contextmenu', e => e.preventDefault());
    listen(element, 'auxclick', e => e.preventDefault());
    listen(element, 'pointerdown', e => {
      if(e.button===1){e.preventDefault();return;}
      if (e.button !== 2 || !this.canStart()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.start(e); element.setPointerCapture(e.pointerId);
    }, { capture: true });
    listen(element, 'pointermove', e => {
      if (!this.active) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!(e.buttons & 2)) return this.stop();
      this.look(e.clientX - this.x, e.clientY - this.y); this.x = e.clientX; this.y = e.clientY;
    }, { capture: true });
    listen(window, 'pointerup', e => { if (this.active && e.button === 2) { e.preventDefault(); e.stopImmediatePropagation(); this.stop(); } }, { capture: true });
    for (const name of ['pointercancel', 'lostpointercapture']) listen(element, name, () => this.stop());
    listen(window, 'blur', () => this.stop());
    listen(document, 'visibilitychange', () => { if (document.hidden) this.stop(); });
    listen(document, 'keydown', e => {
      if (!this.active) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'Escape') this.stop(); else this.keys.add(e.code);
    }, { capture: true });
    listen(document, 'keyup', e => { if (this.active) { e.preventDefault(); e.stopImmediatePropagation(); this.keys.delete(e.code); } }, { capture: true });
    listen(element, 'wheel', e => {
      if (!this.active) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.speed = THREE.MathUtils.clamp(this.speed * Math.exp(-e.deltaY * .002), .05, 100);
      this.onSpeed?.(this.speed);
    }, { capture: true, passive: false });
  }
  start(e) {
    if (this.active) return;
    const camera = this.camera(), orbit = this.orbit();
    this.active = true; this.pointerId = e.pointerId; this.x = e.clientX; this.y = e.clientY;
    this.previousOrbitEnabled = orbit.enabled; orbit.enabled = false;
    this.focusDistance = Math.max(.1, camera.position.distanceTo(orbit.target));
    this.up = camera.up.clone().normalize();
    this.base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
    const forward = camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(this.base.clone().invert());
    this.pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)); this.yaw = Math.atan2(-forward.x, -forward.z);
    this.lastTime = performance.now(); this.element.classList.add('free-fly'); this.onStart();
    const tick = time => { if (!this.active) return; this.step(Math.min(.05, Math.max(0, (time - this.lastTime) / 1000))); this.lastTime = time; this.frame = requestAnimationFrame(tick); };
    this.frame = requestAnimationFrame(tick);
  }
  look(dx, dy) {
    this.yaw -= dx * .003; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .003, -Math.PI / 2 + .015, Math.PI / 2 - .015);
    const camera = this.camera(); camera.quaternion.copy(this.base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')));
    this.sync();
  }
  step(dt) {
    const keys = this.keys, forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const up = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
    if (!forward && !right && !up) return;
    const camera = this.camera(), direction = camera.getWorldDirection(new THREE.Vector3()), side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const move = direction.multiplyScalar(forward).addScaledVector(side, right).addScaledVector(this.up, up).normalize();
    camera.position.addScaledVector(move, this.speed * dt * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1)); this.sync();
  }
  sync() {
    const camera = this.camera(); camera.updateMatrixWorld(true);
    this.orbit().target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), this.focusDistance); this.onChange();
  }
  stop() {
    if (!this.active) return;
    this.active = false; cancelAnimationFrame(this.frame); this.keys.clear(); this.element.classList.remove('free-fly');
    if (this.element.hasPointerCapture(this.pointerId)) this.element.releasePointerCapture(this.pointerId);
    const orbit = this.orbit(); orbit.enabled = this.previousOrbitEnabled; orbit.update(); this.onEnd();
  }
  dispose() { this.stop(); this.abort.abort(); }
}
