// Coincident positions share topology, but sharp face edges split surface fans.
self.onmessage=({data:{id,position,index}})=>{
  try{
    const count=position.length/3,triangles=index||Uint32Array.from({length:count},(_,i)=>i),corners=triangles.length,faces=corners/3;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<count;i++)for(let k=0;k<3;k++){const v=position[i*3+k];min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}
    const tolerance=Math.max(1e-9,Math.max(...max.map((v,k)=>v-min[k]))*1e-8),weld=new Map(),remap=new Uint32Array(count),points=[];
    for(let i=0;i<count;i++){
      const j=i*3,key=`${Math.round(position[j]/tolerance)},${Math.round(position[j+1]/tolerance)},${Math.round(position[j+2]/tolerance)}`;
      let v=weld.get(key);if(v===undefined){v=points.length/3;weld.set(key,v);points.push(position[j],position[j+1],position[j+2]);}remap[i]=v;
    }
    const weldedCount=points.length/3,parents=Uint32Array.from({length:corners},(_,i)=>i),planes=Uint32Array.from({length:faces},(_,i)=>i),faceNormals=new Float64Array(faces*3),areas=new Float64Array(faces),edges=new Map();
    const root=(array,i)=>{let r=i;while(array[r]!==r)r=array[r];while(array[i]!==i){const next=array[i];array[i]=r;i=next;}return r;};
    const join=(array,a,b)=>{a=root(array,a);b=root(array,b);if(a!==b)array[Math.max(a,b)]=Math.min(a,b);};
    const dotFaces=(a,b)=>faceNormals[a*3]*faceNormals[b*3]+faceNormals[a*3+1]*faceNormals[b*3+1]+faceNormals[a*3+2]*faceNormals[b*3+2];
    const nextCorner=c=>Math.floor(c/3)*3+(c+1)%3;
    for(let f=0;f<faces;f++){
      const a=triangles[f*3]*3,b=triangles[f*3+1]*3,c=triangles[f*3+2]*3;
      const ux=position[b]-position[a],uy=position[b+1]-position[a+1],uz=position[b+2]-position[a+2],vx=position[c]-position[a],vy=position[c+1]-position[a+1],vz=position[c+2]-position[a+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);areas[f]=length;
      if(length>0)faceNormals.set([nx/length,ny/length,nz/length],f*3);
      for(let k=0;k<3;k++){
        const corner=f*3+k,u=remap[triangles[corner]],v=remap[triangles[nextCorner(corner)]];if(u===v)continue;
        const key=Math.min(u,v)*weldedCount+Math.max(u,v);let edge=edges.get(key);if(!edge){edge=[];edges.set(key,edge);}edge.push(corner);
      }
    }
    const creaseCos=Math.cos(Math.PI/4);let creaseCount=0;
    for(const edge of edges.values()){
      let sharp=false;
      for(let i=0;i<edge.length;i++)for(let j=i+1;j<edge.length;j++){
        const a=edge[i],b=edge[j],fa=Math.floor(a/3),fb=Math.floor(b/3);if(!areas[fa]||!areas[fb])continue;
        const dot=dotFaces(fa,fb);if(dot<creaseCos-1e-7){sharp=true;continue;}
        const an=nextCorner(a),bn=nextCorner(b);
        if(remap[triangles[a]]===remap[triangles[b]]){join(parents,a,b);join(parents,an,bn);}else{join(parents,a,bn);join(parents,an,b);}
        if(dot>1-1e-7)join(planes,fa,fb);
      }
      if(sharp)creaseCount++;
    }
    const fanMap=new Map(),fans=new Uint32Array(corners),fanPositions=[],fanNormals=[],fanPlane=[];
    for(let c=0;c<corners;c++){
      const key=root(parents,c);let fan=fanMap.get(key);
      if(fan===undefined){fan=fanPositions.length/3;fanMap.set(key,fan);const p=triangles[c]*3;fanPositions.push(position[p],position[p+1],position[p+2]);fanNormals.push(0,0,0);fanPlane.push(root(planes,Math.floor(c/3)));}
      fans[c]=fan;
      const f=Math.floor(c/3),p=triangles[c]*3,a=triangles[nextCorner(c)]*3,b=triangles[Math.floor(c/3)*3+(c+2)%3]*3;
      const ux=position[a]-position[p],uy=position[a+1]-position[p+1],uz=position[a+2]-position[p+2],vx=position[b]-position[p],vy=position[b+1]-position[p+1],vz=position[b+2]-position[p+2];
      const length=Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz),angle=length?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy+uz*vz)/length))):0;
      for(let k=0;k<3;k++)fanNormals[fan*3+k]+=faceNormals[f*3+k]*angle;
      if(fanPlane[fan]!==root(planes,f))fanPlane[fan]=-1;
    }
    const n=fanPositions.length/3,normals=new Float64Array(fanNormals),degree=new Uint32Array(n);
    for(let i=0;i<n;i++){const j=i*3,length=Math.hypot(normals[j],normals[j+1],normals[j+2]);if(length)for(let k=0;k<3;k++)normals[j+k]/=length;else normals[j+1]=1;}
    // Use a single boundary-aligned direction for each truly planar patch.
    const planeNormals=new Float64Array(faces*3),planeValid=new Uint8Array(faces),planeGuides=new Map(),planeLengths=new Map();
    for(let f=0;f<faces;f++){const p=root(planes,f);planeValid[p]=1;for(let k=0;k<3;k++)planeNormals[p*3+k]+=faceNormals[f*3+k]*areas[f];}
    for(let f=0;f<faces;f++)if(planeValid[f]){const j=f*3,length=Math.hypot(planeNormals[j],planeNormals[j+1],planeNormals[j+2]);if(length)for(let k=0;k<3;k++)planeNormals[j+k]/=length;else planeValid[f]=0;}
    for(let f=0;f<faces;f++){const p=root(planes,f),j=f*3,k=p*3;if(faceNormals[j]*planeNormals[k]+faceNormals[j+1]*planeNormals[k+1]+faceNormals[j+2]*planeNormals[k+2]<1-1e-6)planeValid[p]=0;}
    function fallback(nx,ny,nz){let x=nz,y=0,z=-nx;if(Math.hypot(x,z)<.1){x=0;y=-nz;z=ny;}const length=Math.hypot(x,y,z)||1;return [x/length,y/length,z/length];}
    for(const edge of edges.values()){
      const patches=[...new Set(edge.map(c=>root(planes,Math.floor(c/3))))];if(edge.length>1&&patches.length===1)continue;
      const a=triangles[edge[0]]*3,b=triangles[nextCorner(edge[0])]*3,vector=[0,1,2].map(k=>position[b+k]-position[a+k]);
      for(const p of patches){if(!planeValid[p])continue;const j=p*3,dot=vector[0]*planeNormals[j]+vector[1]*planeNormals[j+1]+vector[2]*planeNormals[j+2],t=vector.map((v,k)=>v-dot*planeNormals[j+k]),length=Math.hypot(...t);if(!length)continue;
        const candidate=t.map(v=>v/length),basis=fallback(...planeNormals.subarray(j,j+3)),score=Math.abs(candidate.reduce((s,v,k)=>s+v*basis[k],0)),old=planeGuides.get(p),previous=planeLengths.get(p)||0,oldScore=old?Math.abs(old.reduce((s,v,k)=>s+v*basis[k],0)):-1;
        if(length>previous*(1+1e-5)||(Math.abs(length-previous)<=Math.max(1e-12,previous*1e-5)&&score>oldScore+1e-8)){planeGuides.set(p,candidate);planeLengths.set(p,length);}
      }
    }
    for(let f=0;f<faces;f++)for(let k=0;k<3;k++){const a=fans[f*3+k],b=fans[f*3+(k+1)%3];if(a!==b){degree[a]++;degree[b]++;}}
    const offsets=new Uint32Array(n+1);for(let i=0;i<n;i++)offsets[i+1]=offsets[i]+degree[i];
    const neighbors=new Uint32Array(offsets[n]),cursor=offsets.slice();
    for(let f=0;f<faces;f++)for(let k=0;k<3;k++){const a=fans[f*3+k],b=fans[f*3+(k+1)%3];if(a!==b){neighbors[cursor[a]++]=b;neighbors[cursor[b]++]=a;}}
    const dirs=new Float32Array(n*3),guides=new Float32Array(n*3),confidence=new Float32Array(n),flat=new Uint8Array(n);
    for(let i=0;i<n;i++){
      const j=i*3,nx=normals[j],ny=normals[j+1],nz=normals[j+2],patch=fanPlane[i];
      const basis=patch>=0&&planeValid[patch]?planeGuides.get(patch)||fallback(nx,ny,nz):fallback(nx,ny,nz);
      let [ux,uy,uz]=basis;const dot=ux*nx+uy*ny+uz*nz;ux-=dot*nx;uy-=dot*ny;uz-=dot*nz;const length=Math.hypot(ux,uy,uz)||1;ux/=length;uy/=length;uz/=length;
      guides.set([ux,uy,uz],j);
      if(patch>=0&&planeValid[patch]){dirs.set([ux,uy,uz],j);flat[i]=1;continue;}
      const vx=ny*uz-nz*uy,vy=nz*ux-nx*uz,vz=nx*uy-ny*ux;
      let xx=0,xy=0,yy=0,r0=0,r1=0,r2=0;
      for(let s=offsets[i];s<offsets[i+1];s++){
        const k=neighbors[s]*3;if(nx*normals[k]+ny*normals[k+1]+nz*normals[k+2]<.25)continue;
        const dx=fanPositions[k]-fanPositions[j],dy=fanPositions[k+1]-fanPositions[j+1],dz=fanPositions[k+2]-fanPositions[j+2],x=dx*ux+dy*uy+dz*uz,y=dx*vx+dy*vy+dz*vz;
        const dnx=normals[k]-nx,dny=normals[k+1]-ny,dnz=normals[k+2]-nz,a=dnx*ux+dny*uy+dnz*uz,b=dnx*vx+dny*vy+dnz*vz,weight=1/Math.max(1e-10,x*x+y*y);
        xx+=x*x*weight;xy+=x*y*weight;yy+=y*y*weight;r0+=x*a*weight;r1+=(y*a+x*b)*weight;r2+=y*b*weight;
      }
      const eps=1e-5,aa=xx+eps,cc=yy+eps,b=(r1-xy*r0/aa-xy*r2/cc)/Math.max(eps,xx+yy+eps-xy*xy/aa-xy*xy/cc),a=(r0-xy*b)/aa,c=(r2-xy*b)/cc;
      const delta=Math.hypot(a-c,2*b),k1=(a+c+delta)*.5,k2=(a+c-delta)*.5;let angle=.5*Math.atan2(2*b,a-c);if(Math.abs(k1)>Math.abs(k2))angle+=Math.PI/2;
      const co=Math.cos(angle),si=Math.sin(angle);dirs.set([ux*co+vx*si,uy*co+vy*si,uz*co+vz*si],j);confidence[i]=Math.min(1,delta/(Math.abs(k1)+Math.abs(k2)+.08));
    }
    let smoothed=dirs;
    for(let pass=0;pass<3;pass++){
      const next=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const j=i*3;if(flat[i]){next.set(guides.subarray(j,j+3),j);continue;}
        const nx=normals[j],ny=normals[j+1],nz=normals[j+2];let x=smoothed[j]*3,y=smoothed[j+1]*3,z=smoothed[j+2]*3;
        for(let s=offsets[i];s<offsets[i+1];s++){const k=neighbors[s]*3;if(nx*normals[k]+ny*normals[k+1]+nz*normals[k+2]<.75)continue;const sign=smoothed[j]*smoothed[k]+smoothed[j+1]*smoothed[k+1]+smoothed[j+2]*smoothed[k+2]<0?-1:1,w=.5*sign;x+=smoothed[k]*w;y+=smoothed[k+1]*w;z+=smoothed[k+2]*w;}
        const dot=x*nx+y*ny+z*nz;x-=dot*nx;y-=dot*ny;z-=dot*nz;const length=Math.hypot(x,y,z)||1;next.set([x/length,y/length,z/length],j);
      }smoothed=next;
    }
    // Only split vertices shared by different fans; preserve attribute seams.
    const vertices=new Map(),sources=[],fanSources=[],outputIndex=new Uint32Array(corners);
    for(let c=0;c<corners;c++){const source=triangles[c],fan=fans[c],key=source*n+fan;let target=vertices.get(key);if(target===undefined){target=sources.length;vertices.set(key,target);sources.push(source);fanSources.push(fan);}outputIndex[c]=target;}
    const outputCount=sources.length,flow=new Float32Array(outputCount*3),guide=new Float32Array(flow.length),outputNormal=new Float32Array(flow.length),anisotropy=new Float32Array(outputCount),sourceIndex=new Uint32Array(sources);
    for(let i=0;i<outputCount;i++){const fan=fanSources[i],j=fan*3;flow.set(smoothed.subarray(j,j+3),i*3);guide.set(guides.subarray(j,j+3),i*3);outputNormal.set(normals.subarray(j,j+3),i*3);anisotropy[i]=confidence[fan];}
    self.postMessage({id,flow,guide,anisotropy,normal:outputNormal,sourceIndex,index:outputIndex,creaseCount},[flow.buffer,guide.buffer,anisotropy.buffer,outputNormal.buffer,sourceIndex.buffer,outputIndex.buffer]);
  }catch(error){self.postMessage({id,error:error.message});}
};
