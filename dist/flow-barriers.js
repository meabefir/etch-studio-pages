// Invisible geometric crease barriers. They never depend on light or on
// whether the user chooses to draw hard contours.
export function flowBarriers(mask,flag,w,h,scale,style,enabled){
  if(!enabled)return {blocked:()=>false,crosses:()=>false};
  const bins=new Map(),radii=new Map(),edges=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&flag(i)){edges.push(i);if(!radii.has(mask[i]))radii.set(mask[i],Math.max(.75,(style(mask[i]).width*.5+.3)*scale));}
  if(!edges.length)return {blocked:()=>false,crosses:()=>false};
  const cell=Math.max(2,...radii.values()),gw=Math.ceil(w/cell),gh=Math.ceil(h/cell);
  for(const i of edges){const x=i%w+.5,y=Math.floor(i/w)+.5,key=Math.floor(y/cell)*gw+Math.floor(x/cell);let bin=bins.get(key);if(!bin){bin=[];bins.set(key,bin);}bin.push(x,y,mask[i]);}
  function blocked(x,y,object){const radius=radii.get(object);if(!radius)return false;const bx=Math.floor(x/cell),by=Math.floor(y/cell),r2=radius*radius;
    for(let yy=Math.max(0,by-1);yy<=Math.min(gh-1,by+1);yy++)for(let xx=Math.max(0,bx-1);xx<=Math.min(gw-1,bx+1);xx++){
      const bin=bins.get(yy*gw+xx);if(!bin)continue;for(let k=0;k<bin.length;k+=3)if(bin[k+2]===object&&(bin[k]-x)**2+(bin[k+1]-y)**2<=r2)return true;
    }return false;
  }
  function crosses(x,y,nx,ny,object){if(!radii.has(object))return false;const steps=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)/Math.max(.5,scale*.5)));
    for(let k=1;k<=steps;k++){const t=k/steps;if(blocked(x+(nx-x)*t,y+(ny-y)*t,object))return true;}return false;
  }
  return {blocked,crosses};
}
