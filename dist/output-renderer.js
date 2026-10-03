import * as THREE from 'three';
import {validateOutput,outputDimensions} from './output-settings.js';
import {framedCamera,sourceFrame,warpFramedBuffers} from './output-frame.js?v=crease-flow-1';
import {isLens} from './lenses.js?v=crease-flow-1';
import {outputTiles,tileCamera,packedBuffers,packTile,warpPackedBuffers} from './output-tiles.js?v=crease-flow-1';

const aborted=()=>new DOMException('Image render cancelled.','AbortError');
export async function renderOutput(engine,capture,value,{preview=false,signal,onProgress}={}){
  const settings=validateOutput(value),{width:w,height:h}=outputDimensions(settings,preview);
  const limit=Math.min(engine.renderer.capabilities.maxTextureSize,engine.renderer.getContext().getParameter(engine.renderer.getContext().MAX_RENDERBUFFER_SIZE));
  if(signal?.aborted)throw aborted();engine.scene.updateMatrixWorld(true);
  const frame=sourceFrame(capture,settings,engine.models),camera=framedCamera(capture.camera,frame,w/h);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');if(!context)throw new Error('The image canvas could not be created.');
  const tiled=w*h>16777216||Math.max(w,h)>limit||capture.mode==='solid',edge=tiled?Math.max(1,Math.min(2048,limit)):Math.max(w,h);
  const tiles=[...outputTiles(w,h,edge)],target=new THREE.WebGLRenderTarget(tiles[0].width,tiles[0].height,{count:capture.mode==='hatch'?3:1,type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
  let buffers;
  try{
    if(capture.mode==='hatch'){
      if(!tiled)buffers=engine.geometryBuffers(camera,w,h,target);
      else{
        buffers=packedBuffers(w,h,engine.models.some(entry=>entry.visible&&engine.styleFor(entry).hardContour),engine.hasFlowBarriers?.()||false,engine.hasSurfaceCross?.()||false);
        // Rotation is already applied on the surface, including when cross-hatching is off.
        buffers.surfaceCross=true;let completed=0;
        for(const tile of tiles){
          if(signal?.aborted)throw aborted();target.setSize(tile.width,tile.height);
          packTile(buffers,engine.geometryBuffers(tileCamera(camera,w,h,tile),tile.width,tile.height,target),w,h,tile);
          onProgress?.(`Preparing image · ${++completed} / ${tiles.length} tiles`);await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
    }else{
      target.texture.colorSpace=THREE.SRGBColorSpace;const distorted=isLens(capture.lens.projection),colors=distorted?new Uint8Array(w*h*4):null;let completed=0;
      for(const tile of tiles){
        if(signal?.aborted)throw aborted();target.setSize(tile.width,tile.height);const pixels=renderColor(engine,tileCamera(camera,w,h,tile),tile.width,tile.height,target),image=new ImageData(tile.width,tile.height);
        for(let y=0;y<tile.height;y++){
          const row=pixels.subarray(y*tile.width*4,(y+1)*tile.width*4);
          if(colors)colors.set(row,((tile.y+y)*w+tile.x)*4);else image.data.set(row,(tile.height-1-y)*tile.width*4);
        }
        if(!colors)context.putImageData(image,tile.x,h-tile.y-tile.height);
        onProgress?.(`Preparing image · ${++completed} / ${tiles.length} tiles`);await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(colors)buffers={normal:colors,field:new Uint8Array(0),depth:null};
    }
  }finally{target.dispose();}
  const hasFlowBarriers=!!buffers?.hasFlowBarriers||!!buffers?.barrier;
  const surfaceCross=!!buffers?.surfaceCross||!!buffers?.crossField;
  if(buffers)buffers=buffers.packed?warpPackedBuffers(buffers,w,h,capture,settings,frame):warpFramedBuffers(buffers.normal,buffers.field,buffers.depth,w,h,capture,settings,frame);
  if(signal?.aborted)throw aborted();
  if(capture.mode==='solid'){
    if(buffers){const image=new ImageData(w,h);for(let y=0;y<h;y++)image.data.set(buffers.normal.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);context.putImageData(image,0,0);}
    context.globalCompositeOperation='destination-over';context.fillStyle=engine.params.paper;context.fillRect(0,0,w,h);return {canvas,lines:0,ms:0};
  }
  const scale=settings.strokes==='pixels'?1:h/capture.referenceHeight*settings.zoom;
  const worker=new Worker(new URL('./hatch-worker.js?v=crease-flow-1',import.meta.url),{type:'module'});
  onProgress?.(`Tracing ${w} × ${h} px…`);
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);},cancel=()=>{cleanup();reject(aborted());};signal?.addEventListener('abort',cancel,{once:true});
    worker.onerror=e=>{cleanup();reject(new Error(e.message||'Image rendering failed.'));};
    worker.onmessage=({data})=>{cleanup();if(data.error)return reject(new Error(data.error));context.drawImage(data.bitmap,0,0);data.bitmap.close();resolve({canvas,lines:data.lines,hardEdges:data.hardEdges,ms:data.ms});};
    worker.postMessage({id:0,width:w,height:h,scale,...buffers,hasFlowBarriers,surfaceCross,far:camera.far,params:{...engine.params},objectParams:engine.models.map(entry=>({...engine.styleFor(entry)}))},[(buffers.packed?buffers.mask:buffers.normal).buffer,buffers.field.buffer,buffers.depth.buffer,...(buffers.hard?[buffers.hard.buffer]:[]),...(buffers.barrier?[buffers.barrier.buffer]:[]),...(buffers.crossField?[buffers.crossField.buffer]:[])]);
  });
}

function renderColor(engine,camera,w,h,target){
  const pixels=new Uint8Array(w*h*4),r=engine.renderer,clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear,oldTarget=r.getRenderTarget();
  try{r.setRenderTarget(target);r.setClearColor(engine.params.paper,0);r.autoClear=true;r.render(engine.scene,camera);r.readRenderTargetPixels(target,0,0,w,h,pixels);}
  finally{r.setRenderTarget(oldTarget);r.setClearColor(clear,alpha);r.autoClear=auto;}return pixels;
}
