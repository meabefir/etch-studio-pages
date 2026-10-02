const B=8,N=B**3,BUDGET=9000000;
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Only blocks touched by swept geometry exist. Shared lattice nodes and tetrahedra
// have identical IDs across block boundaries, keeping caps and junctions watertight.
export function buildSparseSurface(groups,s,resolution,report){
  const variableBlend=groups.some(g=>g.settings&&g.settings.blend!==s.blend),step=resolution.step,blocks=new Map(),pages=[],key=(x,y,z)=>`${x},${y},${z}`;
  function page(x,y,z){const name=key(x,y,z);let block=blocks.get(name);if(!block){if((pages.length+1)*N>BUDGET)throw new Error('The occupied mesh regions exceed the detail budget. Reduce mesh resolution or Maximum detail boost; detail is never reduced automatically.');block={x,y,z,id:pages.length,field:new Float32Array(N).fill(1000),blends:variableBlend?new Float32Array(N):null,temp:new Float32Array(N),marks:new Uint32Array(N),group:0,touched:[]};pages.push(block);blocks.set(name,block);}return block;}
  report({phase:'Sampling occupied regions',progress:0});
  for(let gi=0;gi<groups.length;gi++){
    const group=groups[gi],style=group.settings||s,groupId=gi+1,touchedBlocks=[];
    for(let segment=0;segment<group.points.length-1;segment++){
      const a=group.points[segment],b=group.points[segment+1],delta=sub(b.p,a.p),len2=dot(delta,delta),tangent=len2>1e-8?delta.map(v=>v/Math.sqrt(len2)):a.t;
      let normal=unit(a.n.map((v,i)=>v-tangent[i]*dot(a.n,tangent)));if(Math.hypot(...normal)<.01)normal=a.n;const binormal=unit(cross(tangent,normal));
      const radius=Math.max(a.r,b.r)*(1+style.rippleAmplitude)*(1+style.ridgeDepth)*(1+style.bark)*Math.max(1,group.flatten)+style.blend/Math.min(1,group.flatten)+step*2;
      const lo=a.p.map((v,i)=>Math.floor((Math.min(v,b.p[i])-radius)/step)),hi=a.p.map((v,i)=>Math.ceil((Math.max(v,b.p[i])+radius)/step));
      for(let bz=Math.floor(lo[2]/B);bz<=Math.floor(hi[2]/B);bz++)for(let by=Math.floor(lo[1]/B);by<=Math.floor(hi[1]/B);by++)for(let bx=Math.floor(lo[0]/B);bx<=Math.floor(hi[0]/B);bx++){
        // Reject empty corners of each segment's box before allocating a block.
        const center=[bx,by,bz].map((v,i)=>(v*B+(B-1)*.5)*step-a.p[i]),along=len2>1e-8?clamp(dot(center,delta)/len2,0,1):0;
        if(Math.hypot(...center.map((v,i)=>v-delta[i]*along))>radius+Math.sqrt(3)*(B-1)*step*.5)continue;
        const block=page(bx,by,bz);if(block.group!==groupId){block.group=groupId;block.touched=[];touchedBlocks.push(block);}
        const x0=Math.max(lo[0],bx*B),x1=Math.min(hi[0],bx*B+B-1),y0=Math.max(lo[1],by*B),y1=Math.min(hi[1],by*B+B-1),z0=Math.max(lo[2],bz*B),z1=Math.min(hi[2],bz*B+B-1);
        for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
          const px=x*step-a.p[0],py=y*step-a.p[1],pz=z*step-a.p[2],t=len2>1e-8?clamp((px*delta[0]+py*delta[1]+pz*delta[2])/len2,0,1):0;
          const vx=px-delta[0]*t,vy=py-delta[1]*t,vz=pz-delta[2]*t,rawN=vx*normal[0]+vy*normal[1]+vz*normal[2],rawB=vx*binormal[0]+vy*binormal[1]+vz*binormal[2],axial=vx*tangent[0]+vy*tangent[1]+vz*tangent[2];
          const u=a.u+(b.u-a.u)*t,rotation=group.profile==='stem'?u*style.twist*Math.PI*2:0,cs=Math.cos(rotation),sn=Math.sin(rotation),n=rawN*cs+rawB*sn,bn=(-rawN*sn+rawB*cs)/group.flatten,theta=Math.atan2(bn,n);let r=a.r+(b.r-a.r)*t;
          if(group.profile==='stem'){
            if(style.ripple){const wave=Math.sin(u*Math.PI*2*style.rippleFrequency+style.ripplePhase*Math.PI/180);r*=1+style.rippleAmplitude*Math.sign(wave)*Math.abs(wave)**style.rippleSharpness;}
            r*=1+style.ridgeDepth*Math.cos(style.ridges*theta+u*style.ridgeTwist*Math.PI*2)*(style.ridges?1:0);
            r*=1+style.bark*Math.sin(u*style.barkFrequency*6.283+style.seed)*Math.sin(theta*5+u*style.barkFrequency*2.3)*.7;
          }
          const d=(Math.hypot(n,bn,axial)-r)*Math.min(1,group.flatten),i=((z-bz*B)*B+y-by*B)*B+x-bx*B;
          if(block.marks[i]!==groupId){block.marks[i]=groupId;block.temp[i]=d;block.touched.push(i);}else if(d<block.temp[i])block.temp[i]=d;
        }
      }
    }
    for(const block of touchedBlocks)for(const i of block.touched){
      let d=block.temp[i];if(group.clip){const p=[(block.x*B+i%B)*step,(block.y*B+Math.floor(i/B)%B)*step,(block.z*B+Math.floor(i/(B*B)))*step];for(const cap of group.clip)if(cap&&Math.hypot(...sub(p,cap.p))<cap.r*2+step*2)d=Math.max(d,dot(sub(p,cap.p),cap.t));}
      const previous=block.field[i],k=variableBlend?Math.min(style.blend,block.blends[i]):style.blend;if(k>0&&previous<999){const h=Math.max(k-Math.abs(previous-d),0)/k;block.field[i]=Math.min(previous,d)-h*h*k*.25;}else block.field[i]=Math.min(previous,d);if(variableBlend&&d<previous)block.blends[i]=style.blend;
    }
    if(gi%8===0)report({phase:'Sampling occupied regions',progress:Math.round((gi+1)/groups.length*55)});
  }
  const sampledNodes=pages.reduce((n,b)=>n+b.marks.reduce((a,v)=>a+(v>0),0),0);
  for(const block of pages){block.temp=null;block.marks=null;block.touched=null;block.blends=null;}
  const positions=[],normals=[],indices=[],edges=new Map(),gradients=new Map(),total=pages.length*N;
  const sample=(x,y,z)=>{const bx=Math.floor(x/B),by=Math.floor(y/B),bz=Math.floor(z/B),block=blocks.get(key(bx,by,bz));if(!block)return {id:-1,value:1000};const i=((z-bz*B)*B+y-by*B)*B+x-bx*B;return {id:block.id*N+i,value:block.field[i]};};
  const value=(x,y,z)=>sample(x,y,z).value;
  function coordinates(id){const block=pages[Math.floor(id/N)],i=id%N;return [block.x*B+i%B,block.y*B+Math.floor(i/B)%B,block.z*B+Math.floor(i/(B*B))];}
  function gradient(id){let g=gradients.get(id);if(g)return g;const [x,y,z]=coordinates(id);g=[value(x+1,y,z)-value(x-1,y,z),value(x,y+1,z)-value(x,y-1,z),value(x,y,z+1)-value(x,y,z-1)];gradients.set(id,g);return g;}
  function vertex(a,b,va,vb){if(a<0||b<0)throw new Error('A surface reached the sampling boundary.');const name=Math.min(a,b)*total+Math.max(a,b);if(edges.has(name))return edges.get(name);const t=clamp(va/(va-vb),.000001,.999999),v=lerp(coordinates(a),coordinates(b),t).map(v=>v*step),n=unit(lerp(gradient(a),gradient(b),t)),id=positions.length/3;positions.push(...v);normals.push(...n);edges.set(name,id);return id;}
  function triangle(a,b,c){const pa=positions.slice(a*3,a*3+3),pb=positions.slice(b*3,b*3+3),pc=positions.slice(c*3,c*3+3),n=[0,1,2].map(i=>normals[a*3+i]+normals[b*3+i]+normals[c*3+i]);if(dot(cross(sub(pb,pa),sub(pc,pa)),n)<0)indices.push(a,c,b);else indices.push(a,b,c);}
  const L=B+1,offset=[0,1,L+1,L,L*L,L*L+1,L*L+L+1,L*L+L],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],ids=new Int32Array(L**3),values=new Float32Array(L**3);
  for(let bi=0;bi<pages.length;bi++){
    const block=pages[bi];for(let z=0;z<L;z++)for(let y=0;y<L;y++)for(let x=0;x<L;x++){const node=sample(block.x*B+x,block.y*B+y,block.z*B+z),i=(z*L+y)*L+x;ids[i]=node.id;values[i]=node.value;}
    for(let z=0;z<B;z++)for(let y=0;y<B;y++)for(let x=0;x<B;x++){
      const base=(z*L+y)*L+x,cube=offset.map(n=>base+n);let insideCount=0;for(const i of cube)insideCount+=values[i]<0;if(!insideCount||insideCount===8)continue;
      for(const t of tetra){const inside=[],outside=[];for(const corner of t)(values[cube[corner]]<0?inside:outside).push(cube[corner]);if(!inside.length||inside.length===4)continue;const edge=(a,b)=>vertex(ids[a],ids[b],values[a],values[b]);
        if(inside.length===1){const [a]=inside;triangle(...outside.map(b=>edge(a,b)));}else if(inside.length===3){const [a]=outside;triangle(...inside.map(b=>edge(a,b)));}else{const [a,b]=inside,[c,d]=outside,ac=edge(a,c),ad=edge(a,d),bc=edge(b,c),bd=edge(b,d);triangle(ac,bc,ad);triangle(bc,bd,ad);}
      }
    }
    if(bi%40===0)report({phase:'Closing local surfaces',progress:60+Math.round(bi/pages.length*35)});
  }
  if(!indices.length)throw new Error('The curves are too thin at this detail setting. Increase mesh detail or vertex radius.');
  Object.assign(resolution,{cells:total,blocks:pages.length,sampledNodes});
  return {position:new Float32Array(positions),normal:new Float32Array(normals),index:new Uint32Array(indices),grid:resolution.dimensions,step,triangles:indices.length/3,resolution};
}
