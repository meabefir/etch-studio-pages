import { nodeMap, radiusOf } from './sigil-data.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function cubic(p,a,b,q,t){const u=1-t;return p.map((v,i)=>v*u*u*u+3*a[i]*u*u*t+3*b[i]*u*t*t+q[i]*t*t*t);}
function lineDistance(p,a,b){const d=b.map((v,i)=>v-a[i]),l=d.reduce((n,v)=>n+v*v,0),t=l?Math.max(0,Math.min(1,p.reduce((n,v,i)=>n+(v-a[i])*d[i],0)/l)):0;return distance(p,a.map((v,i)=>v+d[i]*t));}

// Curve samples are added only where bending or length exceeds the chosen tolerance.
export function adaptiveCurveParameters(p,a,b,q,s,step) {
  const values=[0],base=s.curveResolution,depth=12,tolerance=step/(s.adaptiveResolution?1+s.adaptiveQuality:2),spacing=step*(s.adaptiveResolution?3:6);
  function split(lo,hi,level){
    const from=cubic(p,a,b,q,lo),to=cubic(p,a,b,q,hi),mid=(lo+hi)/2;
    const flatness=Math.max(...[.25,.5,.75].map(t=>lineDistance(cubic(p,a,b,q,lo+(hi-lo)*t),from,to)));
    if(values.length>20000)throw new Error('This curve needs too many detail samples. Reduce mesh detail or increase its radius.');
    if(level<depth&&(flatness>tolerance||distance(from,to)>spacing)){split(lo,mid,level+1);split(mid,hi,level+1);}else values.push(hi);
  }
  for(let i=0;i<base;i++)split(i/base,(i+1)/base,0);
  return values;
}
export function adaptiveGrowthSamples(extent,curvature,s,step,baseline) {
  if(!s.adaptiveResolution)return baseline;
  return Math.min(128,Math.max(baseline,Math.ceil(extent*(1+curvature)/(step*2)),Math.ceil(baseline*s.adaptiveQuality)));
}

export function planSigilResolution(groups,s,design=null) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const group of groups)for(const p of group.points){
    const envelope=p.r*(1+s.rippleAmplitude)*(1+s.ridgeDepth)*(1+s.bark)*Math.max(1,group.flatten)+s.blend*2;
    for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],p.p[axis]-envelope);max[axis]=Math.max(max[axis],p.p[axis]+envelope);}
  }
  const map=design?nodeMap(design):null,radii=design?design.curves.flatMap(c=>c.nodes.map(n=>radiusOf(n,map)*s.radiusScale*Math.min(1,s.flatten))):groups.filter(g=>g.profile==='stem').flatMap(g=>g.points.filter(p=>p.u>=.08&&p.u<=.92).map(p=>p.r*Math.min(1,g.flatten)));
  radii.sort((a,b)=>a-b);const referenceRadius=radii[Math.floor(radii.length/2)]||.09;
  const size=max.map((v,i)=>v-min[i]),baseStep=referenceRadius*2/Math.max(2,s.meshResolution/20);
  let wanted=baseStep;const across=2+s.adaptiveQuality*2,reasons=new Set();
  const request=(step,reason)=>{if(step>0&&Number.isFinite(step)&&step<wanted){wanted=step;reasons.add(reason);}};
  if(s.adaptiveResolution)for(const group of groups){
    const points=group.points,total=points.at(-1).arc;
    if(group.profile==='stem'){
      const radii=points.filter(p=>p.u>=.08&&p.u<=.92).map(p=>p.r);
      if(radii.length)request(Math.min(...radii)*Math.min(1,group.flatten)*2/across,'thin curves');
      if(s.ripple&&s.rippleAmplitude>.001)request(total/(s.rippleFrequency*(6+s.adaptiveQuality*3)),'ripples');
      if(s.bark>.001)request(total/(s.barkFrequency*(6+s.adaptiveQuality*3)),'bark');
      if(s.ridges&&s.ridgeDepth>.001&&radii.length)request(Math.min(...radii)*2*Math.PI/(s.ridges*(6+s.adaptiveQuality*3)),'flutes');
      const turns=Math.max(Math.abs(s.twist),Math.abs(s.ridgeTwist));if(turns>.001)request(total/(turns*(8+s.adaptiveQuality*4)),'spirals');
      if(s.spineWave>.001||s.spineDepth>.001)request(total/(s.spineFrequency*(8+s.adaptiveQuality*4)),'waves');
    } else if(group.profile==='thorn'){
      // Sample the narrowing section, rather than the vanishing mathematical tip.
      const section=points.reduce((a,p)=>Math.abs(p.u-.6)<Math.abs(a.u-.6)?p:a,points[0]);
      request(section.r*Math.min(1,group.flatten)*2/across,'thorn tips');
    } else if(group.profile==='leaf'){
      request(Math.max(...points.map(p=>p.r))*Math.min(1,group.flatten)*2/across,'leaves');
    }
  }
  const step=s.adaptiveResolution?Math.max(wanted,baseStep/s.adaptiveBoost):baseStep;
  const dimensionsFor=cell=>size.map(v=>Math.ceil(v/cell+6)+1);
  const dimensions=dimensionsFor(step),limited=s.adaptiveResolution&&step>wanted*1.001;
  return {origin:[0,0,0],dimensions,step,baseStep,referenceRadius,requestedStep:wanted,adaptive:s.adaptiveResolution,refinement:baseStep/step,limited,reasons:[...reasons],cells:0,denseCells:dimensions.reduce((a,b)=>a*b,1),sparse:true};
}
