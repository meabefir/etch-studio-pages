import { buildSigil } from './sigil-geometry.js';
self.onmessage=({data})=>{try{const mesh=buildSigil(data.design,progress=>self.postMessage({id:data.id,...progress}));self.postMessage({id:data.id,mesh},[mesh.position.buffer,mesh.normal.buffer,mesh.index.buffer]);}catch(error){self.postMessage({id:data.id,error:error.message});}};
