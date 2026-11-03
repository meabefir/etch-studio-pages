import * as THREE from 'three';
import {nodeMap,pointOf,resolveNode} from './sigil-data.js?v=thorn-base-only-1';

// Pole aliases count once for the pivot and translation. Their independent
// Bézier handles still rotate when their vertex is part of the selection.
export function selectedVertices(design, ids) {
  const map=nodeMap(design), points=new Map(), handles=[];
  for(const curve of design.curves)for(const node of curve.nodes)if(ids.has(node.id)){
    const pole=resolveNode(node,map);
    if(!points.has(pole.id))points.set(pole.id,{node:pole,p:new THREE.Vector3(...pole.p)});
    handles.push({node,in:new THREE.Vector3(...node.in),out:new THREE.Vector3(...node.out)});
  }
  return {points:[...points.values()],handles};
}

export function verticesInBox(design,camera,bounds,a,b) {
  camera.updateMatrixWorld(true);
  const map=nodeMap(design),ids=new Set(),minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
  for(const curve of design.curves)for(const node of curve.nodes){
    const p=new THREE.Vector3(...pointOf(node,map)).project(camera);
    if(p.z< -1||p.z>1)continue;
    const x=bounds.left+(p.x+1)*bounds.width/2,y=bounds.top+(1-p.y)*bounds.height/2;
    if(x>=minX&&x<=maxX&&y>=minY&&y<=maxY)ids.add(node.id);
  }
  return ids;
}

export class SigilSelectionTransform {
  constructor(design,ids,camera,pointer) {
    Object.assign(this,selectedVertices(design,ids));
    this.pivot=new THREE.Vector3();for(const entry of this.points)this.pivot.add(entry.p);
    if(this.points.length)this.pivot.divideScalar(this.points.length);
    camera.updateMatrixWorld(true);
    this.right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize();
    this.up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).normalize();
    this.normal=camera.getWorldDirection(new THREE.Vector3()).negate();
    this.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal,this.pivot);
    this.ray=new THREE.Raycaster();
    this.start=this.hit(camera,pointer)||this.pivot.clone();
    this.direction=this.right.clone();this.axis=null;this.angle=0;
    this.previousAngle=this.pointerAngle(this.start);this.rotationAnchored=this.start.distanceToSquared(this.pivot)>1e-10;this.valid=true;
  }
  hit(camera,pointer) {this.ray.setFromCamera(pointer,camera);return this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());}
  pointerAngle(point) {const d=point.clone().sub(this.pivot);return Math.atan2(d.dot(this.up),d.dot(this.right));}
  setAxis(axis) {this.axis=axis?new THREE.Vector3(...({x:[1,0,0],y:[0,1,0],z:[0,0,1]})[axis]):null;}
  move(camera,pointer,value=null) {
    const hit=this.hit(camera,pointer);if(!hit)return false;
    let delta=hit.sub(this.start);
    if(this.axis)delta=this.axis.clone().multiplyScalar(delta.dot(this.axis));
    if(delta.lengthSq()>1e-12)this.direction.copy(delta).normalize();
    if(value!=null)delta=(this.axis||this.direction).clone().multiplyScalar(value);
    return this.apply(delta,null);
  }
  rotate(camera,pointer,degrees=null) {
    const hit=this.hit(camera,pointer);if(!hit)return false;
    const angle=this.pointerAngle(hit);
    if(!this.rotationAnchored&&hit.distanceToSquared(this.pivot)>1e-10){this.previousAngle=angle;this.rotationAnchored=true;}
    const step=angle-this.previousAngle;
    this.angle+=Math.atan2(Math.sin(step),Math.cos(step));this.previousAngle=angle;
    const radians=degrees==null?this.angle:THREE.MathUtils.degToRad(degrees);
    this.degrees=THREE.MathUtils.radToDeg(radians);
    return this.apply(null,new THREE.Quaternion().setFromAxisAngle(this.axis||this.normal,radians));
  }
  apply(delta,rotation) {
    const points=this.points.map(entry=>rotation?entry.p.clone().sub(this.pivot).applyQuaternion(rotation).add(this.pivot):entry.p.clone().add(delta));
    const handles=this.handles.map(entry=>({in:rotation?entry.in.clone().applyQuaternion(rotation):entry.in,out:rotation?entry.out.clone().applyQuaternion(rotation):entry.out}));
    this.valid=[...points,...handles.flatMap(h=>[h.in,h.out])].every(v=>v.toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<=50+1e-9));
    if(!this.valid)return false;
    points.forEach((p,i)=>this.points[i].node.p=p.toArray().map(n=>THREE.MathUtils.clamp(n,-50,50)));
    handles.forEach((h,i)=>{this.handles[i].node.in=h.in.toArray().map(n=>THREE.MathUtils.clamp(n,-50,50));this.handles[i].node.out=h.out.toArray().map(n=>THREE.MathUtils.clamp(n,-50,50));});
    this.distance=delta?.length()||0;return true;
  }
  restore() {
    for(const entry of this.points)entry.node.p=entry.p.toArray();
    for(const entry of this.handles){entry.node.in=entry.in.toArray();entry.node.out=entry.out.toArray();}
  }
}
