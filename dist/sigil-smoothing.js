export function smoothSigilMesh(mesh,settings,report=()=>{}){
  if(!settings.smoothMesh)return mesh;
  const {index}=mesh,count=mesh.position.length/3,edges=new Map(),locked=new Uint8Array(count),cosine=Math.cos(settings.smoothAngle*Math.PI/180),numericKeys=count*count<=Number.MAX_SAFE_INTEGER;
  const original=mesh.position,position=new Float64Array(original),key=(a,b)=>numericKeys?Math.min(a,b)*count+Math.max(a,b):`${Math.min(a,b)},${Math.max(a,b)}`;
  const edgeA=new Uint32Array(index.length),edgeB=new Uint32Array(index.length),firstFace=new Uint32Array(index.length),faceCounts=new Uint8Array(index.length),faceNormals=new Float64Array(index.length),degrees=new Uint32Array(count);let edgeCount=0;
  function face(a,b,c,p){const ax=p[b*3]-p[a*3],ay=p[b*3+1]-p[a*3+1],az=p[b*3+2]-p[a*3+2],bx=p[c*3]-p[a*3],by=p[c*3+1]-p[a*3+1],bz=p[c*3+2]-p[a*3+2];return [ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];}
  function edge(x,y,faceIndex){const name=key(x,y),existing=edges.get(name);
    if(existing===undefined){const id=edgeCount++;edges.set(name,id);edgeA[id]=x;edgeB[id]=y;firstFace[id]=faceIndex;faceCounts[id]=1;degrees[x]++;degrees[y]++;}
    else{faceCounts[existing]=Math.min(255,faceCounts[existing]+1);const first=firstFace[existing];if(faceNormals[first]*faceNormals[faceIndex]+faceNormals[first+1]*faceNormals[faceIndex+1]+faceNormals[first+2]*faceNormals[faceIndex+2]<cosine-1e-6)locked[x]=locked[y]=1;}
  }
  for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2],n=face(a,b,c,position),length=Math.hypot(...n)||1;for(let k=0;k<3;k++)faceNormals[i+k]=n[k]/length;edge(a,b,i);edge(b,c,i);edge(c,a,i);}
  // Compact adjacency retains the original first-seen neighbor order, so the
  // smoothing result stays identical while avoiding a Set per vertex.
  const offsets=new Uint32Array(count+1);for(let i=0;i<count;i++)offsets[i+1]=offsets[i]+degrees[i];
  const neighbors=new Uint32Array(edgeCount*2),cursor=offsets.slice();
  for(let i=0;i<edgeCount;i++){const a=edgeA[i],b=edgeB[i];neighbors[cursor[a]++]=b;neighbors[cursor[b]++]=a;if(faceCounts[i]!==2)locked[a]=locked[b]=1;}
  edges.clear();let current=position,next=new Float64Array(position);
  function pass(amount){for(let i=0;i<count;i++){
    if(locked[i]||!degrees[i])continue;let x=0,y=0,z=0;
    for(let k=offsets[i];k<offsets[i+1];k++){const j=neighbors[k]*3;x+=current[j];y+=current[j+1];z+=current[j+2];}
    const j=i*3;next[j]=current[j]+amount*(x/degrees[i]-current[j]);next[j+1]=current[j+1]+amount*(y/degrees[i]-current[j+1]);next[j+2]=current[j+2]+amount*(z/degrees[i]-current[j+2]);
  }const swap=current;current=next;next=swap;}
  for(let i=0;i<settings.smoothPasses;i++){pass(settings.smoothStrength);if(settings.smoothVolume)pass(-settings.smoothStrength/(1-.1*settings.smoothStrength));report({phase:'Smoothing while preserving sharp features',progress:96+Math.round((i+1)/settings.smoothPasses*3)});}
  const normal=new Float32Array(mesh.normal.length);
  for(let i=0;i<index.length;i+=3){const ids=[index[i],index[i+1],index[i+2]],n=face(...ids,current);for(const id of ids)for(let k=0;k<3;k++)normal[id*3+k]+=n[k];}
  let moved=0,protectedVertices=0;
  for(let i=0;i<count;i++){if(locked[i]){protectedVertices++;normal.set(mesh.normal.subarray(i*3,i*3+3),i*3);}else{const length=Math.hypot(normal[i*3],normal[i*3+1],normal[i*3+2])||1;for(let k=0;k<3;k++)normal[i*3+k]/=length;}if(Math.hypot(current[i*3]-original[i*3],current[i*3+1]-original[i*3+1],current[i*3+2]-original[i*3+2])>1e-8)moved++;}
  return {...mesh,position:new Float32Array(current),normal,smoothing:{moved,protectedVertices}};
}
