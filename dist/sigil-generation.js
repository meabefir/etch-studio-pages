const previewKeys=new Set(['live','showCurves','showAxes','lockRotation','color','metalness','roughness']);
const smoothingKeys=new Set(['smoothMesh','smoothAngle','smoothStrength','smoothPasses','smoothVolume']);
export const SIGIL_CACHE_BYTES=64*1024*1024;
export const sigilMeshBytes=mesh=>mesh.position.byteLength+mesh.normal.byteLength+mesh.index.byteLength;

// Names, handle coupling and display options do not alter the generated mesh.
// Resolved pole references and all geometry parameters remain part of the key.
export function sigilMeshKey(design,surfaceOnly=false){
  const settings=Object.fromEntries(Object.entries(design.settings).filter(([key])=>!previewKeys.has(key)&&!(surfaceOnly&&(smoothingKeys.has(key)||key==='detailBudget'))&&!(!design.settings.smoothMesh&&smoothingKeys.has(key)&&key!=='smoothMesh')));
  return JSON.stringify([settings,design.curves.map(curve=>[curve.id,curve.settings,curve.nodes.map(n=>[n.id,n.p,n.in,n.out,n.radius,n.link,n.inheritRadius])])]);
}

// Bound the extra memory held for reopening editors. These are original meshes,
// before the scene renderer prepares their geometry for hatching.
const previews=new Map();let previewBytes=0;
export function rememberSigilMesh(entry,mesh){
  const previous=previews.get(entry);if(previous){previewBytes-=previous.bytes;previews.delete(entry);}
  const bytes=sigilMeshBytes(mesh);if(bytes>SIGIL_CACHE_BYTES)return;
  while(previewBytes+bytes>SIGIL_CACHE_BYTES||previews.size>=4){const first=previews.keys().next().value;previewBytes-=previews.get(first).bytes;previews.delete(first);}
  previews.set(entry,{key:sigilMeshKey(entry.source.design),mesh,bytes});previewBytes+=bytes;
}
export function cachedSigilMesh(entry){const cached=previews.get(entry);if(!cached||cached.key!==sigilMeshKey(entry.source.design))return null;previews.delete(entry);previews.set(entry,cached);return cached.mesh;}
