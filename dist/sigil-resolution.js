const CELL_BUDGET=4500000;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function cubic(p,a,b,q,t){const u=1-t;return p.map((v,i)=>v*u*u*u+3*a[i]*u*u*t+3*b[i]*u*t*t+q[i]*t*t*t);}
function lineDistance(p,a,b){const d=b.map((v,i)=>v-a[i]),l=d.reduce((n,v)=>n+v*v,0),t=l?Math.max(0,Math.min(1,p.reduce((n,v,i)=>n+(v-a[i])*d[i],0)/l)):0;return distance(p,a.map((v,i)=>v+d[i]*t));}

// Curve samples are added only where bending or length exceeds the chosen tolerance.
export function adaptiveCurveParameters(p,a,b,q,s,step) {
  const values=[0],base=s.curveResolution,depth=Math.min(5,Math.ceil(Math.log2(s.adaptiveBoost))+1),tolerance=step/(1+s.adaptiveQuality),spacing=step*3;
  function split(lo,hi,level){
    const from=cubic(p,a,b,q,lo),to=cubic(p,a,b,q,hi),mid=(lo+hi)/2;
    const flatness=Math.max(...[.25,.5,.75].map(t=>lineDistance(cubic(p,a,b,q,lo+(hi-lo)*t),from,to)));
    if(level<depth&&(flatness>tolerance||distance(from,to)>spacing)){split(lo,mid,level+1);split(mid,hi,level+1);}else values.push(hi);
  }
  for(let i=0;i<base;i++)split(i/base,(i+1)/base,0);
  return values;
}
export function adaptiveGrowthSamples(extent,curvature,s,step,baseline) {
  if(!s.adaptiveResolution)return baseline;
  return Math.min(128,Math.max(baseline,Math.ceil(extent*(1+curvature)/(step*2)),Math.ceil(baseline*s.adaptiveQuality)));
}

export function planSigilResolution(groups,s) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const group of groups)for(const p of group.points){
    const envelope=p.r*(1+s.rippleAmplitude)*(1+s.ridgeDepth)*(1+s.bark)*Math.max(1,group.flatten)+s.blend*2;
    for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],p.p[axis]-envelope);max[axis]=Math.max(max[axis],p.p[axis]+envelope);}
  }
  const size=max.map((v,i)=>v-min[i]),baseStep=Math.max(...size)/(s.meshResolution-8);
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
  let step=s.adaptiveResolution?Math.max(wanted,baseStep/s.adaptiveBoost):baseStep;
  const dimensionsFor=cell=>size.map(v=>Math.ceil(v/cell+6)+1);
  let dimensions=dimensionsFor(step),total=dimensions.reduce((a,b)=>a*b,1),limited=s.adaptiveResolution&&step>wanted*1.001;
  if(s.adaptiveResolution){
    while(total>CELL_BUDGET){limited=true;step*=Math.max(1.005,Math.cbrt(total/CELL_BUDGET)*1.002);dimensions=dimensionsFor(step);total=dimensions.reduce((a,b)=>a*b,1);}
  } else if(total>CELL_BUDGET)throw new Error('Reduce mesh resolution for this volume.');
  return {origin:min.map(v=>v-step*3),dimensions,step,baseStep,requestedStep:wanted,adaptive:s.adaptiveResolution,refinement:baseStep/step,limited,reasons:[...reasons],cells:total};
}
