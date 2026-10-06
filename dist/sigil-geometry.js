import { validateSigil, nodeMap, pointOf, radiusOf, resolveNode, curveSettings, motifSettings } from './sigil-data.js';
import { adaptiveCurveParameters, adaptiveGrowthSamples, planSigilResolution } from './sigil-resolution.js';
import { buildSparseSurface } from './sigil-volume.js?v=sigil-performance-1';
import { smoothSigilMesh } from './sigil-smoothing.js?v=sigil-performance-1';
import { sigilMeshKey, sigilMeshBytes, SIGIL_CACHE_BYTES } from './sigil-generation.js?v=sigil-performance-1';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=(seed,i)=>{const n=Math.sin(seed*127.1+i*311.7)*43758.5453;return n-Math.floor(n);};
function bezier(a,b,c,d,t){const u=1-t;return a.map((v,i)=>v*u*u*u+3*b[i]*u*u*t+3*c[i]*u*t*t+d[i]*t*t*t);}
export function sampleCurve(curve,design,step=null,map=nodeMap(design)) {
  const s=curveSettings(design,curve),points=[];
  for(let segment=0;segment<curve.nodes.length-1;segment++) {
    const a=curve.nodes[segment],b=curve.nodes[segment+1],p=pointOf(a,map),q=pointOf(b,map);
    const parameters=step?adaptiveCurveParameters(p,add(p,a.out),add(q,b.in),q,s,step):Array.from({length:s.curveResolution+1},(_,i)=>i/s.curveResolution);
    for(let j=segment?1:0;j<parameters.length;j++) {
      const t=parameters[j],u=(segment+t)/(curve.nodes.length-1),r=radiusOf(a,map)+(radiusOf(b,map)-radiusOf(a,map))*t*t*(3-2*t);
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
function growth(points,s,index,step=null) {
  const groups=[],total=points.at(-1).arc;
  if(s.thorns)for(let k=0,num=Math.min(80,Math.floor(total*s.thornDensity));k<num;k++) {
    const u=(k+.65)/(num+1),a=at(points,u),angle=s.thornSides==='spiral'?k*2.39996:s.thornSides==='paired'?0:k%2*Math.PI;
    for(let side=0;side<(s.thornSides==='paired'?2:1);side++) {
      const variation=1+(random(s.seed,index*997+k)-.5)*2*s.thornJitter,theta=angle+side*Math.PI,direction=unit(add(mul(a.n,Math.cos(theta)),mul(a.b,Math.sin(theta))));
      const extent=s.thornLength*variation,base=add(a.p,mul(direction,a.r*.65)),tip=add(base,add(mul(direction,extent),mul(a.t,extent*s.thornLean))),list=[];
      const samples=step?adaptiveGrowthSamples(extent,s.thornCurve,s,step,8):8;
      for(let j=0;j<=samples;j++){const t=j/samples,p=lerp(base,tip,t);list.push({p:add(p,mul(a.t,Math.sin(Math.PI*t)*extent*s.thornCurve*.5)),r:Math.max(.001,s.thornRadius*variation*(1-t)**1.4),u:t,arc:t*extent});}
      frames(list);groups.push(sweep(list,'thorn',s.flatten));
    }
  }
  if(s.leaves)for(let k=0,num=Math.min(40,Math.floor(total*s.leafDensity));k<num;k++) {
    const a=at(points,(k+.75)/(num+1)),direction=mul(a.n,k%2?-1:1),base=add(a.p,mul(direction,a.r*.6)),list=[];
    const samples=step?adaptiveGrowthSamples(s.leafLength,s.leafCurl,s,step,12):12;
    for(let j=0;j<=samples;j++){const t=j/samples,p=add(base,add(mul(direction,t*s.leafLength),mul(a.t,t*s.leafLength*.3)));list.push({p:add(p,mul(a.b,Math.sin(Math.PI*t)*s.leafLength*s.leafCurl*.45)),r:Math.max(.001,s.leafWidth*Math.sin(Math.PI*t)**.85),u:t,arc:t*s.leafLength});}
    frames(list);groups.push(sweep(list,'leaf',s.leafThickness));
  }
  return groups;
}
function transformGroup(group,angle,mirror=false){const c=Math.cos(angle),s=Math.sin(angle),transform=p=>{const x=mirror?-p[0]:p[0];return [c*x-s*p[1],s*x+c*p[1],p[2]];};const points=group.points.map(p=>({...p,p:transform(p.p),t:transform(p.t),n:transform(p.n),b:transform(p.b)}));return {...group,points,clip:group.clip?group.clip.map(v=>v?{...v,p:transform(v.p),t:transform(v.t)}:null):null};}
export function sigilGroups(design,step=null) {
  const map=nodeMap(design),originals=[];
  for(let i=0;i<design.curves.length;i++) {
    const curve=design.curves[i],s=curveSettings(design,curve),points=sampleCurve(curve,design,step,map);if(points.at(-1).arc<.0001)continue;
    const first=points[0],last=points.at(-1),clip=s.cap==='flat'?[curve.nodes[0].link?null:{p:first.p,t:mul(first.t,-1),r:first.r},curve.nodes.at(-1).link?null:{p:last.p,t:last.t,r:last.r}]:null;
    originals.push(...[sweep(points,'stem',s.flatten,clip),...growth(points,s,i,step)].map(group=>({...group,settings:s,curveId:curve.id})));
  }
  const poles=new Set(design.curves.flatMap(c=>c.nodes.filter(n=>n.link).map(n=>resolveNode(n,map).id)));
  for(const id of poles){const n=map.get(id),owner=design.curves.find(c=>c.nodes.includes(n)),s=curveSettings(design,owner),r=radiusOf(n,map)*s.radiusScale*s.poleBulge;
    originals.push({...sweep([{p:pointOf(n,map),r,t:[0,1,0],n:[1,0,0],b:[0,0,1],u:0,arc:0},{p:pointOf(n,map),r,t:[0,1,0],n:[1,0,0],b:[0,0,1],u:1,arc:0}],'pole'),settings:s,curveId:owner.id});
  }
  if(!originals.length)throw new Error('Give the curves some length before generating the mesh.');
  const groups=[],signatures=new Set();
  // Each curve's symmetry and profile travel with its own sweeps and growth.
  // Preserve copy order so legacy, inherited designs keep their original joins.
  const copies=Math.max(...originals.map(g=>g.settings.symmetry==='radial'?g.settings.radialCopies:g.settings.symmetry==='mirror'?2:1));
  for(let copy=0;copy<copies;copy++)for(const group of originals){const s=group.settings,count=s.symmetry==='radial'?s.radialCopies:s.symmetry==='mirror'?2:1;if(copy>=count)continue;
    const transformed=transformGroup(group,s.symmetry==='radial'?copy*Math.PI*2/count:0,s.symmetry==='mirror'&&copy===1),signature=transformed.points.map(p=>p.p.map(n=>n.toFixed(4)).join(',')).join(';')+'|'+group.profile+'|'+JSON.stringify(motifSettings(s));
    if(signatures.has(signature))continue;signatures.add(signature);groups.push(transformed);
  }return groups;
}
export function buildSigil(input,report=()=>{},cache=null) {
  const start=performance.now(),design=validateSigil(input),s=design.settings;
  const key=cache?sigilMeshKey(design,true):null;
  if(cache?.key===key&&cache.mesh){
    if(cache.mesh.resolution.cells>s.detailBudget)throw new Error('The occupied mesh regions exceed the detail budget. Increase Detail budget in Resolution & finish, or reduce mesh resolution or Maximum detail boost.');
    const mesh=smoothSigilMesh(cache.mesh,s,report);return {...mesh,ms:Math.round(performance.now()-start),reusedSurface:true};
  }
  if(cache){cache.key=null;cache.mesh=null;}
  report({phase:'Sampling local curve detail',progress:0});
  let groups=sigilGroups(design),resolution=planSigilResolution(groups,s,design);
  groups=sigilGroups(design,resolution.step);resolution=planSigilResolution(groups,s,design);
  const surface=buildSparseSurface(groups,s,resolution,report);
  if(cache&&sigilMeshBytes(surface)<=SIGIL_CACHE_BYTES){cache.key=key;cache.mesh=surface;}
  const mesh=smoothSigilMesh(surface,s,report);mesh.ms=Math.round(performance.now()-start);return mesh;
}
