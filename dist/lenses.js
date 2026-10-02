export const cameraDefaults = { projection: 'perspective', fov: 35, orthoSize: 5, distortion: 0.5, near: 0.05, far: 120, position: [5, 3.1, 7.8], target: [0, 0, 0], up: [0, 1, 0] };
export const projections = [['perspective', 'Perspective'], ['orthographic', 'Orthographic'], ['fisheye', 'Fisheye · equidistant'], ['barrel', 'Barrel distortion'], ['pincushion', 'Pincushion distortion']];
export const isLens = projection => ['fisheye', 'barrel', 'pincushion'].includes(projection);

// Map output coordinates to the rectilinear source image. Coordinates use
// vertical half-height units, so circles remain circular at any aspect ratio.
export function lensMap(x, y, settings) {
  const r = Math.hypot(x, y);
  if (settings.projection === 'fisheye') {
    if (r > 1) return null;
    const theta = r * settings.fov * Math.PI / 360;
    const denominator = Math.tan((settings.sourceFov || settings.fov) * Math.PI / 360);
    const factor = r < 1e-8 ? settings.fov * Math.PI / 360 / denominator : Math.tan(theta) / (r * denominator);
    return [x * factor, y * factor];
  }
  const k = (settings.projection === 'barrel' ? 0.35 : -0.12) * settings.distortion;
  const q = r * r / Math.max(1, settings.aspect * settings.aspect);
  return [x * (1 + k * q), y * (1 + k * q)];
}

export const lensFragmentShader = `
uniform sampler2D image; uniform float aspect; uniform int lens; uniform float fov; uniform float sourceFov; uniform float strength; uniform vec4 background;
varying vec2 vUv;
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0);
  float r = length(p); vec2 q = p; bool outside = false;
  if (lens == 1) {
    outside = r > 1.0;
    float a = fov * 0.00872664626;
    float b = sourceFov * 0.00872664626;
    float factor = r < 0.000001 ? a/tan(b) : tan(r*a)/(r*tan(b)); q *= factor;
  } else {
    float k = (lens == 2 ? 0.35 : -0.12) * strength;
    q *= 1.0 + k * dot(p,p) / max(1.0, aspect*aspect);
  }
  vec2 uv = q / vec2(aspect,1.0) * 0.5 + 0.5;
  if (outside || any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) gl_FragColor = background;
  else gl_FragColor = texture2D(image, uv);
  #include <colorspace_fragment>
}`;

// Warp all geometry buffers before tracing. The inverse mapping's Jacobian
// transports the tangent field into lens space; strokes are then traced with
// constant output-space widths rather than distorting an already drawn image.
export function warpBuffers(normal, field, depth, w, h, settings) {
  if (!isLens(settings.projection)) return { normal, field, depth };
  settings = { ...settings, aspect: w / h };
  const n = new Uint8Array(normal.length), f = new Uint8Array(field.length), d = new Uint8Array(depth.length);
  const epsilon = 0.001;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = (2 * (x + 0.5) / w - 1) * settings.aspect, py = 2 * (y + 0.5) / h - 1;
    const q = lensMap(px, py, settings); if (!q) continue;
    const sx = Math.floor((q[0] / settings.aspect + 1) * w / 2), sy = Math.floor((q[1] + 1) * h / 2);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const src = (sy * w + sx) * 4, dst = (y * w + x) * 4;
    if (!normal[src + 3]) continue;
    for (let k = 0; k < 4; k++) { n[dst + k] = normal[src + k]; f[dst + k] = field[src + k]; d[dst + k] = depth[src + k]; }
    const angle = 0.5 * Math.atan2(field[src + 1] / 127.5 - 1, field[src] / 127.5 - 1);
    // Field Y points down while the render buffers and lens coordinates point up.
    const vx = Math.cos(angle), vy = -Math.sin(angle);
    const qx = lensMap(px + epsilon, py, settings) || q, qy = lensMap(px, py + epsilon, settings) || q;
    const a = (qx[0] - q[0]) / epsilon, b = (qy[0] - q[0]) / epsilon, c = (qx[1] - q[1]) / epsilon, e = (qy[1] - q[1]) / epsilon;
    const determinant = a * e - b * c;
    if (Math.abs(determinant) < 1e-8) continue;
    const ux = (e * vx - b * vy) / determinant, uy = -(-c * vx + a * vy) / determinant, length = Math.hypot(ux, uy) || 1;
    f[dst] = Math.round(((ux * ux - uy * uy) / (length * length) + 1) * 127.5);
    f[dst + 1] = Math.round((2 * ux * uy / (length * length) + 1) * 127.5);
  }
  return { normal: n, field: f, depth: d };
}
