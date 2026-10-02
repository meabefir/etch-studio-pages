// Evenly spaced, bidirectional screen-space streamlines with midpoint integration.
// The GPU supplies visible depth, normals, lighting and projected curvature lines.
self.onmessage = ({ data }) => {
  const start = performance.now();
  try {
    const { id, width: w, height: h, normal, field, depth, params: p, scale } = data;
    const styles = data.objectParams || [], style = object => styles[object - 1] || p;
    const count = w * h, mask = new Uint8Array(count), shade = new Float32Array(count), z = new Float32Array(count);
    const dx = new Float32Array(count), dy = new Float32Array(count);
    let zmin = Infinity, zmax = -Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = ((h - 1 - y) * w + x) * 4;
      mask[i] = normal[j + 3];
      if (!mask[i]) continue;
      shade[i] = field[j + 2] / 255;
      dx[i] = field[j] / 127.5 - 1; dy[i] = field[j + 1] / 127.5 - 1;
      z[i] = (depth[j] * 256 + depth[j + 1]) / 65535 * data.far;
      zmin = Math.min(zmin, z[i]); zmax = Math.max(zmax, z[i]);
    }
    // Screen-space cavity contrast is restrained; it affects density, never width.
    const radius = Math.max(2, Math.round(6 * scale));
    for (let y = radius; y < h - radius; y++) for (let x = radius; x < w - radius; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      let occlusion = 0;
      for (const offset of [-radius, radius, -radius * w, radius * w]) {
        const j = i + offset;
        if (mask[j] && z[i] - z[j] > 0.035 && z[i] - z[j] < 0.8) occlusion += Math.min(1, (z[i] - z[j]) * 3);
      }
      shade[i] = Math.max(0, shade[i] - occlusion * 0.065 * style(mask[i]).cavity);
    }
    const minSpace = Math.min(p.spacing, ...styles.map(s => s.spacing)) * scale;
    const spacing = new Float32Array(count), darkness = new Float32Array(count);
    for (let i = 0; i < count; i++) if (mask[i]) {
      const local = style(mask[i]), min = local.spacing * scale, max = local.lightSpacing * scale;
      darkness[i] = Math.max(0, 1 - Math.pow(shade[i], local.contrast));
      const distance = (z[i] - zmin) / Math.max(0.001, zmax - zmin);
      spacing[i] = (min + (max - min) * Math.pow(shade[i], local.contrast)) * (1 + distance * local.depthSpacing);
    }
    const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
    ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
    const pixel = (x, y) => {
      const ix = Math.round(x), iy = Math.round(y);
      return ix > 0 && iy > 0 && ix < w - 1 && iy < h - 1 ? iy * w + ix : -1;
    };
    // Bilinear interpolation of double-angle vectors avoids tangent sign seams.
    function direction(x, y, px, py, cross) {
      const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, i = iy * w + ix;
      if (ix < 1 || iy < 1 || ix >= w - 2 || iy >= h - 2) return null;
      let a = 0, b = 0, weight = 0;
      const object = mask[pixel(x, y)];
      for (let k = 0; k < 4; k++) {
        const j = i + (k % 2) + (k > 1 ? w : 0);
        if (mask[j] !== object) continue;
        const s = (k % 2 ? tx : 1 - tx) * (k > 1 ? ty : 1 - ty);
        a += dx[j] * s; b += dy[j] * s; weight += s;
      }
      if (weight < 0.2 || Math.hypot(a, b) < 0.035) return null;
      const angle = 0.5 * Math.atan2(b, a) + style(object).angle * Math.PI / 180 + (cross ? Math.PI / 2 : 0);
      let u = Math.cos(angle), v = Math.sin(angle);
      if (u * px + v * py < 0) { u = -u; v = -v; }
      return [u, v];
    }
    const allPaths = [];
    const maxLines=Math.min(120000,Math.max(18000,Math.ceil(count/80)));
    let lineCount = 0;
    function layer(cross) {
      const cell = Math.max(1, minSpace * 0.75), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      const bins = new Array(gw * gh);
      const eligible = i => i >= 0 && mask[i] && (!cross || style(mask[i]).cross) && darkness[i] >= (cross ? style(mask[i]).crossThreshold : style(mask[i]).highlight);
      const queue = [], seeds = [], step = Math.max(0.35, Math.min(1.25 * scale, minSpace * .6));
      function available(x, y, distance) {
        const object = mask[pixel(x, y)];
        const bx = Math.floor(x / cell), by = Math.floor(y / cell), range = Math.ceil(distance / cell), d2 = distance * distance;
        for (let yy = Math.max(0, by - range); yy <= Math.min(gh - 1, by + range); yy++) for (let xx = Math.max(0, bx - range); xx <= Math.min(gw - 1, bx + range); xx++) {
          const bin = bins[yy * gw + xx]; if (!bin) continue;
          for (let j = 0; j < bin.length; j += 3) if (bin[j + 2] === object && (bin[j] - x) ** 2 + (bin[j + 1] - y) ** 2 < d2) return false;
        }
        return true;
      }
      function trace(sx, sy, sign) {
        const origin = pixel(sx, sy), object = mask[origin], points = [];
        let x = sx, y = sy, vx = sign, vy = 0;
        const initial = direction(x, y, 1, 0, cross); if (!initial) return points;
        vx = initial[0] * sign; vy = initial[1] * sign;
        const limit = Math.min(1800, Math.ceil(style(object).length * scale / (step * 2)));
        for (let j = 0; j < limit; j++) {
          const i = pixel(x, y); if (i < 0 || mask[i] !== object || !eligible(i)) break;
          if (j > 2 && !available(x, y, spacing[i] * (cross ? 0.7 : 0.72))) break;
          const d1 = direction(x, y, vx, vy, cross); if (!d1) break;
          const d2 = direction(x + d1[0] * step * 0.5, y + d1[1] * step * 0.5, d1[0], d1[1], cross); if (!d2) break;
          const nx = x + d2[0] * step, ny = y + d2[1] * step, ni = pixel(nx, ny);
          if (ni < 0 || mask[ni] !== object || Math.abs(z[ni] - z[i]) > Math.max(0.12, z[i] * 0.025)) break;
          // Avoid looping indefinitely around a field singularity or closed contour.
          if (j > 24 && Math.hypot(nx - sx, ny - sy) < step * 1.8) break;
          points.push(x, y); x = nx; y = ny; vx = d2[0]; vy = d2[1];
        }
        return points;
      }
      const tile = Math.max(3, Math.floor(minSpace * 1.15));
      for (let y = 2; y < h - 2; y += tile) for (let x = 2; x < w - 2; x += tile) {
        // Deterministic jitter prevents a visible seed lattice without frame flicker.
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const sx = x + (hash % 997) / 997 * tile * 0.65, sy = y + ((hash >>> 10) % 997) / 997 * tile * 0.65;
        const i = pixel(sx, sy);
        if (eligible(i)) seeds.push([sx, sy, darkness[i]]);
      }
      seeds.sort((a, b) => b[2] - a[2]);
      let cursor = 0, fallback = 0, attempts = 0;
      while ((cursor < queue.length || fallback < seeds.length) && attempts++ < maxLines * 14 && lineCount < maxLines) {
        const seed = cursor < queue.length ? queue[cursor++] : seeds[fallback++];
        const [sx, sy] = seed, i = pixel(sx, sy);
        if (i < 0 || !mask[i] || !eligible(i) || !available(sx, sy, spacing[i] * 0.95)) continue;
        const backward = trace(sx, sy, -1), forward = trace(sx, sy, 1), points = [];
        for (let j = backward.length - 2; j >= 0; j -= 2) points.push(backward[j], backward[j + 1]);
        points.push(...forward.slice(2));
        // Integration steps already scale with image size. Scaling the point
        // count again would discard more detail in high-resolution exports.
        if (points.length < 10) continue;
        lineCount++; allPaths.push({ object: mask[i], points });
        for (let j = 0; j < points.length; j += 4) {
          const x = points[j], y = points[j + 1], b = Math.floor(y / cell) * gw + Math.floor(x / cell);
          (bins[b] ||= []).push(x, y, mask[i]);
        }
        // New seeds on both sides extend the same family of long parallel strokes.
        for (let j = 6; j < points.length - 2 && queue.length < maxLines * 12; j += Math.max(8, Math.round(14 * scale))) {
          const x = points[j], y = points[j + 1], d = direction(x, y, 1, 0, cross), pi = pixel(x, y);
          if (!d || pi < 0) continue;
          const distance = spacing[pi] * 1.08;
          queue.push([x - d[1] * distance, y + d[0] * distance], [x + d[1] * distance, y - d[0] * distance]);
        }
      }
    }
    layer(false); if (p.cross || styles.some(s => s.cross)) layer(true);
    const objectIds = [...new Set(mask)].filter(Boolean);
    // Optional per-object paper tint applies only to that object's visible surface.
    for (const object of objectIds) {
      const local = style(object); if (local.paper === p.paper) continue;
      ctx.fillStyle = local.paper;
      for (let y = 0; y < h; y++) { let x = 0; while (x < w) { if (mask[y*w+x] !== object) { x++; continue; } const start = x; while (x < w && mask[y*w+x] === object) x++; ctx.fillRect(start, y, x-start, 1); } }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const depthPaths=depthContours(mask,z,w,h,scale,style);
    for (const object of objectIds) {
      const local = style(object); ctx.strokeStyle = local.ink; ctx.lineWidth = local.width * scale; ctx.beginPath();
      for (const { object: owner, points: path } of allPaths) { if (owner !== object) continue; ctx.moveTo(path[0], path[1]); for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]); }
      ctx.stroke();
      if(local.depthOutline){
        ctx.strokeStyle=local.depthColor;ctx.lineWidth=local.depthWidth*scale;ctx.globalAlpha=local.depthOpacity;ctx.beginPath();
        for(const path of depthPaths){if(path.object!==object)continue;ctx.moveTo(path.points[0],path.points[1]);for(let i=2;i<path.points.length;i+=2)ctx.lineTo(path.points[i],path.points[i+1]);}
        ctx.stroke();ctx.globalAlpha=1;
      }
      if (!local.outline || local.outlineWidth <= 0) continue;
      // Boundaries are independent per visible object, including holes and overlaps.
      const edges = new Map(), stride = w + 1;
      const add = (x1,y1,x2,y2) => { const key = y1*stride+x1; (edges.get(key) || (edges.set(key,[]),edges.get(key))).push(y2*stride+x2); };
      for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const i=y*w+x; if(mask[i]!==object) continue;
        if(y===0 || mask[i-w]!==object) add(x,y,x+1,y);
        if(x===w-1 || mask[i+1]!==object) add(x+1,y,x+1,y+1);
        if(y===h-1 || mask[i+w]!==object) add(x+1,y+1,x,y+1);
        if(x===0 || mask[i-1]!==object) add(x,y+1,x,y);
      }
      ctx.strokeStyle=local.outlineColor; ctx.lineWidth=local.outlineWidth*scale; ctx.beginPath();
      while(edges.size) {
        const first=edges.keys().next().value; let current=first,guard=0; ctx.moveTo(first%stride,Math.floor(first/stride));
        do { const next=edges.get(current); if(!next?.length) break; const end=next.pop(); if(!next.length) edges.delete(current); ctx.lineTo(end%stride,Math.floor(end/stride)); current=end; } while(current!==first && guard++<100000);
        if(current===first) ctx.closePath();
      }
      ctx.stroke();
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap, lines: lineCount,depthEdges:depthPaths.length, ms: Math.round(performance.now() - start), coveredPixels: mask.reduce((s, v) => s + (v > 0), 0) }, [bitmap]);
  } catch (e) { self.postMessage({ id: data.id, error: e.message }); }
};

