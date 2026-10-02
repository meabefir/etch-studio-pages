import * as THREE from 'three';
import {validateOutput,outputDimensions} from './output-settings.js';
import {framedCamera,sourceFrame,warpFramedBuffers} from './output-frame.js';

const aborted=()=>new DOMException('Image render cancelled.','AbortError');
export async function renderOutput(engine,capture,value,{preview=false,signal}={}){
  const settings=validateOutput(value),{width:w,height:h}=outputDimensions(settings,preview);
  const limit=Math.min(engine.renderer.capabilities.maxTextureSize,engine.renderer.getContext().getParameter(engine.renderer.getContext().MAX_RENDERBUFFER_SIZE));
  if(Math.max(w,h)>limit)throw new Error(`This graphics device supports image dimensions up to ${limit} pixels.`);
  if(signal?.aborted)throw aborted();engine.scene.updateMatrixWorld(true);
  const frame=sourceFrame(capture,settings,engine.models),camera=framedCamera(capture.camera,frame,w/h);
  const target=new THREE.WebGLRenderTarget(w,h,{count:capture.mode==='hatch'?3:1,type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
  let buffers;
  try{
    if(capture.mode==='hatch')buffers=engine.geometryBuffers(camera,w,h,target);
    else{
      target.texture.colorSpace=THREE.SRGBColorSpace;const pixels=new Uint8Array(w*h*4),r=engine.renderer,clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear,oldTarget=r.getRenderTarget();
      try{r.setRenderTarget(target);r.setClearColor(engine.params.paper,0);r.autoClear=true;r.render(engine.scene,camera);r.readRenderTargetPixels(target,0,0,w,h,pixels);}
      finally{r.setRenderTarget(oldTarget);r.setClearColor(clear,alpha);r.autoClear=auto;}
      buffers={normal:pixels,field:new Uint8Array(pixels.length),depth:null};
    }
  }finally{target.dispose();}
  buffers=warpFramedBuffers(buffers.normal,buffers.field,buffers.depth,w,h,capture,settings,frame);
  if(signal?.aborted)throw aborted();
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');
  if(capture.mode==='solid'){
    const image=new ImageData(w,h);for(let y=0;y<h;y++)image.data.set(buffers.normal.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
    context.putImageData(image,0,0);context.globalCompositeOperation='destination-over';context.fillStyle=engine.params.paper;context.fillRect(0,0,w,h);return {canvas,lines:0,ms:0};
  }
  const scale=settings.strokes==='pixels'?1:h/capture.referenceHeight*settings.zoom;
  const worker=new Worker(new URL('./hatch-worker.js',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);},cancel=()=>{cleanup();reject(aborted());};signal?.addEventListener('abort',cancel,{once:true});
    worker.onerror=e=>{cleanup();reject(new Error(e.message||'Image rendering failed.'));};
    worker.onmessage=({data})=>{cleanup();if(data.error)return reject(new Error(data.error));context.drawImage(data.bitmap,0,0);data.bitmap.close();resolve({canvas,lines:data.lines,ms:data.ms});};
    worker.postMessage({id:0,width:w,height:h,scale,...buffers,far:camera.far,params:{...engine.params},objectParams:engine.models.map(entry=>({...engine.styleFor(entry)}))},[buffers.normal.buffer,buffers.field.buffer,buffers.depth.buffer]);
  });
}
