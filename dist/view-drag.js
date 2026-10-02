import * as THREE from './vendor/build/three.module.js';

export class ViewPlaneDrag {
  constructor(camera, position, pointer) {
    this.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),position);
    this.ray=new THREE.Raycaster();this.ray.setFromCamera(pointer,camera);
    const hit=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());
    this.offset=hit?position.clone().sub(hit):new THREE.Vector3();
  }
  position(camera,pointer) {
    this.ray.setFromCamera(pointer,camera);
    const hit=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());
    return hit?.add(this.offset);
  }
}
