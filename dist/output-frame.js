import * as THREE from 'three';
import {isLens,lensMap} from './lenses.js';

export function copyOutputCamera(source){const camera=source.clone();camera.aspect=source.aspect;return camera;}

// Shift and enlarge an image window on a camera copy. Pose, near/far and lens
// parameters stay fixed. A uniform scale preserves projected hatch directions.
export function framedCamera(source,frame,aspect){
  const camera=source.clone(),matrix=new THREE.Matrix4();
  matrix.set(frame.zoom*source.aspect/aspect,0,0,-frame.x*frame.zoom/aspect,0,frame.zoom,0,-frame.y*frame.zoom,0,0,1,0,0,0,0,1);
  camera.projectionMatrix.multiplyMatrices(matrix,source.projectionMatrix);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.aspect=aspect;camera.updateMatrixWorld(true);return camera;
}
export function sourceToLens(x,y,lens){
  if(!isLens(lens.projection))return [x,y];const radius=Math.hypot(x,y);if(radius<1e-10)return [0,0];
  if(lens.projection==='fisheye'){const r=Math.atan(radius*Math.tan(lens.sourceFov*Math.PI/360))/(lens.fov*Math.PI/360);return r<=1?[x*r/radius,y*r/radius]:null;}
  const k=(lens.projection==='barrel'?.35:-.12)*lens.distortion/Math.max(1,lens.aspect*lens.aspect);let lo=0,hi=k<0?Math.sqrt(-1/(3*k)):Math.max(1,radius);
  if(k<0&&hi*(1+k*hi*hi)<radius)return null;
  for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(mid*(1+k*mid*mid)<radius)lo=mid;else hi=mid;}const r=(lo+hi)/2;return [x*r/radius,y*r/radius];
}
export function projectedBounds(entries,capture,lensSpace=true){
  const {camera,lens}=capture,p=new THREE.Vector3();let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const entry of entries)if(entry.visible)entry.object.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;const positions=mesh.geometry.getAttribute('position');if(!positions)return;
    for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);if(!Number.isFinite(p.x)||p.z< -1||p.z>1)continue;
      const q=lensSpace?sourceToLens(p.x*camera.aspect,p.y,lens):[p.x*camera.aspect,p.y];if(!q)continue;minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1]);}
  });return minX===Infinity?null:{minX,minY,maxX,maxY};
}
export function fitOutput(bounds,settings){
  if(!bounds)throw new Error('No model geometry is in front of this camera within its clipping range and lens.');
  const aspect=settings.width/settings.height,available=1-2*settings.margin;
  return {...settings,x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2,zoom:Math.max(.001,Math.min(16,Math.min(2*aspect*available/Math.max(.001,bounds.maxX-bounds.minX),2*available/Math.max(.001,bounds.maxY-bounds.minY))))};
}
export function sourceFrame(capture,settings,entries){
  if(!isLens(capture.lens.projection))return settings;
  // Bound the actual projected geometry instead of allocating empty areas of a
  // wide fisheye lens. This also captures geometry outside the viewport crop.
  const bounds=projectedBounds(entries,capture,false);return bounds?fitOutput(bounds,{...settings,margin:.03}):settings;
}
export function warpFramedBuffers(normal,field,depth,w,h,capture,output,source){
  if(!isLens(capture.lens.projection))return {normal,field,depth};
  const aspect=w/h,n=new Uint8Array(normal.length),f=new Uint8Array(field.length),d=depth?new Uint8Array(depth.length):null,epsilon=.0005;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const px=(2*(x+.5)/w-1)*aspect/output.zoom+output.x,py=(2*(y+.5)/h-1)/output.zoom+output.y,q=lensMap(px,py,capture.lens);if(!q)continue;
    const sx=Math.floor(((q[0]-source.x)*source.zoom/aspect+1)*w/2),sy=Math.floor(((q[1]-source.y)*source.zoom+1)*h/2);if(sx<0||sy<0||sx>=w||sy>=h)continue;
    const src=(sy*w+sx)*4,dst=(y*w+x)*4;if(!normal[src+3])continue;
    for(let k=0;k<4;k++){n[dst+k]=normal[src+k];f[dst+k]=field[src+k];if(d)d[dst+k]=depth[src+k];}
    const angle=.5*Math.atan2(field[src+1]/127.5-1,field[src]/127.5-1),vx=Math.cos(angle),vy=-Math.sin(angle),qx=lensMap(px+epsilon,py,capture.lens)||q,qy=lensMap(px,py+epsilon,capture.lens)||q;
    const a=(qx[0]-q[0])/epsilon,b=(qy[0]-q[0])/epsilon,c=(qx[1]-q[1])/epsilon,e=(qy[1]-q[1])/epsilon,det=a*e-b*c;if(Math.abs(det)<1e-8)continue;
    const ux=(e*vx-b*vy)/det,uy=-(-c*vx+a*vy)/det,length=Math.hypot(ux,uy)||1;f[dst]=Math.round(((ux*ux-uy*uy)/(length*length)+1)*127.5);f[dst+1]=Math.round((2*ux*uy/(length*length)+1)*127.5);
  }return {normal:n,field:f,depth:d};
}
