import { buildSigil } from './sigil-geometry.js?v=sigil-performance-1';
const cache={};
self.onmessage=({data})=>{
  try{
    const mesh=buildSigil(data.design,progress=>self.postMessage({id:data.id,...progress}),cache);
    // Transfer the result while retaining a bounded unsmoothed surface for finish
    // edits. Only buffers shared with that cache need a copy.
    const result={...mesh};for(const key of ['position','normal','index'])if(mesh[key]===cache.mesh?.[key])result[key]=mesh[key].slice();
    self.postMessage({id:data.id,mesh:result},[result.position.buffer,result.normal.buffer,result.index.buffer]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
