const B=8,N=B**3,L=B+1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],offset=[0,1,L+1,L,L*L,L*L+1,L*L+L+1,L*L+L];
// Prepare identical tetrahedron cases once, avoiding per-cell temporary arrays.
const cases=Array.from({length:16},(_,mask)=>{
  const inside=[],outside=[];for(let i=0;i<4;i++)(mask&(1<<i)?inside:outside).push(i);
  if(inside.length===1)return outside.map(b=>[inside[0],b]);
  if(inside.length===3)return inside.map(b=>[outside[0],b]);
  if(inside.length===2){const [a,b]=inside,[c,d]=outside;return [[a,c],[a,d],[b,c],[b,d]];}return [];
});
// Only occupied blocks exist. Shared lattice nodes and tetrahedra keep tips
// and joins closed, including across block boundaries.
export function buildSparseSurface(groups,s,resolution,report){
  const variableBlend=groups.some(g=>g.settings&&g.settings.blend!==s.blend),step=resolution.step,blocks=new Map(),pages=[],key=(x,y,z)=>`${x},${y},${z}`;
  function page(x,y,z){const name=key(x,y,z);let block=blocks.get(name);if(!block){
    if((pages.length+1)*N>(s.detailBudget??9000000))throw new Error('The occupied mesh regions exceed the detail budget. Increase Detail budget in Resolution & finish, or reduce mesh resolution or Maximum detail boost.');
    block={x,y,z,id:pages.length,field:new Float32Array(N).fill(1000),blends:variableBlend?new Float32Array(N):null,temp:new Float32Array(N),marks:new Uint32Array(N),group:0,touched:[]};pages.push(block);blocks.set(name,block);
  }return block;}
  const blockRadius=Math.sqrt(3)*(B-1)*step*.5;
  report({phase:'Sampling occupied regions',progress:0});
  for(let gi=0;gi<groups.length;gi++){
    const group=groups[gi],style=group.settings||s,groupId=gi+1,touchedBlocks=[],stem=group.profile==='stem';
    const flatten=group.flatten,minFlatten=Math.min(1,flatten),maxFlatten=Math.max(1,flatten);
    const twist=stem?style.twist*Math.PI*2:0,ripple=stem&&style.ripple&&style.rippleAmplitude!==0,ridges=stem&&style.ridges!==0&&style.ridgeDepth!==0,bark=stem&&style.bark!==0;
    const rippleFrequency=Math.PI*2*style.rippleFrequency,ripplePhase=style.ripplePhase*Math.PI/180,ridgeTwist=style.ridgeTwist*Math.PI*2;
    const radiusFactor=(ripple?1+style.rippleAmplitude:1)*(ridges?1+style.ridgeDepth:1)*(bark?1+style.bark*.7:1);
    for(let segment=0;segment<group.points.length-1;segment++){
      const a=group.points[segment],b=group.points[segment+1],ax=a.p[0],ay=a.p[1],az=a.p[2],dx=b.p[0]-ax,dy=b.p[1]-ay,dz=b.p[2]-az,len2=dx*dx+dy*dy+dz*dz,hasLength=len2>1e-8,len=Math.sqrt(len2);
      const tx=hasLength?dx/len:a.t[0],ty=hasLength?dy/len:a.t[1],tz=hasLength?dz/len:a.t[2],projection=a.n[0]*tx+a.n[1]*ty+a.n[2]*tz;
      let nx=a.n[0]-tx*projection,ny=a.n[1]-ty*projection,nz=a.n[2]-tz*projection;
      const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;if(Math.hypot(nx,ny,nz)<.01){nx=a.n[0];ny=a.n[1];nz=a.n[2];}
      let bnx=ty*nz-tz*ny,bny=tz*nx-tx*nz,bnz=tx*ny-ty*nx;const bl=Math.hypot(bnx,bny,bnz)||1;bnx/=bl;bny/=bl;bnz/=bl;
      // Abrupt reversals can produce a nearly degenerate frame. Account for its
      // smallest stretch so the early distance bound remains conservative.
      const basisScale=Math.sqrt(Math.max(0,1-Math.abs(nx*tx+ny*ty+nz*tz)-1e-12));
      const radius=Math.max(a.r,b.r)*(1+style.rippleAmplitude)*(1+style.ridgeDepth)*(1+style.bark)*maxFlatten+style.blend/minFlatten+step*2,maxRadius=Math.max(a.r,b.r)*radiusFactor,dr=b.r-a.r,du=b.u-a.u;
      const lx=Math.floor((Math.min(ax,b.p[0])-radius)/step),hx=Math.ceil((Math.max(ax,b.p[0])+radius)/step),ly=Math.floor((Math.min(ay,b.p[1])-radius)/step),hy=Math.ceil((Math.max(ay,b.p[1])+radius)/step),lz=Math.floor((Math.min(az,b.p[2])-radius)/step),hz=Math.ceil((Math.max(az,b.p[2])+radius)/step),rejectRadius2=(radius+blockRadius)**2;
      for(let bz=Math.floor(lz/B);bz<=Math.floor(hz/B);bz++)for(let by=Math.floor(ly/B);by<=Math.floor(hy/B);by++)for(let bx=Math.floor(lx/B);bx<=Math.floor(hx/B);bx++){
        const cx=(bx*B+(B-1)*.5)*step-ax,cy=(by*B+(B-1)*.5)*step-ay,cz=(bz*B+(B-1)*.5)*step-az,along=hasLength?clamp((cx*dx+cy*dy+cz*dz)/len2,0,1):0,rx=cx-dx*along,ry=cy-dy*along,rz=cz-dz*along;
        if(rx*rx+ry*ry+rz*rz>rejectRadius2)continue;
        const block=page(bx,by,bz);if(block.group!==groupId){block.group=groupId;block.touched=[];touchedBlocks.push(block);}
        const x0=Math.max(lx,bx*B),x1=Math.min(hx,bx*B+B-1),y0=Math.max(ly,by*B),y1=Math.min(hy,by*B+B-1),z0=Math.max(lz,bz*B),z1=Math.min(hz,bz*B+B-1),{marks,temp,touched}=block;
        for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++){
          const py=y*step-ay,pz=z*step-az,row=((z-bz*B)*B+y-by*B)*B-bx*B;
          for(let x=x0;x<=x1;x++){
            const px=x*step-ax,t=hasLength?clamp((px*dx+py*dy+pz*dz)/len2,0,1):0,vx=px-dx*t,vy=py-dy*t,vz=pz-dz*t,i=row+x,seen=marks[i]===groupId;
            // Skip a segment only when even its largest profile cannot improve
            // the existing minimum. Sampling envelopes and blend order stay fixed.
            if(seen&&basisScale>0){const reach=(temp[i]/minFlatten+maxRadius)*maxFlatten/basisScale+1e-10;if(reach<0||vx*vx+vy*vy+vz*vz>reach*reach)continue;}
            const rawN=vx*nx+vy*ny+vz*nz,rawB=vx*bnx+vy*bny+vz*bnz,axial=vx*tx+vy*ty+vz*tz,u=a.u+du*t;let n=rawN,bn=rawB;
            if(twist){const rotation=u*twist,cs=Math.cos(rotation),sn=Math.sin(rotation);n=rawN*cs+rawB*sn;bn=-rawN*sn+rawB*cs;}bn/=flatten;let r=a.r+dr*t;
            const distance2=n*n+bn*bn+axial*axial;
            if(seen){const reach=temp[i]/minFlatten+(stem?maxRadius:r)+1e-10;if(reach<0||distance2>reach*reach)continue;}
            if(ripple){const wave=Math.sin(u*rippleFrequency+ripplePhase);r*=1+style.rippleAmplitude*Math.sign(wave)*Math.abs(wave)**style.rippleSharpness;}
            if(ridges||bark){const theta=Math.atan2(bn,n);if(ridges)r*=1+style.ridgeDepth*Math.cos(style.ridges*theta+u*ridgeTwist);if(bark)r*=1+style.bark*Math.sin(u*style.barkFrequency*6.283+style.seed)*Math.sin(theta*5+u*style.barkFrequency*2.3)*.7;}
            const d=(Math.sqrt(distance2)-r)*minFlatten;if(!seen){marks[i]=groupId;temp[i]=d;touched.push(i);}else if(d<temp[i])temp[i]=d;
          }
        }
      }
    }
    for(const block of touchedBlocks)for(const i of block.touched){let d=block.temp[i];
      if(group.clip){const x=(block.x*B+i%B)*step,y=(block.y*B+Math.floor(i/B)%B)*step,z=(block.z*B+Math.floor(i/(B*B)))*step;for(const cap of group.clip)if(cap){const dx=x-cap.p[0],dy=y-cap.p[1],dz=z-cap.p[2];if(Math.hypot(dx,dy,dz)<cap.r*2+step*2)d=Math.max(d,dx*cap.t[0]+dy*cap.t[1]+dz*cap.t[2]);}}
      const previous=block.field[i],k=variableBlend?Math.min(style.blend,block.blends[i]):style.blend;if(k>0&&previous<999){const h=Math.max(k-Math.abs(previous-d),0)/k;block.field[i]=Math.min(previous,d)-h*h*k*.25;}else block.field[i]=Math.min(previous,d);if(variableBlend&&d<previous)block.blends[i]=style.blend;
    }
    if(gi%8===0)report({phase:'Sampling occupied regions',progress:Math.round((gi+1)/groups.length*55)});
  }
  let sampledNodes=0;for(const block of pages){for(const mark of block.marks)sampledNodes+=mark>0;block.temp=null;block.marks=null;block.touched=null;block.blends=null;}
  let positions=new Float64Array(65536*3),normals=new Float64Array(65536*3),indices=new Uint32Array(65536*6),vertexCount=0,indexCount=0;
  const edges=new Map(),gradients=new Map(),total=pages.length*N,numericEdges=total*total<=Number.MAX_SAFE_INTEGER;
  const sampleValue=(x,y,z)=>{const bx=Math.floor(x/B),by=Math.floor(y/B),bz=Math.floor(z/B),block=blocks.get(key(bx,by,bz));return block?block.field[((z-bz*B)*B+y-by*B)*B+x-bx*B]:1000;};
  function gradient(id){let g=gradients.get(id);if(g)return g;const block=pages[Math.floor(id/N)],i=id%N,x=block.x*B+i%B,y=block.y*B+Math.floor(i/B)%B,z=block.z*B+Math.floor(i/(B*B));g=[sampleValue(x+1,y,z)-sampleValue(x-1,y,z),sampleValue(x,y+1,z)-sampleValue(x,y-1,z),sampleValue(x,y,z+1)-sampleValue(x,y,z-1)];gradients.set(id,g);return g;}
  function vertex(a,b,va,vb){
    if(a<0||b<0)throw new Error('A surface reached the sampling boundary.');const lo=Math.min(a,b),hi=Math.max(a,b),name=numericEdges?lo*total+hi:`${lo},${hi}`,existing=edges.get(name);if(existing!==undefined)return existing;
    const t=clamp(va/(va-vb),.000001,.999999),blockA=pages[Math.floor(a/N)],blockB=pages[Math.floor(b/N)],ia=a%N,ib=b%N;
    const ax=blockA.x*B+ia%B,ay=blockA.y*B+Math.floor(ia/B)%B,az=blockA.z*B+Math.floor(ia/(B*B)),bx=blockB.x*B+ib%B,by=blockB.y*B+Math.floor(ib/B)%B,bz=blockB.z*B+Math.floor(ib/(B*B));
    const ga=gradient(a),gb=gradient(b),nx=ga[0]+(gb[0]-ga[0])*t,ny=ga[1]+(gb[1]-ga[1])*t,nz=ga[2]+(gb[2]-ga[2])*t,length=Math.hypot(nx,ny,nz)||1,id=vertexCount++,i=id*3;
    if(i+3>positions.length){const p=new Float64Array(positions.length*2),n=new Float64Array(normals.length*2);p.set(positions);n.set(normals);positions=p;normals=n;}
    positions[i]=(ax+(bx-ax)*t)*step;positions[i+1]=(ay+(by-ay)*t)*step;positions[i+2]=(az+(bz-az)*t)*step;normals[i]=nx/length;normals[i+1]=ny/length;normals[i+2]=nz/length;edges.set(name,id);return id;
  }
  function triangle(a,b,c){
    const ai=a*3,bi=b*3,ci=c*3,ax=positions[bi]-positions[ai],ay=positions[bi+1]-positions[ai+1],az=positions[bi+2]-positions[ai+2],bx=positions[ci]-positions[ai],by=positions[ci+1]-positions[ai+1],bz=positions[ci+2]-positions[ai+2],nx=normals[ai]+normals[bi]+normals[ci],ny=normals[ai+1]+normals[bi+1]+normals[ci+1],nz=normals[ai+2]+normals[bi+2]+normals[ci+2];
    if(indexCount+3>indices.length){const next=new Uint32Array(indices.length*2);next.set(indices);indices=next;}indices[indexCount++]=a;
    if((ay*bz-az*by)*nx+(az*bx-ax*bz)*ny+(ax*by-ay*bx)*nz<0){indices[indexCount++]=c;indices[indexCount++]=b;}else{indices[indexCount++]=b;indices[indexCount++]=c;}
  }
  const ids=new Float64Array(L**3),values=new Float32Array(L**3),cube=new Int32Array(8),tet=new Int32Array(4),vertices=new Uint32Array(4),neighbors=new Array(8);
  for(let bi=0;bi<pages.length;bi++){
    const block=pages[bi];
    // Each block's halo needs only eight lookups, instead of one for every node.
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)neighbors[z*4+y*2+x]=blocks.get(key(block.x+x,block.y+y,block.z+z));
    let minimum=1000,maximum=-Infinity;
    for(let z=0;z<L;z++)for(let y=0;y<L;y++)for(let x=0;x<L;x++){const source=neighbors[(z===B?4:0)+(y===B?2:0)+(x===B?1:0)],i=(z*L+y)*L+x,j=((z%B)*B+y%B)*B+x%B,v=source?source.field[j]:1000;ids[i]=source?source.id*N+j:-1;values[i]=v;minimum=Math.min(minimum,v);maximum=Math.max(maximum,v);}
    if(minimum<0&&maximum>=0)for(let z=0;z<B;z++)for(let y=0;y<B;y++)for(let x=0;x<B;x++){
      const base=(z*L+y)*L+x;let mask=0;for(let i=0;i<8;i++){cube[i]=base+offset[i];if(values[cube[i]]<0)mask|=1<<i;}if(mask===0||mask===255)continue;
      for(const t of tetra){let mask=0;for(let i=0;i<4;i++){tet[i]=cube[t[i]];if(values[tet[i]]<0)mask|=1<<i;}const pairs=cases[mask];if(!pairs.length)continue;
        for(let i=0;i<pairs.length;i++){const a=tet[pairs[i][0]],b=tet[pairs[i][1]];vertices[i]=vertex(ids[a],ids[b],values[a],values[b]);}
        if(pairs.length===3)triangle(vertices[0],vertices[1],vertices[2]);else{triangle(vertices[0],vertices[2],vertices[1]);triangle(vertices[2],vertices[3],vertices[1]);}
      }
    }
    if(bi%40===0)report({phase:'Closing local surfaces',progress:60+Math.round(bi/pages.length*35)});
  }
  if(!indexCount)throw new Error('The curves are too thin at this detail setting. Increase mesh detail or vertex radius.');Object.assign(resolution,{cells:total,blocks:pages.length,sampledNodes});
  return {position:new Float32Array(positions.subarray(0,vertexCount*3)),normal:new Float32Array(normals.subarray(0,vertexCount*3)),index:indices.slice(0,indexCount),grid:resolution.dimensions,step,triangles:indexCount/3,resolution};
}
