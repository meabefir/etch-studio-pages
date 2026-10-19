const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Graft a swept thorn into a small opening in its parent's surface. The shaft
// never enters a union field, so crossings cannot weld to neighboring growth.
export function graftThorns(surface,groups,thorns,settings,report=()=>{}){
  const {owners,step}=surface,index=surface.index.slice(),vertexCount=surface.position.length/3,faceCount=index.length/3;
  const position=Array.from(surface.position),triangles=[],removed=new Uint8Array(faceCount),reserved=new Uint8Array(vertexCount),neighbors=new Int32Array(index.length).fill(-1),sameDirection=new Uint8Array(index.length),faceOwner=new Uint32Array(faceCount),centers=new Float32Array(index.length),faceNormals=new Float32Array(index.length),edges=new Map(),bins=new Map();
  const cell=Math.max(step*8,.04),binKey=(x,y,z)=>`${x},${y},${z}`,edgeKey=(a,b)=>Math.min(a,b)*vertexCount+Math.max(a,b),point=id=>position.slice(id*3,id*3+3),parentIds=new Map(groups.map((group,i)=>[group,i+1]));
  const boxQuery=(min,max)=>{const result=new Set(),low=min.map(v=>Math.floor(v/cell)),high=max.map(v=>Math.floor(v/cell)),volume=high.reduce((n,v,i)=>n*(v-low[i]+1),1);
    if(volume>bins.size*2){for(const [key,faces]of bins){const p=key.split(',').map(Number);if(p.every((v,i)=>v>=low[i]&&v<=high[i]))for(const id of faces)result.add(id);}}
    else for(let z=low[2];z<=high[2];z++)for(let y=low[1];y<=high[1];y++)for(let x=low[0];x<=high[0];x++)for(const id of bins.get(binKey(x,y,z))||[])result.add(id);return result;};
  for(let face=0;face<faceCount;face++){
    const i=face*3,ids=[index[i],index[i+1],index[i+2]],p=ids.map(point),normal=unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));
    faceNormals.set(normal,i);centers.set(p[0].map((v,k)=>(v+p[1][k]+p[2][k])/3),i);
    const a=owners[ids[0]],b=owners[ids[1]],c=owners[ids[2]];faceOwner[face]=a===b||a===c?a:b===c?b:0;
    for(let k=0;k<3;k++){const key=edgeKey(ids[k],ids[(k+1)%3]),previous=edges.get(key);if(previous!==undefined){neighbors[i+k]=Math.floor(previous/3);neighbors[previous]=face;sameDirection[i+k]=sameDirection[previous]=Number(index[previous]===ids[k]);}else edges.set(key,i+k);}
    if(groups[faceOwner[face]-1]?.profile!=='stem')continue;
    const min=p[0].map((v,k)=>Math.floor(Math.min(v,p[1][k],p[2][k])/cell)),max=p[0].map((v,k)=>Math.floor(Math.max(v,p[1][k],p[2][k])/cell));
    for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++)for(let x=min[0];x<=max[0];x++){const key=binKey(x,y,z);let bin=bins.get(key);if(!bin)bins.set(key,bin=[]);bin.push(face);}
  }
  edges.clear();
  // Near-zero implicit triangles can acquire a noisy gradient winding. Orient
  // each connected shell before cutting holes so every graft has a true seam.
  const flips=new Int8Array(faceCount).fill(-1);
  for(let seed=0;seed<faceCount;seed++)if(flips[seed]<0){const queue=[seed];flips[seed]=0;let outward=0;
    for(let n=0;n<queue.length;n++){const face=queue[n],i=face*3;let alignment=0;for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++)alignment+=faceNormals[i+axis]*surface.normal[index[i+k]*3+axis];outward+=alignment*(flips[face]?-1:1);
      for(let k=0;k<3;k++){const other=neighbors[i+k];if(other>=0&&flips[other]<0){flips[other]=flips[face]^sameDirection[i+k];queue.push(other);}}}
    if(outward<0)for(const face of queue)flips[face]^=1;
  }
  for(let face=0;face<faceCount;face++)if(flips[face]){const i=face*3;[index[i+1],index[i+2]]=[index[i+2],index[i+1]];[neighbors[i],neighbors[i+2]]=[neighbors[i+2],neighbors[i]];for(let k=0;k<3;k++)faceNormals[i+k]*=-1;}
  const available=(face,parent)=>face>=0&&!removed[face]&&faceOwner[face]===parent&&!reserved[index[face*3]]&&!reserved[index[face*3+1]]&&!reserved[index[face*3+2]];
  function rayFace(origin,direction,face){
    const a=point(index[face*3]),b=point(index[face*3+1]),c=point(index[face*3+2]),ab=sub(b,a),ac=sub(c,a),p=cross(direction,ac),det=dot(ab,p);if(Math.abs(det)<1e-12)return null;
    const t=sub(origin,a),u=dot(t,p)/det;if(u< -1e-6||u>1.000001)return null;const q=cross(t,ab),v=dot(direction,q)/det;if(v< -1e-6||u+v>1.000001)return null;
    const distance=dot(ac,q)/det;return distance>=-1e-8?Math.max(0,distance):null;
  }
  function rootFor(group,parent){
    const points=group.points,reach=group.attachment.r*Math.max(1,group.parent.flatten)*3+group.points[0].r+group.settings.blend*2+step*4;
    for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j],delta=sub(b.p,a.p),length=Math.hypot(...delta);if(length<1e-9)continue;
      if(Math.hypot(...sub(a.p,group.attachment.p))>reach)break;
      const direction=mul(delta,1/length),min=a.p.map((v,k)=>Math.min(v,b.p[k])-step),max=a.p.map((v,k)=>Math.max(v,b.p[k])+step);let best=null;
      for(const face of boxQuery(min,max)){if(!available(face,parent)||dot(faceNormals.subarray(face*3,face*3+3),direction)<.01)continue;const distance=rayFace(a.p,direction,face);if(distance===null||distance>length+1e-7||best&&distance>=best.distance)continue;best={face,distance,p:add(a.p,mul(direction,distance)),arc:a.arc+(b.arc-a.arc)*distance/length};}
      if(best)return best;
    }
    const origin=group.attachment.p,direction=unit(group.attachment.direction),tip=add(origin,mul(direction,reach)),min=origin.map((v,k)=>Math.min(v,tip[k])-step*2),max=origin.map((v,k)=>Math.max(v,tip[k])+step*2);let best=null;
    for(const face of boxQuery(min,max)){if(!available(face,parent)||dot(faceNormals.subarray(face*3,face*3+3),direction)<.05)continue;const distance=rayFace(origin,direction,face);if(distance===null||distance>reach||best&&distance>=best.distance)continue;best={face,distance,p:add(origin,mul(direction,distance)),arc:0};}
    if(!best){
      // A junction or a previously placed root can hide the exact ray hit. Use
      // a nearby exposed face of this parent, never a neighboring curve's face.
      const expected=add(origin,mul(direction,group.attachment.r)),low=origin.map(v=>v-reach),high=origin.map(v=>v+reach);let score=Infinity;
      for(const face of boxQuery(low,high)){if(!available(face,parent)||dot(faceNormals.subarray(face*3,face*3+3),direction)<.1)continue;const p=Array.from(centers.subarray(face*3,face*3+3)),offset=sub(p,expected),distance=dot(offset,offset);if(distance<score&&distance<reach*reach){score=distance;best={face,p,arc:0};}}
    }
    if(best){let score=Infinity;for(const p of points){const distance=Math.hypot(...sub(p.p,best.p));if(distance<score){score=distance;best.arc=p.arc;}}}
    return best;
  }
  function boundary(patch){
    const next=new Map(),incoming=new Set();
    for(const face of patch)for(let k=0;k<3;k++)if(!patch.has(neighbors[face*3+k])){const a=index[face*3+k],b=index[face*3+(k+1)%3];if(next.has(a)||incoming.has(b))return null;next.set(a,b);incoming.add(b);}
    if(next.size<3)return null;const start=next.keys().next().value,loop=[];let at=start;
    do{if(at===undefined||loop.length>=next.size)return null;loop.push(at);at=next.get(at);}while(at!==start);
    return loop.length===next.size?loop:null;
  }
  function patchFor(root,group,parent){
    const radius=Math.max(step*.7,Math.min(group.points[0].r,group.attachment.r*.65)),patch=new Set([root.face]),queue=[root.face],normal=faceNormals.subarray(root.face*3,root.face*3+3);
    for(let n=0;n<queue.length;n++)for(let k=0;k<3;k++){const face=neighbors[queue[n]*3+k];if(patch.has(face)||!available(face,parent))continue;const offset=sub(centers.subarray(face*3,face*3+3),root.p),axial=dot(offset,normal);if(dot(faceNormals.subarray(face*3,face*3+3),normal)<.25||dot(offset,offset)-axial*axial>radius*radius||Math.abs(axial)>radius)continue;patch.add(face);queue.push(face);}
    let loop=boundary(patch);if(!loop){patch.clear();patch.add(root.face);loop=boundary(patch);}return {patch,loop};
  }
  function at(points,arc){
    let i=1;while(i<points.length-1&&points[i].arc<arc)i++;const a=points[i-1],b=points[i],t=clamp((arc-a.arc)/Math.max(1e-9,b.arc-a.arc),0,1),tangent=unit(mix(a.t,b.t,t)),raw=mix(a.n,b.n,t),normal=unit(sub(raw,mul(tangent,dot(raw,tangent))));
    return {p:mix(a.p,b.p,t),r:a.r+(b.r-a.r)*t,t:tangent,n:normal,b:unit(cross(tangent,normal)),arc};
  }
  const vertex=p=>{const id=position.length/3;position.push(...p);return id;},triangle=(a,b,c)=>triangles.push(a,b,c);
  function stitch(a,b,fractions=null){
    let i=0,j=0;while(i<a.length||j<b.length){const nextA=i<a.length?(fractions?fractions[i+1]:(i+1)/a.length):Infinity,nextB=j<b.length?(j+1)/b.length:Infinity;
      if(nextA<nextB-1e-10){triangle(a[i%a.length],a[(i+1)%a.length],b[j%b.length]);i++;}else if(nextB<nextA-1e-10){triangle(a[i%a.length],b[(j+1)%b.length],b[j%b.length]);j++;}else{triangle(a[i%a.length],a[(i+1)%a.length],b[(j+1)%b.length]);triangle(a[i%a.length],b[(j+1)%b.length],b[j%b.length]);i++;j++;}
    }
  }
  let attached=0,closedRoots=0;
  for(let gi=0;gi<thorns.length;gi++){
    const group=thorns[gi],points=group.points,parent=parentIds.get(group.parent),root=parent?rootFor(group,parent):null,total=points.at(-1).arc;
    const base=root&&root.arc<total-step*.05?patchFor(root,group,parent):null;
    const arc=base?.loop?root.arc:0,start=at(points,arc),remaining=total-arc,collar=Math.min(remaining*.2,Math.max(step*1.5,group.settings.blend)),firstArc=Math.min(total,arc+Math.max(remaining*.005,collar));
    const radial=Math.max(8,Math.min(64,Math.ceil(2*Math.PI*start.r*Math.max(1,group.flatten)/step))),samples=[at(points,firstArc),...points.filter(p=>p.arc>firstArc+1e-8)];if(samples.at(-1).arc<total-1e-8)samples.push(at(points,total));
    let previous=null,phase=0;
    if(base?.loop){
      previous=base.loop;const delta=sub(point(previous[0]),start.p);phase=Math.atan2(dot(delta,start.b)/group.flatten,dot(delta,start.n));
      const fractions=[0];for(let i=0;i<previous.length;i++)fractions.push(fractions.at(-1)+Math.hypot(...sub(point(previous[i]),point(previous[(i+1)%previous.length]))));for(let i=1;i<fractions.length;i++)fractions[i]/=fractions.at(-1);
      for(const face of base.patch){removed[face]=1;for(let k=0;k<3;k++)reserved[index[face*3+k]]=1;}base.fractions=fractions;attached++;
    }else{samples.unshift(start);closedRoots++;}
    for(let j=0;j<samples.length;j++){
      const sample=samples[j],frame=at(points,sample.arc),ring=[];
      for(let k=0;k<radial;k++){const angle=phase+k/radial*Math.PI*2;ring.push(vertex(add(sample.p,add(mul(frame.n,Math.cos(angle)*sample.r),mul(frame.b,Math.sin(angle)*sample.r*group.flatten)))));}
      if(previous)stitch(previous,ring,j===0&&base?.loop?base.fractions:null);else{const center=vertex(start.p);for(let k=0;k<radial;k++)triangle(center,ring[(k+1)%radial],ring[k]);}previous=ring;
    }
    const tip=vertex(add(points.at(-1).p,mul(points.at(-1).t,.001)));for(let k=0;k<previous.length;k++)triangle(previous[k],previous[(k+1)%previous.length],tip);
    if(surface.resolution.cells+position.length/3-vertexCount>settings.detailBudget)throw new Error('The mesh exceeds the detail budget. Increase Detail budget in Resolution & finish, or reduce mesh resolution.');
    if(gi%8===0)report({phase:'Joining thorn bases',progress:95+Math.round((gi+1)/thorns.length*1)});
  }
  const kept=index.length-removed.reduce((count,value)=>count+value,0)*3,result=new Uint32Array(kept+triangles.length);let count=0;for(let face=0;face<faceCount;face++)if(!removed[face])for(let k=0;k<3;k++)result[count++]=index[face*3+k];result.set(triangles,kept);
  const normal=new Float32Array(position.length);for(let i=0;i<result.length;i+=3){const a=result[i],b=result[i+1],c=result[i+2],n=cross(sub(point(b),point(a)),sub(point(c),point(a)));for(const id of [a,b,c])for(let k=0;k<3;k++)normal[id*3+k]+=n[k];}
  for(let i=0;i<normal.length;i+=3){const length=Math.hypot(normal[i],normal[i+1],normal[i+2])||1;normal[i]/=length;normal[i+1]/=length;normal[i+2]/=length;}
  const {owners:discard,...mesh}=surface,extra=position.length/3-vertexCount;return {...mesh,position:Float32Array.from(position),normal,index:result,triangles:result.length/3,resolution:{...surface.resolution,cells:surface.resolution.cells+extra,thornSamples:extra},thorns:{isolated:thorns.length,attached,closedRoots}};
}
