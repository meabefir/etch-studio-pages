import { validateSigil, nodeMap, pointOf, radiusOf } from './sigil-data.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=(seed,i)=>{const n=Math.sin(seed*127.1+i*311.7)*43758.5453;return n-Math.floor(n);};
function bezier(a,b,c,d,t){const u=1-t;return a.map((v,i)=>v*u*u*u+3*b[i]*u*u*t+3*c[i]*u*t*t+d[i]*t*t*t);}
export function sampleCurve(curve,design) {
  const map=nodeMap(design),s=design.settings,points=[];
  for(let segment=0;segment<curve.nodes.length-1;segment++) {
    const a=curve.nodes[segment],b=curve.nodes[segment+1],p=pointOf(a,map),q=pointOf(b,map);
    for(let j=segment?1:0;j<=s.curveResolution;j++) {
      const t=j/s.curveResolution,u=(segment+t)/(curve.nodes.length-1),r=radiusOf(a,map)+(radiusOf(b,map)-radiusOf(a,map))*t*t*(3-2*t);
      points.push({p:bezier(p,add(p,a.out),add(q,b.in),q,t),r:r*s.radiusScale,u});
    }
  }
  arcLengths(points);frames(points);
  for(const point of points) { const phase=point.u*Math.PI*2*s.spineFrequency,sine=Math.sin(Math.PI*point.u)**2;point.p=add(point.p,add(mul(point.n,Math.sin(phase)*s.spineWave*sine),mul(point.b,Math.cos(phase)*s.spineDepth*sine))); }
  arcLengths(points);frames(points);
  for(let i=0;i<points.length;i++) {const u=points[i].u;
    const end=Math.min(curve.nodes[0].link?1:u*6,curve.nodes.at(-1).link?1:(1-u)*6,1);
    points[i].r*=Math.max(.015,1-s.endTaper*(1-end)**2)*(1+s.bulge*Math.sin(Math.PI*u)**2);
  }
  if(s.cap==='pointed') {
    if(!curve.nodes[0].link) {const p=points[0];points.unshift({...p,p:add(p.p,mul(p.t,-p.r*s.tipLength)),r:.001});}
    if(!curve.nodes.at(-1).link) {const p=points.at(-1);points.push({...p,p:add(p.p,mul(p.t,p.r*s.tipLength)),r:.001});}
    arcLengths(points);frames(points);
  }
  return points;
}
function arcLengths(points){let distance=0;for(let i=0;i<points.length;i++){if(i)distance+=length(sub(points[i].p,points[i-1].p));points[i].arc=distance;}for(const p of points)p.u=distance?p.arc/distance:0;}
function frames(points) {
  let normal;
  for(let i=0;i<points.length;i++) {const t=unit(sub(points[Math.min(i+1,points.length-1)].p,points[Math.max(0,i-1)].p));
    if(length(t)<.01)points[i].t=[0,1,0];else points[i].t=t;
    const tangent=points[i].t;
    if(normal)normal=sub(normal,mul(tangent,dot(normal,tangent)));
    if(!normal||length(normal)<.01)normal=cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[0,1,0]);
    normal=unit(normal);points[i].n=[...normal];points[i].b=unit(cross(tangent,normal));
  }
}
function at(points,u) {const target=points.at(-1).arc*u;let i=1;while(i<points.length-1&&points[i].arc<target)i++;const a=points[i-1],b=points[i],t=clamp((target-a.arc)/Math.max(.00001,b.arc-a.arc),0,1);return {p:lerp(a.p,b.p,t),r:a.r+(b.r-a.r)*t,t:unit(lerp(a.t,b.t,t)),n:unit(lerp(a.n,b.n,t)),b:unit(lerp(a.b,b.b,t)),u};}
function sweep(points,profile='stem',flatten=1,clip=null){return {points,profile,flatten,clip};}
function growth(points,s,index) {
  const groups=[],total=points.at(-1).arc;
  if(s.thorns)for(let k=0,num=Math.min(80,Math.floor(total*s.thornDensity));k<num;k++) {
    const u=(k+.65)/(num+1),a=at(points,u),angle=s.thornSides==='spiral'?k*2.39996:s.thornSides==='paired'?0:k%2*Math.PI;
    for(let side=0;side<(s.thornSides==='paired'?2:1);side++) {
      const variation=1+(random(s.seed,index*997+k)-.5)*2*s.thornJitter,theta=angle+side*Math.PI,direction=unit(add(mul(a.n,Math.cos(theta)),mul(a.b,Math.sin(theta))));
      const extent=s.thornLength*variation,base=add(a.p,mul(direction,a.r*.65)),tip=add(base,add(mul(direction,extent),mul(a.t,extent*s.thornLean))),list=[];
      for(let j=0;j<=8;j++){const t=j/8,p=lerp(base,tip,t);list.push({p:add(p,mul(a.t,Math.sin(Math.PI*t)*extent*s.thornCurve*.5)),r:Math.max(.001,s.thornRadius*variation*(1-t)**1.4),u:t,arc:t*extent});}
      frames(list);groups.push(sweep(list,'thorn',s.flatten));
    }
  }
  if(s.leaves)for(let k=0,num=Math.min(40,Math.floor(total*s.leafDensity));k<num;k++) {
    const a=at(points,(k+.75)/(num+1)),direction=mul(a.n,k%2?-1:1),base=add(a.p,mul(direction,a.r*.6)),list=[];
    for(let j=0;j<=12;j++){const t=j/12,p=add(base,add(mul(direction,t*s.leafLength),mul(a.t,t*s.leafLength*.3)));list.push({p:add(p,mul(a.b,Math.sin(Math.PI*t)*s.leafLength*s.leafCurl*.45)),r:Math.max(.001,s.leafWidth*Math.sin(Math.PI*t)**.85),u:t,arc:t*s.leafLength});}
    frames(list);groups.push(sweep(list,'leaf',s.leafThickness));
  }
  return groups;
}
function transformGroup(group,angle,mirror=false){const c=Math.cos(angle),s=Math.sin(angle),transform=p=>{const x=mirror?-p[0]:p[0];return [c*x-s*p[1],s*x+c*p[1],p[2]];};const points=group.points.map(p=>({...p,p:transform(p.p),t:transform(p.t),n:transform(p.n),b:transform(p.b)}));return {...group,points,clip:group.clip?group.clip.map(v=>v?{...v,p:transform(v.p),t:transform(v.t)}:null):null};}
export function buildSigil(input,report=()=>{}) {
  const start=performance.now(),design=validateSigil(input),s=design.settings,map=nodeMap(design),originals=[];
  for(let i=0;i<design.curves.length;i++) {const curve=design.curves[i],points=sampleCurve(curve,design);if(points.at(-1).arc<.0001)continue;
    const first=points[0],last=points.at(-1),clip=s.cap==='flat'?[curve.nodes[0].link?null:{p:first.p,t:mul(first.t,-1),r:first.r},curve.nodes.at(-1).link?null:{p:last.p,t:last.t,r:last.r}]:null;
    originals.push(sweep(points,'stem',s.flatten,clip),...growth(points,s,i));
  }
  const poles=new Set(design.curves.flatMap(c=>c.nodes.filter(n=>n.link).map(n=>n.link)));
  for(const id of poles){const n=map.get(id),r=radiusOf(n,map)*s.radiusScale*s.poleBulge;originals.push(sweep([{p:pointOf(n,map),r,t:[0,1,0],n:[1,0,0],b:[0,0,1],u:0,arc:0},{p:pointOf(n,map),r,t:[0,1,0],n:[1,0,0],b:[0,0,1],u:1,arc:0}],'pole'));}
  if(!originals.length)throw new Error('Give the curves some length before generating the mesh.');
  const groups=[],signatures=new Set(),copies=s.symmetry==='radial'?s.radialCopies:s.symmetry==='mirror'?2:1;
  for(let copy=0;copy<copies;copy++)for(const group of originals){const transformed=transformGroup(group,s.symmetry==='radial'?copy*Math.PI*2/copies:0,s.symmetry==='mirror'&&copy===1),signature=transformed.points.map(p=>p.p.map(n=>n.toFixed(4)).join(',')).join(';')+'|'+group.profile;if(signatures.has(signature))continue;signatures.add(signature);groups.push(transformed);}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const group of groups)for(const p of group.points){const envelope=p.r*(1+s.rippleAmplitude)*(1+s.ridgeDepth)*(1+s.bark)*Math.max(1,group.flatten)+s.blend*2;for(let a=0;a<3;a++){min[a]=Math.min(min[a],p.p[a]-envelope);max[a]=Math.max(max[a],p.p[a]+envelope);}}
  const size=sub(max,min),step=Math.max(...size)/(s.meshResolution-8);for(let a=0;a<3;a++){min[a]-=step*3;max[a]+=step*3;}
  const dimensions=min.map((v,a)=>Math.ceil((max[a]-v)/step)+1),[nx,ny,nz]=dimensions,total=nx*ny*nz;
  if(total>4500000)throw new Error('Reduce mesh resolution for this volume.');
  const field=new Float32Array(total).fill(1000),temporary=new Float32Array(total),marks=new Uint16Array(total);let groupId=0;
  report({phase:'Building volume',progress:0});
  for(const group of groups){groupId++;const touched=[],points=group.points;
    for(let segment=0;segment<points.length-1;segment++){
      const a=points[segment],b=points[segment+1],delta=sub(b.p,a.p),len2=dot(delta,delta),tangent=len2>.00000001?mul(delta,1/Math.sqrt(len2)):a.t;
      let normal=unit(sub(a.n,mul(tangent,dot(a.n,tangent))));if(length(normal)<.01)normal=a.n;const binormal=unit(cross(tangent,normal));
      const radius=Math.max(a.r,b.r)*(1+s.rippleAmplitude)*(1+s.ridgeDepth)*(1+s.bark)*Math.max(1,group.flatten)+s.blend*2+step*2;
      const lo=a.p.map((v,axis)=>clamp(Math.floor((Math.min(v,b.p[axis])-radius-min[axis])/step),0,dimensions[axis]-1)),hi=a.p.map((v,axis)=>clamp(Math.ceil((Math.max(v,b.p[axis])+radius-min[axis])/step),0,dimensions[axis]-1));
      for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
        const px=min[0]+x*step-a.p[0],py=min[1]+y*step-a.p[1],pz=min[2]+z*step-a.p[2],t=len2>.00000001?clamp((px*delta[0]+py*delta[1]+pz*delta[2])/len2,0,1):0;
        const vx=px-delta[0]*t,vy=py-delta[1]*t,vz=pz-delta[2]*t,rawN=vx*normal[0]+vy*normal[1]+vz*normal[2],rawB=vx*binormal[0]+vy*binormal[1]+vz*binormal[2],axial=vx*tangent[0]+vy*tangent[1]+vz*tangent[2];
        const u=a.u+(b.u-a.u)*t,rotation=group.profile==='stem'?u*s.twist*Math.PI*2:0,cs=Math.cos(rotation),sn=Math.sin(rotation),n=rawN*cs+rawB*sn,bn=(-rawN*sn+rawB*cs)/group.flatten,theta=Math.atan2(bn,n);let r=a.r+(b.r-a.r)*t;
        if(group.profile==='stem'){
          if(s.ripple){const wave=Math.sin(u*Math.PI*2*s.rippleFrequency+s.ripplePhase*Math.PI/180);r*=1+s.rippleAmplitude*Math.sign(wave)*Math.abs(wave)**s.rippleSharpness;}
          r*=1+s.ridgeDepth*Math.cos(s.ridges*theta+u*s.ridgeTwist*Math.PI*2)*(s.ridges?1:0);
          r*=1+s.bark*(Math.sin(u*s.barkFrequency*6.283+s.seed)*Math.sin(theta*5+u*s.barkFrequency*2.3))*.7;
        }
        const d=(Math.hypot(n,bn,axial)-r)*Math.min(1,group.flatten),i=(z*ny+y)*nx+x;
        if(marks[i]!==groupId){marks[i]=groupId;temporary[i]=d;touched.push(i);}else if(d<temporary[i])temporary[i]=d;
      }
    }
    for(const i of touched){let d=temporary[i];if(group.clip){const z=Math.floor(i/(nx*ny)),y=Math.floor(i/nx)%ny,x=i%nx,p=[min[0]+x*step,min[1]+y*step,min[2]+z*step];for(const cap of group.clip)if(cap&&length(sub(p,cap.p))<cap.r*2+step*2)d=Math.max(d,dot(sub(p,cap.p),cap.t));}
      const previous=field[i],k=s.blend;if(k>0&&previous<999){const h=Math.max(k-Math.abs(previous-d),0)/k;field[i]=Math.min(previous,d)-h*h*k*.25;}else field[i]=Math.min(previous,d);
    }
    if(groupId%8===0)report({phase:'Building volume',progress:Math.round(groupId/groups.length*55)});
  }
  report({phase:'Closing surface',progress:60});
  const positions=[],normals=[],indices=[],edges=new Map(),gradients=new Map();
  const offset=[0,1,1+nx,nx,nx*ny,1+nx*ny,1+nx+nx*ny,nx+nx*ny],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const coordinates=i=>[i%nx,Math.floor(i/nx)%ny,Math.floor(i/(nx*ny))];
  function gradient(i){if(gradients.has(i))return gradients.get(i);const [x,y,z]=coordinates(i),g=[field[i+(x<nx-1?1:0)]-field[i-(x>0?1:0)],field[i+(y<ny-1?nx:0)]-field[i-(y>0?nx:0)],field[i+(z<nz-1?nx*ny:0)]-field[i-(z>0?nx*ny:0)]];gradients.set(i,g);return g;}
  function vertex(a,b){const key=Math.min(a,b)*total+Math.max(a,b);if(edges.has(key))return edges.get(key);const t=clamp(field[a]/(field[a]-field[b]),.000001,.999999),pa=coordinates(a),pb=coordinates(b),v=lerp(pa,pb,t).map((v,k)=>min[k]+v*step),n=unit(lerp(gradient(a),gradient(b),t)),id=positions.length/3;positions.push(...v);normals.push(...n);edges.set(key,id);return id;}
  function triangle(a,b,c){const pa=positions.slice(a*3,a*3+3),pb=positions.slice(b*3,b*3+3),pc=positions.slice(c*3,c*3+3),normal=add(add(normals.slice(a*3,a*3+3),normals.slice(b*3,b*3+3)),normals.slice(c*3,c*3+3));if(dot(cross(sub(pb,pa),sub(pc,pa)),normal)<0)indices.push(a,c,b);else indices.push(a,b,c);}
  for(let z=0;z<nz-1;z++){for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const base=(z*ny+y)*nx+x,cube=offset.map(n=>base+n);let insideCount=0;for(const i of cube)insideCount+=field[i]<0;if(!insideCount||insideCount===8)continue;
    for(const t of tetra){const inside=[],outside=[];for(const corner of t)(field[cube[corner]]<0?inside:outside).push(cube[corner]);if(!inside.length||inside.length===4)continue;
      if(inside.length===1){const [a]=inside;triangle(...outside.map(b=>vertex(a,b)));}
      else if(inside.length===3){const [a]=outside;triangle(...inside.map(b=>vertex(a,b)));}
      else{const [a,b]=inside,[c,d]=outside,ac=vertex(a,c),ad=vertex(a,d),bc=vertex(b,c),bd=vertex(b,d);triangle(ac,bc,ad);triangle(bc,bd,ad);}
    }
  }if(z%5===0)report({phase:'Closing surface',progress:60+Math.round(z/nz*35)});}
  if(!indices.length)throw new Error('The curves are too thin at this mesh resolution. Increase the resolution or vertex radius.');
  return {position:new Float32Array(positions),normal:new Float32Array(normals),index:new Uint32Array(indices),ms:Math.round(performance.now()-start),grid:dimensions,step,triangles:indices.length/3};
}
