export function smoothSigilMesh(mesh,settings,report=()=>{}){
  if(!settings.smoothMesh)return mesh;
  const {index}=mesh,count=mesh.position.length/3,neighbors=Array.from({length:count},()=>new Set()),edges=new Map(),locked=new Uint8Array(count),cosine=Math.cos(settings.smoothAngle*Math.PI/180);
  const original=mesh.position,position=new Float64Array(original),key=(a,b)=>`${Math.min(a,b)},${Math.max(a,b)}`;
  function face(a,b,c,p){const ax=p[b*3]-p[a*3],ay=p[b*3+1]-p[a*3+1],az=p[b*3+2]-p[a*3+2],bx=p[c*3]-p[a*3],by=p[c*3+1]-p[a*3+1],bz=p[c*3+2]-p[a*3+2];return [ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];}
  for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2],n=face(a,b,c,position),length=Math.hypot(...n)||1;for(let k=0;k<3;k++)n[k]/=length;
    for(const [x,y]of [[a,b],[b,c],[c,a]]){neighbors[x].add(y);neighbors[y].add(x);const name=key(x,y),edge=edges.get(name);if(!edge)edges.set(name,{a:x,b:y,n,faces:1});else{edge.faces++;if(edge.n[0]*n[0]+edge.n[1]*n[1]+edge.n[2]*n[2]<cosine-1e-6)locked[x]=locked[y]=1;}}
  }
  for(const edge of edges.values())if(edge.faces!==2)locked[edge.a]=locked[edge.b]=1;
  let current=position;
  function pass(amount){const next=new Float64Array(current);for(let i=0;i<count;i++){if(locked[i]||!neighbors[i].size)continue;const sum=[0,0,0];for(const j of neighbors[i])for(let k=0;k<3;k++)sum[k]+=current[j*3+k];for(let k=0;k<3;k++)next[i*3+k]=current[i*3+k]+amount*(sum[k]/neighbors[i].size-current[i*3+k]);}current=next;}
  for(let i=0;i<settings.smoothPasses;i++){pass(settings.smoothStrength);if(settings.smoothVolume)pass(-settings.smoothStrength/(1-.1*settings.smoothStrength));report({phase:'Smoothing while preserving sharp features',progress:96+Math.round((i+1)/settings.smoothPasses*3)});}
  const normal=new Float32Array(mesh.normal.length);
  for(let i=0;i<index.length;i+=3){const ids=[index[i],index[i+1],index[i+2]],n=face(...ids,current);for(const id of ids)for(let k=0;k<3;k++)normal[id*3+k]+=n[k];}
  let moved=0,protectedVertices=0;
  for(let i=0;i<count;i++){if(locked[i]){protectedVertices++;normal.set(mesh.normal.subarray(i*3,i*3+3),i*3);}else{const length=Math.hypot(normal[i*3],normal[i*3+1],normal[i*3+2])||1;for(let k=0;k<3;k++)normal[i*3+k]/=length;}if(Math.hypot(current[i*3]-original[i*3],current[i*3+1]-original[i*3+1],current[i*3+2]-original[i*3+2])>1e-8)moved++;}
  return {...mesh,position:new Float32Array(current),normal,smoothing:{moved,protectedVertices}};
}
