// Fit a symmetric shape operator to the normal variation over a welded one-ring.
// Directions are a line field: their sign is immaterial during screen projection.
self.onmessage = ({ data: { id, position, normal, index } }) => {
  try {
    const count = position.length / 3;
    let extent = 0;
    for (let i = 0; i < position.length; i++) extent = Math.max(extent, Math.abs(position[i]));
    const tolerance = Math.max(1e-7, extent * 1e-5);
    const weld = new Map(), remap = new Uint32Array(count), points = [], normals = [];
    for (let i = 0; i < count; i++) {
      const j = i * 3, key = `${Math.round(position[j] / tolerance)},${Math.round(position[j + 1] / tolerance)},${Math.round(position[j + 2] / tolerance)}`;
      let v = weld.get(key);
      if (v === undefined) { v = points.length / 3; weld.set(key, v); points.push(position[j], position[j + 1], position[j + 2]); normals.push(0, 0, 0); }
      remap[i] = v;
      for (let k = 0; k < 3; k++) normals[v * 3 + k] += normal[j + k];
    }
    const n = points.length / 3, degree = new Uint32Array(n), triangles = index || Uint32Array.from({ length: count }, (_, i) => i);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = remap[triangles[i]], b = remap[triangles[i + 1]], c = remap[triangles[i + 2]];
      if (a === b || b === c || c === a) continue;
      degree[a] += 2; degree[b] += 2; degree[c] += 2;
    }
    const offsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
    const neighbors = new Uint32Array(offsets[n]), cursor = offsets.slice();
    for (let i = 0; i < triangles.length; i += 3) {
      const a = remap[triangles[i]], b = remap[triangles[i + 1]], c = remap[triangles[i + 2]];
      if (a === b || b === c || c === a) continue;
      neighbors[cursor[a]++] = b; neighbors[cursor[a]++] = c;
      neighbors[cursor[b]++] = a; neighbors[cursor[b]++] = c;
      neighbors[cursor[c]++] = a; neighbors[cursor[c]++] = b;
    }
    const dirs = new Float32Array(n * 3), guides = new Float32Array(n * 3), confidence = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = i * 3, m = Math.hypot(normals[j], normals[j + 1], normals[j + 2]) || 1;
      normals[j] /= m; normals[j + 1] /= m; normals[j + 2] /= m;
    }
    for (let i = 0; i < n; i++) {
      const j = i * 3, nx = normals[j], ny = normals[j + 1], nz = normals[j + 2];
      // Circumferential fallback for isotropic/flat regions (stable in object space).
      let ux = nz, uy = 0, uz = -nx;
      if (Math.hypot(ux, uz) < 0.1) { ux = 0; uy = -nz; uz = ny; }
      const um = Math.hypot(ux, uy, uz) || 1; ux /= um; uy /= um; uz /= um;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
      guides.set([ux, uy, uz], j);
      let xx = 0, xy = 0, yy = 0, r0 = 0, r1 = 0, r2 = 0;
      for (let s = offsets[i]; s < offsets[i + 1]; s++) {
        const k = neighbors[s] * 3, dot = nx * normals[k] + ny * normals[k + 1] + nz * normals[k + 2];
        if (dot < 0.25) continue;
        const dx = points[k] - points[j], dy = points[k + 1] - points[j + 1], dz = points[k + 2] - points[j + 2];
        const x = dx * ux + dy * uy + dz * uz, y = dx * vx + dy * vy + dz * vz;
        const dnx = normals[k] - nx, dny = normals[k + 1] - ny, dnz = normals[k + 2] - nz;
        const a = dnx * ux + dny * uy + dnz * uz, b = dnx * vx + dny * vy + dnz * vz;
        const weight = 1 / Math.max(1e-10, x * x + y * y);
        xx += x * x * weight; xy += x * y * weight; yy += y * y * weight;
        r0 += x * a * weight; r1 += (y * a + x * b) * weight; r2 += y * b * weight;
      }
      // Solve [xx xy 0; xy xx+yy xy; 0 xy yy] [a b c] = r.
      const eps = 1e-5, aa = xx + eps, cc = yy + eps;
      const b = (r1 - xy * r0 / aa - xy * r2 / cc) / Math.max(eps, xx + yy + eps - xy * xy / aa - xy * xy / cc);
      const a = (r0 - xy * b) / aa, c = (r2 - xy * b) / cc;
      const delta = Math.hypot(a - c, 2 * b), k1 = (a + c + delta) * 0.5, k2 = (a + c - delta) * 0.5;
      // Low principal curvature follows the long axis of ridges and valleys.
      let angle = 0.5 * Math.atan2(2 * b, a - c);
      if (Math.abs(k1) > Math.abs(k2)) angle += Math.PI / 2;
      const co = Math.cos(angle), si = Math.sin(angle);
      dirs.set([ux * co + vx * si, uy * co + vy * si, uz * co + vz * si], j);
      confidence[i] = Math.min(1, delta / (Math.abs(k1) + Math.abs(k2) + 0.08));
    }
    // Parallel-transport neighbor lines onto each tangent plane before smoothing.
    let smoothed = dirs;
    for (let pass = 0; pass < 3; pass++) {
      const next = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const j = i * 3, nx = normals[j], ny = normals[j + 1], nz = normals[j + 2];
        let x = smoothed[j] * 3, y = smoothed[j + 1] * 3, z = smoothed[j + 2] * 3;
        for (let s = offsets[i]; s < offsets[i + 1]; s++) {
          const k = neighbors[s] * 3;
          if (nx * normals[k] + ny * normals[k + 1] + nz * normals[k + 2] < 0.75) continue;
          const sign = smoothed[j] * smoothed[k] + smoothed[j + 1] * smoothed[k + 1] + smoothed[j + 2] * smoothed[k + 2] < 0 ? -1 : 1;
          const w = 0.5 * sign; x += smoothed[k] * w; y += smoothed[k + 1] * w; z += smoothed[k + 2] * w;
        }
        const d = x * nx + y * ny + z * nz; x -= d * nx; y -= d * ny; z -= d * nz;
        const m = Math.hypot(x, y, z) || 1; next.set([x / m, y / m, z / m], j);
      }
      smoothed = next;
    }
    const flow = new Float32Array(count * 3), guide = new Float32Array(count * 3), anisotropy = new Float32Array(count);
    for (let i = 0; i < count; i++) { const j = remap[i]; flow.set(smoothed.subarray(j * 3, j * 3 + 3), i * 3); guide.set(guides.subarray(j * 3, j * 3 + 3), i * 3); anisotropy[i] = confidence[j]; }
    self.postMessage({ id, flow, guide, anisotropy }, [flow.buffer, guide.buffer, anisotropy.buffer]);
  } catch (e) { self.postMessage({ id, error: e.message }); }
};
