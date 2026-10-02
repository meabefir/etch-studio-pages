import * as THREE from 'three';
export function vertexRingLayout(camera,point,bounds,radius,scale=1){
  const position=new THREE.Vector3(...point),p=position.clone().project(camera),depth=-position.applyMatrix4(camera.matrixWorldInverse).z;
  const units=2*Math.max(.01,depth)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,bounds.height);
  return {x:(p.x+1)*bounds.width/2,y:(1-p.y)*bounds.height/2,r:15+Math.min(110,radius*scale/units),units,visible:p.z>=-1&&p.z<=1&&depth>0};
}
export class VertexRadiusDrag {
  constructor(layout,bounds,pointer,radius,scale=1){this.center=[bounds.left+layout.x,bounds.top+layout.y];this.start=Math.hypot(pointer[0]-this.center[0],pointer[1]-this.center[1]);this.radius=radius;this.units=layout.units/scale;}
  value(pointer){const distance=Math.hypot(pointer[0]-this.center[0],pointer[1]-this.center[1]);return Math.max(.015,Math.min(1,this.radius+(distance-this.start)*this.units));}
}
