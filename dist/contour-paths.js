// Build the crease paths and reserve their screen-space footprint before
// hatching. Depth-tested geometry has already removed hidden edges.
export function hardContourPaths(mask,flag,w,h,scale,style){
  const ids=[...new Set(mask)].filter(id=>id&&style(id).hardContour);
  if(!ids.length)return {paths:[],blocked:()=>false,crosses:()=>false};
  const edges=new Set();for(let i=0;i<mask.length;i++)if(mask[i]&&style(mask[i]).hardContour&&flag(i))edges.add(i);
  const offsets=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const pixel=(x,y)=>x>=0&&y>=0&&x<w&&y<h?y*w+x:-1;
  const neighbor=(i,k)=>{const [x,y]=offsets[k],j=pixel(i%w+x,Math.floor(i/w)+y);return j>=0&&edges.has(j)&&mask[j]===mask[i]?j:-1;};
  // Lens warps can widen a one-pixel centerline. Thin that band while keeping
  // junctions and endpoints, so the chosen thickness is applied only once.
  for(let pass=0;pass<16;pass++){
    let changed=false;
    for(let phase=0;phase<2;phase++){
      const remove=[];
      for(const i of edges){const n=offsets.map((_,k)=>neighbor(i,k)>=0?1:0),count=n.reduce((s,v)=>s+v,0);if(count<2||count>6)continue;
        let turns=0;for(let k=0;k<8;k++)if(!n[k]&&n[(k+1)%8])turns++;
        if(turns!==1)continue;
        if(phase===0?(!n[0]||!n[2]||!n[4])&&(!n[2]||!n[4]||!n[6]):(!n[0]||!n[2]||!n[6])&&(!n[0]||!n[4]||!n[6]))remove.push(i);
      }
      for(const i of remove)edges.delete(i);changed||=remove.length>0;
    }
    if(!changed)break;
  }
  const visited=new Map(),paths=[];
  function links(i){const result=[];for(let k=0;k<8;k++){const j=neighbor(i,k);if(j<0)continue;const [x,y]=offsets[k];
    if(x&&y){const a=pixel(i%w+x,Math.floor(i/w)),b=pixel(i%w,Math.floor(i/w)+y);if((edges.has(a)&&mask[a]===mask[i])||(edges.has(b)&&mask[b]===mask[i]))continue;}result.push([j,k]);}return result;}
  function trace(first,next,d){let current=first,guard=0;const points=[first%w+.5,Math.floor(first/w)+.5];
    while(guard++<=edges.size){visited.set(current,(visited.get(current)||0)|(1<<d));visited.set(next,(visited.get(next)||0)|(1<<((d+4)%8)));points.push(next%w+.5,Math.floor(next/w)+.5);current=next;if(current===first)break;
      const candidates=links(current).filter(([,k])=>!((visited.get(current)||0)&(1<<k)));if(!candidates.length)break;
      const previous=offsets[d],score=k=>(previous[0]*offsets[k][0]+previous[1]*offsets[k][1])/Math.hypot(...offsets[k]);
      candidates.sort((a,b)=>score(b[1])-score(a[1]));[next,d]=candidates[0];
    }if(points.length>=4)paths.push({object:mask[first],points});
  }
  for(const i of edges){const candidates=links(i);if(candidates.length===2)continue;for(const [j,k] of candidates)if(!((visited.get(i)||0)&(1<<k)))trace(i,j,k);}
  for(const i of edges)for(const [j,k] of links(i))if(!((visited.get(i)||0)&(1<<k)))trace(i,j,k);
  const radius=object=>(style(object).hardWidth+style(object).width)*scale*.5+.35;
  const cell=Math.max(2,...ids.map(radius)),gw=Math.ceil(w/cell),bins=new Map();
  for(const i of edges){const x=i%w+.5,y=Math.floor(i/w)+.5,key=Math.floor(y/cell)*gw+Math.floor(x/cell);let bin=bins.get(key);if(!bin){bin=[];bins.set(key,bin);}bin.push(x,y,mask[i]);}
  function blocked(x,y,object){if(!style(object)?.hardContour)return false;const bx=Math.floor(x/cell),by=Math.floor(y/cell),r2=radius(object)**2;
    for(let yy=Math.max(0,by-1);yy<=Math.min(Math.ceil(h/cell)-1,by+1);yy++)for(let xx=Math.max(0,bx-1);xx<=Math.min(gw-1,bx+1);xx++){
      const bin=bins.get(yy*gw+xx);if(!bin)continue;for(let k=0;k<bin.length;k+=3)if(bin[k+2]===object&&(bin[k]-x)**2+(bin[k+1]-y)**2<r2)return true;
    }return false;
  }
  function crosses(x,y,nx,ny,object){if(!style(object)?.hardContour)return false;const steps=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)*2));
    for(let k=1;k<=steps;k++){const t=k/steps,i=pixel(Math.floor(x+(nx-x)*t),Math.floor(y+(ny-y)*t));if(edges.has(i)&&mask[i]===object)return true;}return false;
  }
  return {paths,blocked,crosses};
}
