// Evenly spaced, bidirectional screen-space streamlines with midpoint integration.
// The GPU supplies visible depth, normals, lighting and projected curvature lines.
self.onmessage = ({ data }) => {
  const start = performance.now();
  try {
    const { id, width: w, height: h, normal, field, depth, params: p, scale } = data;
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
    if (p.cavity > 0) for (let y = radius; y < h - radius; y++) for (let x = radius; x < w - radius; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      let occlusion = 0;
      for (const offset of [-radius, radius, -radius * w, radius * w]) {
        const j = i + offset;
        if (mask[j] && z[i] - z[j] > 0.035 && z[i] - z[j] < 0.8) occlusion += Math.min(1, (z[i] - z[j]) * 3);
      }
      shade[i] = Math.max(0, shade[i] - occlusion * 0.065 * p.cavity);
    }
    const minSpace = p.spacing * scale, maxSpace = p.lightSpacing * scale;
    const spacing = new Float32Array(count), darkness = new Float32Array(count);
    for (let i = 0; i < count; i++) if (mask[i]) {
      darkness[i] = Math.max(0, 1 - Math.pow(shade[i], p.contrast));
      const distance = (z[i] - zmin) / Math.max(0.001, zmax - zmin);
      spacing[i] = (minSpace + (maxSpace - minSpace) * Math.pow(shade[i], p.contrast)) * (1 + distance * p.depthSpacing);
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
      const angle = 0.5 * Math.atan2(b, a) + p.angle * Math.PI / 180 + (cross ? Math.PI / 2 : 0);
      let u = Math.cos(angle), v = Math.sin(angle);
      if (u * px + v * py < 0) { u = -u; v = -v; }
      return [u, v];
    }
    const allPaths = [];
    let lineCount = 0;
    function layer(cross) {
      const cell = Math.max(2, minSpace * 0.75), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      const bins = new Array(gw * gh), threshold = cross ? p.crossThreshold : p.highlight;
      const queue = [], seeds = [], step = Math.max(0.8, 1.25 * scale);
      function available(x, y, distance) {
        const bx = Math.floor(x / cell), by = Math.floor(y / cell), range = Math.ceil(distance / cell), d2 = distance * distance;
        for (let yy = Math.max(0, by - range); yy <= Math.min(gh - 1, by + range); yy++) for (let xx = Math.max(0, bx - range); xx <= Math.min(gw - 1, bx + range); xx++) {
          const bin = bins[yy * gw + xx]; if (!bin) continue;
          for (let j = 0; j < bin.length; j += 2) if ((bin[j] - x) ** 2 + (bin[j + 1] - y) ** 2 < d2) return false;
        }
        return true;
      }
      function trace(sx, sy, sign) {
        const origin = pixel(sx, sy), object = mask[origin], points = [];
        let x = sx, y = sy, vx = sign, vy = 0;
        const initial = direction(x, y, 1, 0, cross); if (!initial) return points;
        vx = initial[0] * sign; vy = initial[1] * sign;
        const limit = Math.min(1800, Math.ceil(p.length * scale / (step * 2)));
        for (let j = 0; j < limit; j++) {
          const i = pixel(x, y); if (i < 0 || mask[i] !== object || darkness[i] < threshold) break;
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
        if (i >= 0 && mask[i] && darkness[i] >= threshold) seeds.push([sx, sy, darkness[i]]);
      }
      seeds.sort((a, b) => b[2] - a[2]);
      let cursor = 0, fallback = 0, attempts = 0;
      while ((cursor < queue.length || fallback < seeds.length) && attempts++ < 220000 && lineCount < 18000) {
        const seed = cursor < queue.length ? queue[cursor++] : seeds[fallback++];
        const [sx, sy] = seed, i = pixel(sx, sy);
        if (i < 0 || !mask[i] || darkness[i] < threshold || !available(sx, sy, spacing[i] * 0.95)) continue;
        const backward = trace(sx, sy, -1), forward = trace(sx, sy, 1), points = [];
        for (let j = backward.length - 2; j >= 0; j -= 2) points.push(backward[j], backward[j + 1]);
        points.push(...forward.slice(2));
        if (points.length < Math.max(10, 8 * scale)) continue;
        lineCount++; allPaths.push(points);
        for (let j = 0; j < points.length; j += 4) {
          const x = points[j], y = points[j + 1], b = Math.floor(y / cell) * gw + Math.floor(x / cell);
          (bins[b] ||= []).push(x, y);
        }
        // New seeds on both sides extend the same family of long parallel strokes.
        for (let j = 6; j < points.length - 2 && queue.length < 180000; j += Math.max(8, Math.round(14 * scale))) {
          const x = points[j], y = points[j + 1], d = direction(x, y, 1, 0, cross), pi = pixel(x, y);
          if (!d || pi < 0) continue;
          const distance = spacing[pi] * 1.08;
          queue.push([x - d[1] * distance, y + d[0] * distance], [x + d[1] * distance, y - d[0] * distance]);
        }
      }
    }
    layer(false); if (p.cross) layer(true);
    ctx.strokeStyle = p.ink; ctx.lineWidth = p.width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const path of allPaths) { ctx.moveTo(path[0], path[1]); for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]); }
    ctx.stroke();
    if (p.outline && p.outlineWidth > 0) {
      // Directed pixel boundaries form complete silhouette loops, including holes.
      const edges = new Map(), stride = w + 1;
      const add = (x1, y1, x2, y2) => { const key = y1 * stride + x1; (edges.get(key) || (edges.set(key, []), edges.get(key))).push(y2 * stride + x2); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!mask[i]) continue;
        if (y === 0 || !mask[i - w]) add(x, y, x + 1, y);
        if (x === w - 1 || !mask[i + 1]) add(x + 1, y, x + 1, y + 1);
        if (y === h - 1 || !mask[i + w]) add(x + 1, y + 1, x, y + 1);
        if (x === 0 || !mask[i - 1]) add(x, y + 1, x, y);
      }
      ctx.strokeStyle = p.outlineColor; ctx.lineWidth = p.outlineWidth * scale; ctx.beginPath();
      while (edges.size) {
        const first = edges.keys().next().value;
        let current = first, guard = 0;
        ctx.moveTo(first % stride, Math.floor(first / stride));
        do {
          const next = edges.get(current); if (!next?.length) break;
          const end = next.pop(); if (!next.length) edges.delete(current);
          ctx.lineTo(end % stride, Math.floor(end / stride)); current = end;
        } while (current !== first && guard++ < 100000);
        if (current === first) ctx.closePath();
      }
      ctx.stroke();
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap, lines: lineCount, ms: Math.round(performance.now() - start), coveredPixels: mask.reduce((s, v) => s + (v > 0), 0) }, [bitmap]);
  } catch (e) { self.postMessage({ id: data.id, error: e.message }); }
};
