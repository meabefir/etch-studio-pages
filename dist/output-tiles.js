import * as THREE from 'three';
import {isLens,lensMap} from './lenses.js';

// Crop the projection only. Tile aspect converts tangent directions to pixels.
export function tileCamera(source,width,height,{x,y,width:w,height:h}){
  const camera=source.clone(),crop=new THREE.Matrix4();camera.aspect=w/h;
  crop.set(width/w,0,0,(width-2*x-w)/w,0,height/h,0,(height-2*y-h)/h,0,0,1,0,0,0,0,1);
  camera.projectionMatrix.multiplyMatrices(crop,source.projectionMatrix);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);return camera;
}
export function* outputTiles(width,height,edge){for(let y=0;y<height;y+=edge)for(let x=0;x<width;x+=edge)yield {x,y,width:Math.min(edge,width-x),height:Math.min(edge,height-y)};}
export function packedBuffers(width,height){const count=width*height;return {packed:true,mask:new Uint8Array(count),field:new Uint8Array(count*3),depth:new Uint16Array(count)};}
export function packTile(destination,source,width,height,tile){
  for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
    const i=(height-1-tile.y-y)*width+tile.x+x,j=(y*tile.width+x)*4;
    destination.mask[i]=source.normal[j+3];destination.depth[i]=source.depth[j]*256+source.depth[j+1];
    destination.field[i*3]=source.field[j];destination.field[i*3+1]=source.field[j+1];destination.field[i*3+2]=source.field[j+2];
  }
}
export function warpPackedBuffers(buffers,w,h,capture,output,source){
  if(!isLens(capture.lens.projection))return buffers;
  const result=packedBuffers(w,h),aspect=w/h,epsilon=.0005;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const px=(2*(x+.5)/w-1)*aspect/output.zoom+output.x,py=(1-2*(y+.5)/h)/output.zoom+output.y,q=lensMap(px,py,capture.lens);if(!q)continue;
    const sx=Math.floor(((q[0]-source.x)*source.zoom/aspect+1)*w/2),sy=h-1-Math.floor(((q[1]-source.y)*source.zoom+1)*h/2);if(sx<0||sy<0||sx>=w||sy>=h)continue;
    const src=sy*w+sx,dst=y*w+x;if(!buffers.mask[src])continue;
    result.mask[dst]=buffers.mask[src];result.depth[dst]=buffers.depth[src];for(let k=0;k<3;k++)result.field[dst*3+k]=buffers.field[src*3+k];
    const angle=.5*Math.atan2(buffers.field[src*3+1]/127.5-1,buffers.field[src*3]/127.5-1),vx=Math.cos(angle),vy=-Math.sin(angle),qx=lensMap(px+epsilon,py,capture.lens)||q,qy=lensMap(px,py+epsilon,capture.lens)||q;
    const a=(qx[0]-q[0])/epsilon,b=(qy[0]-q[0])/epsilon,c=(qx[1]-q[1])/epsilon,e=(qy[1]-q[1])/epsilon,det=a*e-b*c;if(Math.abs(det)<1e-8)continue;
    const ux=(e*vx-b*vy)/det,uy=-(-c*vx+a*vy)/det,length=Math.hypot(ux,uy)||1;
    result.field[dst*3]=Math.round(((ux*ux-uy*uy)/(length*length)+1)*127.5);result.field[dst*3+1]=Math.round((2*ux*uy/(length*length)+1)*127.5);
  }return result;
}