function depthContours(mask,z,w,h,scale,style){
  const ids=[...new Set(mask)].filter(Boolean);if(!ids.some(id=>style(id).depthOutline))return [];
  const count=w*h,strength=new Float32Array(count),direction=new Int8Array(count),edges=new Uint8Array(count);
  const axes=[[1,0],[0,1],[-1,0],[0,-1]];
  const pixel=(x,y)=>x>=0&&y>=0&&x<w&&y<h?y*w+x:-1;
  // Score the closer side of a depth jump. Subtract the continuing surface
  // slope on either side, so a tilted plane does not become a band of ink.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,object=mask[i];if(!object)continue;const p=style(object);if(!p.depthOutline)continue;
    const r=Math.max(1,Math.round(p.depthRadius*scale));
    for(let d=0;d<4;d++){
      const [vx,vy]=axes[d],j=pixel(x+vx*r,y+vy*r);if(j<0||!mask[j]||(!p.depthAcross&&mask[j]!==object))continue;
      const jump=z[j]-z[i];if(jump<=p.depthFloor)continue;
      const a=pixel(x-vx*r,y-vy*r),b=pixel(x+vx*r*2,y+vy*r*2);let slope=0,samples=0;
      if(a>=0&&mask[a]===object){slope+=Math.abs(z[i]-z[a]);samples++;}
      if(b>=0&&mask[b]===mask[j]){slope+=Math.abs(z[b]-z[j]);samples++;}
      const residual=jump-(samples?slope/samples:0)*p.depthSlope;
      if(residual<=p.depthFloor)continue;const score=residual/Math.max(.02,z[i]);
      if(score>=p.depthThreshold&&score>strength[i]){strength[i]=score;direction[i]=d;}
    }
  }
  // Collapse the sampled band to a single contour, with deterministic ties
  // toward the farther neighbor. Thickness is supplied only by the stroke.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!strength[i])continue;const [vx,vy]=axes[direction[i]],a=pixel(x-vx,y-vy),b=pixel(x+vx,y+vy);
    const sa=a>=0&&mask[a]===mask[i]?strength[a]:0,sb=b>=0&&mask[b]===mask[i]?strength[b]:0;
    if(strength[i]>=sa&&strength[i]>sb)edges[i]=1;
  }
  const offsets=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],visited=new Uint8Array(count),paths=[];
  function neighbors(i){const x=i%w,y=Math.floor(i/w),list=[];
    for(let d=0;d<8;d++){const [vx,vy]=offsets[d],j=pixel(x+vx,y+vy);if(j<0||!edges[j]||mask[j]!==mask[i])continue;
      if(vx&&vy){const a=pixel(x+vx,y),b=pixel(x,y+vy);if((a>=0&&edges[a]&&mask[a]===mask[i])||(b>=0&&edges[b]&&mask[b]===mask[i]))continue;}
      list.push([j,d]);
    }return list;
  }
  function trace(first,next,d){const points=[first%w+.5,Math.floor(first/w)+.5];let current=first,length=0,guard=0;
    while(guard++<count){visited[current]|=1<<d;visited[next]|=1<<((d+4)%8);length+=Math.hypot(next%w-current%w,Math.floor(next/w)-Math.floor(current/w));points.push(next%w+.5,Math.floor(next/w)+.5);current=next;if(current===first)break;
      const links=neighbors(current);if(links.length!==2)break;const unused=links.find(([,k])=>!(visited[current]&(1<<k)));if(!unused)break;[next,d]=unused;
    }
    const p=style(mask[first]);if(length<p.depthMinLength*scale||points.length<4)return;
    const closed=current===first;
    for(let pass=0;pass<Math.round(p.depthSmooth);pass++){const old=[...points],n=old.length/2;
      for(let k=closed?0:1;k<(closed?n-1:n-1);k++){const prev=closed?(k+n-2)%(n-1):k-1,next=closed?(k+1)%(n-1):k+1;for(let a=0;a<2;a++)points[k*2+a]=old[prev*2+a]*.25+old[k*2+a]*.5+old[next*2+a]*.25;}
      if(closed){points[points.length-2]=points[0];points[points.length-1]=points[1];}
    }
    paths.push({object:mask[first],points,length});
  }
  for(let i=0;i<count;i++)if(edges[i]){const links=neighbors(i);if(links.length===2)continue;for(const [j,d]of links)if(!(visited[i]&(1<<d)))trace(i,j,d);}
  for(let i=0;i<count;i++)if(edges[i])for(const [j,d]of neighbors(i))if(!(visited[i]&(1<<d)))trace(i,j,d);
  return paths;
}
