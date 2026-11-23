/*
  Super Muffler Inc. - 3D exhaust explorer
  X-ray car with a full dual exhaust (headers, catalytic converters, X-pipe,
  mufflers, tailpipes). The muffler is the "selected" part by default.

  Build:  npx esbuild src/exhaust3d.src.js --bundle --format=esm --minify --outfile=js/exhaust3d.js
*/
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, LineSegments, Points,
  BufferGeometry, Float32BufferAttribute, BufferAttribute, ShaderMaterial,
  MeshStandardMaterial, Color, Vector3, Quaternion, CatmullRomCurve3,
  TubeGeometry, LatheGeometry, Vector2, TorusGeometry, CylinderGeometry,
  BoxGeometry, SphereGeometry, PlaneGeometry, AdditiveBlending,
  DoubleSide, PMREMGenerator, ACESFilmicToneMapping, SRGBColorSpace,
  DirectionalLight, Raycaster
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const PART_IDS = ['headers', 'cat', 'muffler', 'tips'];

const PRESETS = {
  overview: { target: [0, 0.42, 0], theta: 0.72, phi: 1.12, radius: 6.6 },
  headers:  { target: [1.45, 0.50, 0.25], theta: 1.00, phi: 1.02, radius: 3.1 },
  cat:      { target: [0.55, 0.22, 0.20], theta: 0.50, phi: 1.18, radius: 3.0 },
  muffler:  { target: [-0.80, 0.22, 0.25], theta: 0.30, phi: 1.16, radius: 3.1 },
  tips:     { target: [-2.10, 0.30, 0.35], theta: -0.85, phi: 1.20, radius: 3.0 }
};

const ANCHORS = {
  headers: [1.62, 0.98, 0.30],
  cat:     [0.60, 0.17, 0.30],
  muffler: [-0.80, 0.21, 0.38],
  tips:    [-2.33, 0.24, 0.48]
};

/* ---------- small helpers ---------- */
const V = (x, y, z) => new Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// display-space color (additive shaders add light in sRGB space for predictable brightness)
const srgb = c => new Color(c).convertLinearToSRGB();
// smooth capsule-like profile for lathe glows: radius r, half-length h
const capsule = (r, h, n = 18) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const y = Math.sin(a), x = Math.cos(a);
    pts.push([Math.max(0.004, r * Math.pow(Math.abs(x), 0.45)), h * Math.sign(y) * Math.pow(Math.abs(y), 2.2)]);
  }
  return pts;
};
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Monotone cubic interpolation (no overshoot) for body profiles
function spline(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Lofted body: superellipse cross-sections along X, closed with end caps
function loft({ x0, x1, nx, nt, bottom, top, width, expo }) {
  const pos = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const b = bottom(x), t = top(x), mid = (b + t) / 2, half = Math.max((t - b) / 2, 0.0005);
    for (let j = 0; j < nt; j++) {
      const th = (j / nt) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / expo);
      const sz = Math.sign(c) * Math.pow(Math.abs(c), 2 / expo);
      pos.push(x, mid + half * sy, width(x, (sy + 1) / 2) * sz);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const a = i * nt + j, b = i * nt + (j + 1) % nt, c = (i + 1) * nt + j, d = (i + 1) * nt + (j + 1) % nt;
    idx.push(a, c, b, b, c, d);
  }
  // caps
  const rings = [0, nx];
  rings.forEach((ri, k) => {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < nt; j++) { const p = (ri * nt + j) * 3; cx += pos[p]; cy += pos[p + 1]; cz += pos[p + 2]; }
    const center = pos.length / 3;
    pos.push(cx / nt, cy / nt, cz / nt);
    for (let j = 0; j < nt; j++) {
      const a = ri * nt + j, b = ri * nt + (j + 1) % nt;
      if (k === 0) idx.push(center, a, b); else idx.push(center, b, a);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // rib lines: some cross sections + some longitudinal lines
  const lines = [];
  const P = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let i = 2; i < nx - 1; i += 4) for (let j = 0; j < nt; j++) {
    lines.push(...P(i * nt + j), ...P(i * nt + (j + 1) % nt));
  }
  const longi = 12;
  for (let k = 0; k < longi; k++) {
    const j = Math.round((k / longi) * nt) % nt;
    for (let i = 0; i < nx; i++) lines.push(...P(i * nt + j), ...P((i + 1) * nt + j));
  }
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new Float32BufferAttribute(lines, 3));
  return { geo, lineGeo };
}

/* ---------- shaders ---------- */
const ghostVert = /* glsl */`
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const ghostFrag = /* glsl */`
  uniform vec3 uColor; uniform vec3 uScanColor;
  uniform float uReveal; uniform float uOpacity; uniform float uStrength; uniform float uPower;
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(normalize(vN), V));
    f = pow(f, uPower);
    float vis = smoothstep(uReveal - 0.02, uReveal + 0.14, vW.x);
    float live = step(-2.75, uReveal) * step(uReveal, 2.75);
    float scan = exp(-abs(vW.x - uReveal) * 22.0) * live;
    float a = (0.018 + f * 0.36) * vis * uOpacity * uStrength;
    gl_FragColor = vec4(uColor * a + uScanColor * scan * 0.8, 1.0);
  }`;
const lineVert = /* glsl */`
  varying vec3 vW;
  void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const lineFrag = /* glsl */`
  uniform vec3 uColor; uniform float uReveal; uniform float uOpacity; uniform float uStrength;
  varying vec3 vW;
  void main(){
    float vis = smoothstep(uReveal - 0.02, uReveal + 0.14, vW.x);
    gl_FragColor = vec4(uColor * 0.085 * vis * uOpacity * uStrength, 1.0);
  }`;
const glowFrag = /* glsl */`
  uniform vec3 uColor; uniform float uIntensity;
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(normalize(vN), V));
    float a = (pow(f, 1.6) * 0.55 + 0.04) * uIntensity;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;
const pointsVert = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uScale;
  varying float vA; varying vec3 vC;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vA = aAlpha; vC = aColor;
  }`;
const pointsFrag = /* glsl */`
  varying float vA; varying vec3 vC;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d); a *= a;
    gl_FragColor = vec4(vC * a * vA, 1.0);
  }`;
const floorVert = /* glsl */`
  varying vec2 vP;
  void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const floorFrag = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity; uniform float uH; uniform float uFade;
  varying vec2 vP;
  float grid(vec2 p, float s){
    vec2 q = p * s;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main(){
    float r = length(vP * vec2(0.5, 0.78));
    float fade = smoothstep(3.9, 0.4, r);
    float a = (grid(vP, 4.0) * 0.07 + grid(vP, 1.0) * 0.16) * fade * uOpacity;
    a *= smoothstep(uH, uH - uFade, gl_FragCoord.y);
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;
const shadowFrag = /* glsl */`
  varying vec2 vP;
  void main(){
    float d = length(vP / vec2(2.55, 1.05));
    float a = smoothstep(1.0, 0.15, d) * 0.55;
    gl_FragColor = vec4(0.0, 0.0, 0.02, a);
  }`;

/* ---------- main ---------- */
export function mountExhaust(container, opts = {}) {
  const {
    labels = {},
    onFocus = () => {},
    onIntroDone = () => {},
    reducedMotion = false,
    // where the car sits inside the canvas (fractions): center x/y and the share of width/height it may use
    frame = () => ({ cx: 0.5, cy: 0.5, sx: 1, sy: 1 }),
    bg = '#0c1a3d',
    startAt = 0, // seconds into the intro (used to render posters)
    glow = '#1d3f95'
  } = opts;

  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.6 : 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(new Color(bg), 1);
  const canvas = renderer.domElement;
  canvas.className = 'x3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const camera = new PerspectiveCamera(32, 1, 0.05, 80);

  // background: flat brand navy with a soft glow behind the car (drawn in WebGL so additive light composites correctly)
  const bgMat = new ShaderMaterial({
    uniforms: { uBg: { value: new Color(bg) }, uGlow: { value: new Color(glow) }, uCenter: { value: new Vector2() }, uSize: { value: 1 } },
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `uniform vec3 uBg; uniform vec3 uGlow; uniform vec2 uCenter; uniform float uSize;
      void main(){
        vec2 d = (gl_FragCoord.xy - uCenter) / uSize;
        d.y *= 1.5;
        float g = smoothstep(1.0, 0.0, length(d));
        gl_FragColor = vec4(mix(uBg, uGlow, g * g * 0.9), 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false, depthTest: false
  });
  const bgQuad = new Mesh(new PlaneGeometry(2, 2), bgMat);
  bgQuad.frustumCulled = false; bgQuad.renderOrder = -10;
  scene.add(bgQuad);

  /* shared ghost uniforms */
  const shared = {
    uReveal: { value: reducedMotion ? -3 : 2.75 },
    uOpacity: { value: 1 },
    uScanColor: { value: srgb('#ff3b2f') }
  };
  const ghostMat = (color, strength = 1, power = 2.3) => new ShaderMaterial({
    uniforms: { ...shared, uColor: { value: srgb(color) }, uStrength: { value: strength }, uPower: { value: power } },
    vertexShader: ghostVert, fragmentShader: ghostFrag,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide
  });
  const lineMat = (color, strength = 1) => new ShaderMaterial({
    uniforms: { ...shared, uColor: { value: srgb(color) }, uStrength: { value: strength } },
    vertexShader: lineVert, fragmentShader: lineFrag,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });

  const car = new Group();
  scene.add(car);

  /* ---------- floor ---------- */
  const floor = new Mesh(new PlaneGeometry(16, 16).rotateX(-Math.PI / 2), new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#9fb6ff') }, uOpacity: { value: 1 }, uH: { value: 1000 }, uFade: { value: 100 } },
    vertexShader: floorVert, fragmentShader: floorFrag, transparent: true, depthWrite: false
  }));
  floor.renderOrder = 0;
  scene.add(floor);
  const shadow = new Mesh(new PlaneGeometry(7, 4).rotateX(-Math.PI / 2), new ShaderMaterial({
    vertexShader: floorVert, fragmentShader: shadowFrag, transparent: true, depthWrite: false
  }));
  shadow.position.y = 0.002;
  shadow.renderOrder = 1;
  scene.add(shadow);

  /* ---------- x-ray body ---------- */
  const bodyColor = '#b9caff';
  const lowerBottom = spline([[-2.34, 0.47], [-2.28, 0.33], [-2.0, 0.27], [-1.0, 0.22], [1.0, 0.22], [2.05, 0.26], [2.28, 0.33], [2.34, 0.47]]);
  const lowerTop = spline([[-2.34, 0.52], [-2.28, 0.78], [-2.0, 0.89], [-1.3, 0.91], [0.9, 0.87], [1.6, 0.81], [2.12, 0.74], [2.28, 0.65], [2.34, 0.52]]);
  const lowerW = spline([[-2.34, 0.5], [-2.28, 0.84], [-2.0, 0.9], [0, 0.93], [2.0, 0.9], [2.28, 0.82], [2.34, 0.5]]);
  const lower = loft({
    x0: -2.34, x1: 2.34, nx: 72, nt: 56, expo: 4.6,
    bottom: lowerBottom, top: lowerTop,
    width: (x, t) => lowerW(x) * (0.95 + 0.05 * Math.sin(Math.PI * t))
  });
  const cabTop = spline([[-1.28, 0.86], [-1.06, 1.08], [-0.75, 1.3], [-0.4, 1.36], [0.2, 1.36], [0.46, 1.28], [0.76, 1.05], [0.98, 0.86]]);
  const cabin = loft({
    x0: -1.28, x1: 0.98, nx: 44, nt: 48, expo: 3.3,
    bottom: () => 0.84, top: cabTop,
    width: (x, t) => 0.86 + (0.66 - 0.86) * t
  });
  const bodyMat = ghostMat(bodyColor, 1, 2.4);
  const bodyLineMat = lineMat(bodyColor, 1);
  [lower, cabin].forEach(b => {
    const m = new Mesh(b.geo, bodyMat); m.renderOrder = 5; car.add(m);
    const l = new LineSegments(b.lineGeo, bodyLineMat); l.renderOrder = 4; car.add(l);
  });

  // wheels
  const wheelMat = ghostMat(bodyColor, 0.7, 1.8);
  const tireGeo = new TorusGeometry(0.26, 0.085, 14, 40);
  const rimGeo = new TorusGeometry(0.17, 0.012, 6, 32);
  const hubGeo = new CylinderGeometry(0.05, 0.05, 0.05, 16).rotateX(Math.PI / 2);
  const spokeGeo = new BoxGeometry(0.018, 0.32, 0.012);
  [[1.42, 0.79], [1.42, -0.79], [-1.42, 0.79], [-1.42, -0.79]].forEach(([x, z]) => {
    const w = new Group();
    w.position.set(x, 0.345, z);
    [tireGeo, rimGeo, hubGeo].forEach(g => { const m = new Mesh(g, wheelMat); m.renderOrder = 5; w.add(m); });
    for (let k = 0; k < 5; k++) { const s = new Mesh(spokeGeo, wheelMat); s.rotation.z = (k / 5) * Math.PI; s.renderOrder = 5; w.add(s); }
    car.add(w);
  });

  // engine block (ghost)
  const engineMat = ghostMat('#ffd2b0', 0.55, 1.8);
  const engine = new Mesh(new BoxGeometry(0.62, 0.42, 0.54, 2, 2, 2), engineMat);
  engine.position.set(1.55, 0.64, 0);
  engine.renderOrder = 5;
  car.add(engine);
  const valveCovers = [-1, 1].map(s => {
    const m = new Mesh(new BoxGeometry(0.56, 0.08, 0.14), engineMat);
    m.position.set(1.55, 0.88, 0.17 * s); m.rotation.x = 0.35 * s; m.renderOrder = 5; car.add(m); return m;
  });

  /* ---------- exhaust ---------- */
  const steel = new MeshStandardMaterial({ color: '#c3c8cf', metalness: 1, roughness: 0.28 });
  const parts = {};
  PART_IDS.forEach(id => {
    parts[id] = {
      solids: [], glows: [], anchor: V(...ANCHORS[id]),
      mat: null, glowMat: null, rest: 0, current: 0, flash: 0, appear: reducedMotion ? 1 : 0, u: 0, shown: reducedMotion
    };
  });
  const makeGlowMat = color => new ShaderMaterial({
    uniforms: { uColor: { value: srgb(color) }, uIntensity: { value: 0 } },
    vertexShader: ghostVert, fragmentShader: glowFrag,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide
  });

  parts.headers.mat = new MeshStandardMaterial({ color: '#dcd6cc', metalness: 1, roughness: 0.2, emissive: '#ff2a1a', emissiveIntensity: 0 });
  parts.cat.mat = new MeshStandardMaterial({ color: '#aeb4bd', metalness: 1, roughness: 0.42, emissive: '#ff2a1a', emissiveIntensity: 0 });
  parts.muffler.mat = new MeshStandardMaterial({ color: '#c8241c', metalness: 0.55, roughness: 0.3, emissive: '#ff2a1a', emissiveIntensity: 0 });
  parts.tips.mat = new MeshStandardMaterial({ color: '#eef1f5', metalness: 1, roughness: 0.1, emissive: '#ff2a1a', emissiveIntensity: 0 });
  PART_IDS.forEach(id => { parts[id].glowMat = makeGlowMat('#ff3b2f'); });

  const drawables = []; // tube meshes animated by draw range {mesh, start, end, count}

  const sides = [1, -1];
  const mainCurves = sides.map(s => new CatmullRomCurve3([
    V(1.12, 0.30, 0.36 * s), V(0.98, 0.20, 0.34 * s), V(0.80, 0.17, 0.31 * s),
    V(0.40, 0.17, 0.27 * s), V(0.18, 0.17, 0.14 * s), V(0.02, 0.17, 0.05 * s),
    V(-0.14, 0.17, 0.14 * s), V(-0.40, 0.18, 0.30 * s), V(-0.55, 0.19, 0.36 * s),
    V(-1.05, 0.19, 0.36 * s), V(-1.25, 0.24, 0.38 * s), V(-1.42, 0.41, 0.40 * s),
    V(-1.62, 0.31, 0.42 * s), V(-2.05, 0.24, 0.46 * s), V(-2.37, 0.24, 0.48 * s)
  ], false, 'catmullrom', 0.35));

  // arc-length fraction of the curve closest to a point
  const uNear = (curve, p) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 400; i++) {
      const d = curve.getPointAt(i / 400).distanceToSquared(p);
      if (d < bd) { bd = d; best = i / 400; }
    }
    return best;
  };

  mainCurves.forEach((curve, k) => {
    const s = sides[k];
    const tube = new Mesh(new TubeGeometry(curve, 280, 0.032, 12, false), steel);
    car.add(tube);
    drawables.push({ mesh: tube, start: 0.36, end: 0.92, count: tube.geometry.index.count });

    // headers: 4 primaries + collector
    [1.32, 1.47, 1.62, 1.77].forEach(px => {
      const c = new CatmullRomCurve3([
        V(px, 0.56, 0.29 * s), V(px - 0.02, 0.53, 0.41 * s),
        V((px + 1.22) / 2, 0.41, 0.42 * s), V(1.23, 0.335, 0.385 * s)
      ], false, 'catmullrom', 0.5);
      const m = new Mesh(new TubeGeometry(c, 48, 0.021, 8, false), parts.headers.mat);
      m.userData.draw = true;
      car.add(m); parts.headers.solids.push(m);
      drawables.push({ mesh: m, start: 0.22, end: 0.42, count: m.geometry.index.count });
      const g = new Mesh(new TubeGeometry(c, 32, 0.05, 8, false), parts.headers.glowMat);
      g.renderOrder = 6; car.add(g); parts.headers.glows.push(g);
    });
    const coll = orientedLathe([[0.034, -0.08], [0.04, -0.03], [0.055, 0.04], [0.06, 0.08]], V(1.17, 0.315, 0.37 * s), V(1.24, 0.34, 0.385 * s).sub(V(1.10, 0.29, 0.36 * s)), parts.headers.mat);
    car.add(coll); parts.headers.solids.push(coll);

    // catalytic converter
    const catP0 = V(0.80, 0.17, 0.31 * s), catP1 = V(0.40, 0.17, 0.27 * s);
    const catCenter = catP0.clone().add(catP1).multiplyScalar(0.5);
    const cat = orientedLathe(
      [[0.033, -0.2], [0.046, -0.185], [0.07, -0.15], [0.08, -0.12], [0.08, 0.12], [0.07, 0.15], [0.046, 0.185], [0.033, 0.2]],
      catCenter, catP0.clone().sub(catP1), parts.cat.mat, 40);
    car.add(cat); parts.cat.solids.push(cat);
    [-0.08, 0, 0.08].forEach(o => {
      const r = new Mesh(new TorusGeometry(0.081, 0.004, 6, 32).rotateX(Math.PI / 2), parts.cat.mat);
      r.position.y = o; cat.add(r);
    });
    const catGlow = orientedLathe(capsule(0.11, 0.25), catCenter, catP0.clone().sub(catP1), parts.cat.glowMat, 32);
    catGlow.renderOrder = 6; car.add(catGlow); parts.cat.glows.push(catGlow);
    if (k === 0) parts.cat.u = uNear(curve, catCenter);

    // muffler (oval, red)
    const mufCenter = V(-0.80, 0.19, 0.36 * s);
    const mufGeo = new LatheGeometry([
      [0, -0.28], [0.06, -0.28], [0.105, -0.272], [0.126, -0.255], [0.13, -0.23],
      [0.13, 0.23], [0.126, 0.255], [0.105, 0.272], [0.06, 0.28], [0, 0.28]
    ].map(p => new Vector2(p[0], p[1])), 56);
    mufGeo.rotateZ(-Math.PI / 2); mufGeo.scale(1, 0.68, 1.12); mufGeo.computeVertexNormals();
    const muf = new Mesh(mufGeo, parts.muffler.mat);
    muf.position.copy(mufCenter);
    car.add(muf); parts.muffler.solids.push(muf);
    [-0.2, 0.2].forEach(o => {
      const rg = new TorusGeometry(0.131, 0.006, 6, 48); rg.rotateY(Math.PI / 2); rg.scale(1, 0.68, 1.12);
      const r = new Mesh(rg, steel); r.position.x = o; muf.add(r);
    });
    const mufGlowGeo = new LatheGeometry(capsule(0.18, 0.36).map(p => new Vector2(p[0], p[1])), 48);
    mufGlowGeo.rotateZ(-Math.PI / 2); mufGlowGeo.scale(1, 0.72, 1.1); mufGlowGeo.computeVertexNormals();
    const mufGlow = new Mesh(mufGlowGeo, parts.muffler.glowMat);
    mufGlow.position.copy(mufCenter); mufGlow.renderOrder = 6;
    car.add(mufGlow); parts.muffler.glows.push(mufGlow);
    if (k === 0) parts.muffler.u = uNear(curve, mufCenter);

    // chrome tips
    const tipCenter = V(-2.30, 0.24, 0.48 * s);
    const tip = new Group(); tip.position.copy(tipCenter);
    const outer = new Mesh(new CylinderGeometry(0.052, 0.052, 0.19, 32, 1, true).rotateZ(Math.PI / 2), parts.tips.mat);
    outer.material.side = DoubleSide;
    const inner = new Mesh(new CylinderGeometry(0.044, 0.044, 0.17, 24, 1, true).rotateZ(Math.PI / 2),
      new MeshStandardMaterial({ color: '#141518', roughness: 0.9, metalness: 0.2, side: DoubleSide }));
    const lipGeo = new TorusGeometry(0.049, 0.007, 8, 32); lipGeo.rotateY(Math.PI / 2);
    const lip = new Mesh(lipGeo, parts.tips.mat); lip.position.x = -0.095;
    tip.add(outer, inner, lip);
    car.add(tip); parts.tips.solids.push(tip);
    const tipGlow = new Mesh(new CylinderGeometry(0.1, 0.1, 0.3, 24, 1, true).rotateZ(Math.PI / 2), parts.tips.glowMat);
    tipGlow.position.copy(tipCenter); tipGlow.renderOrder = 6;
    car.add(tipGlow); parts.tips.glows.push(tipGlow);
    if (k === 0) parts.tips.u = 0.97;
  });
  parts.headers.u = 0;

  // X-pipe merge
  const xm = new Mesh(new SphereGeometry(0.06, 20, 14), steel);
  xm.scale.set(2.3, 0.85, 1.25); xm.position.set(0.02, 0.17, 0);
  car.add(xm);
  const xMerge = { mesh: xm, u: uNear(mainCurves[0], V(0.02, 0.17, 0.05)) };

  // cold-air intake (part of "headers & intakes")
  const intakePipe = new Mesh(new TubeGeometry(new CatmullRomCurve3([V(1.55, 0.88, 0), V(1.72, 0.95, -0.08), V(1.92, 0.86, -0.22)]), 24, 0.04, 10), parts.headers.mat);
  const filter = new Mesh(new CylinderGeometry(0.052, 0.078, 0.17, 24).rotateZ(Math.PI / 2),
    new MeshStandardMaterial({ color: '#d7261e', roughness: 0.55, metalness: 0.1, emissive: '#ff2a1a', emissiveIntensity: 0 }));
  filter.position.set(1.98, 0.84, -0.26); filter.rotation.y = 0.55;
  car.add(intakePipe, filter);
  parts.headers.solids.push(intakePipe, filter);
  parts.headers.extraMats = [filter.material];

  function orientedLathe(profile, center, dir, mat, seg = 32) {
    const g = new LatheGeometry(profile.map(p => new Vector2(p[0], p[1])), seg);
    const m = new Mesh(g, mat);
    m.position.copy(center);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
    return m;
  }

  /* ---------- particles: exhaust flow + tailpipe puffs ---------- */
  const pointsMat = new ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: pointsVert, fragmentShader: pointsFrag,
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending
  });
  const FLOW = isSmall ? 34 : 60;
  const PUFF = isSmall ? 10 : 16;
  const LUT = 300;
  const luts = mainCurves.map(c => { const a = []; for (let i = 0; i <= LUT; i++) a.push(c.getPointAt(i / LUT)); return a; });
  const total = FLOW * 2 + PUFF * 2;
  const pPos = new Float32Array(total * 3), pCol = new Float32Array(total * 3), pSize = new Float32Array(total), pAlpha = new Float32Array(total);
  const flow = [];
  for (let k = 0; k < 2; k++) for (let i = 0; i < FLOW; i++) flow.push({ side: k, u: Math.random(), speed: 0.16 + Math.random() * 0.06, j: Math.random() * 6.28 });
  const puffs = [];
  for (let k = 0; k < 2; k++) for (let i = 0; i < PUFF; i++) puffs.push({ side: k, age: Math.random() * 1.6, life: 1.4 + Math.random() * 0.6, v: V(0, 0, 0), p: V(0, 0, 0) });
  const pGeo = new BufferGeometry();
  pGeo.setAttribute('position', new BufferAttribute(pPos, 3));
  pGeo.setAttribute('aColor', new BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new BufferAttribute(pSize, 1));
  pGeo.setAttribute('aAlpha', new BufferAttribute(pAlpha, 1));
  const particles = new Points(pGeo, pointsMat);
  particles.frustumCulled = false;
  particles.renderOrder = 8;
  particles.visible = !reducedMotion;
  car.add(particles);
  const hot = srgb('#ffb347'), red = srgb('#ff3b26'), cool = srgb('#c8d3ea');
  const tmpC = new Color();
  let flowLevel = 0;

  function updateParticles(dt) {
    const um = parts.muffler.u + 0.05;
    flow.forEach((f, i) => {
      f.u = (f.u + f.speed * dt) % 1; if (f.u < 0) f.u += 1;
      const lut = luts[f.side], fi = f.u * LUT, i0 = Math.floor(fi), t = fi - i0;
      const a = lut[i0], b = lut[Math.min(i0 + 1, LUT)];
      pPos[i * 3] = a.x + (b.x - a.x) * t;
      pPos[i * 3 + 1] = a.y + (b.y - a.y) * t + Math.sin(f.j + f.u * 40) * 0.006;
      pPos[i * 3 + 2] = a.z + (b.z - a.z) * t;
      if (f.u < um) {
        tmpC.copy(hot).lerp(red, clamp(f.u / um, 0, 1));
        pSize[i] = 0.075; pAlpha[i] = 0.9 * flowLevel;
      } else {
        tmpC.copy(cool);
        pSize[i] = 0.05; pAlpha[i] = 0.28 * flowLevel;
      }
      pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
    });
    puffs.forEach((p, n) => {
      const i = FLOW * 2 + n;
      p.age += dt;
      if (p.age > p.life) {
        p.age = 0; p.life = 1.3 + Math.random() * 0.7;
        const s = sides[p.side];
        p.p.set(-2.4, 0.24 + (Math.random() - 0.5) * 0.02, 0.48 * s + (Math.random() - 0.5) * 0.02);
        p.v.set(-0.42 - Math.random() * 0.15, 0.06 + Math.random() * 0.08, (Math.random() - 0.5) * 0.12);
      }
      const q = p.age / p.life;
      pPos[i * 3] = p.p.x + p.v.x * p.age; pPos[i * 3 + 1] = p.p.y + p.v.y * p.age + 0.05 * p.age * p.age; pPos[i * 3 + 2] = p.p.z + p.v.z * p.age;
      pSize[i] = 0.08 + q * 0.5;
      pAlpha[i] = (1 - q) * (1 - q) * 0.16 * flowLevel;
      pCol[i * 3] = cool.r; pCol[i * 3 + 1] = cool.g; pCol[i * 3 + 2] = cool.b;
    });
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aColor.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ---------- camera rig ---------- */
  const cur = { theta: PRESETS.overview.theta + 0.5, phi: PRESETS.overview.phi, radius: 9, target: V(...PRESETS.overview.target) };
  const goal = { theta: cur.theta, phi: cur.phi, radius: 6.6, target: cur.target.clone() };
  let mode = 'overview';
  let userTheta = 0, userPhi = 0;
  let fitScale = 1;

  function applyCamera() {
    const sp = Math.sin(cur.phi);
    camera.position.set(
      cur.target.x + cur.radius * sp * Math.sin(cur.theta),
      cur.target.y + cur.radius * Math.cos(cur.phi),
      cur.target.z + cur.radius * sp * Math.cos(cur.theta)
    );
    camera.lookAt(cur.target);
  }

  function setGoal(id, time) {
    const p = PRESETS[id || 'overview'];
    const sway = (!id && !reducedMotion) ? Math.sin(time * 0.22) * 0.3 : 0;
    goal.theta = p.theta + userTheta + sway;
    goal.phi = clamp(p.phi + userPhi, 0.7, 1.45);
    goal.radius = id ? p.radius * clamp(fitScale * 0.7, 1, 2.2) : overviewRadius;
    goal.target.set(...p.target);
  }

  /* ---------- state: focus + highlight ---------- */
  let focused = null;
  function setRest() {
    PART_IDS.forEach(id => {
      parts[id].rest = focused ? (id === focused ? 1 : 0) : (id === 'muffler' ? 0.85 : 0);
    });
  }
  setRest();

  function focus(id) {
    focused = PART_IDS.includes(id) ? id : null;
    mode = focused ? 'focus' : 'overview';
    userTheta = 0; userPhi = 0;
    setRest();
    Object.entries(labels).forEach(([k, el]) => el && el.classList.toggle('is-active', k === focused));
  }

  /* ---------- sizing ---------- */
  let overviewRadius = 6.6;
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const f = frame(w, h);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, -(f.cx - 0.5) * w, -(f.cy - 0.5) * h, w, h);
    camera.updateProjectionMatrix();
    const t = Math.tan((camera.fov * Math.PI) / 360);
    overviewRadius = Math.max(4.6, 4.6 / (2 * t * camera.aspect * f.sx), 2.5 / (2 * t * f.sy));
    fitScale = overviewRadius / 6.6;
    const pr = renderer.getPixelRatio();
    bgMat.uniforms.uCenter.value.set(f.cx * w * pr, (1 - f.cy) * h * pr);
    bgMat.uniforms.uSize.value = Math.max(f.sx * w, f.sy * h * 1.2) * 0.62 * pr;
    pointsMat.uniforms.uScale.value = (h * pr) / (2 * t);
    floor.material.uniforms.uH.value = h * pr;
    floor.material.uniforms.uFade.value = 110 * pr;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  cur.radius = (reducedMotion || startAt > 2) ? overviewRadius : overviewRadius * 1.35;
  if (reducedMotion || startAt > 2) cur.theta = PRESETS.overview.theta;

  /* ---------- interaction ---------- */
  const ray = new Raycaster();
  const ndc = new Vector2();
  let drag = null;
  canvas.style.touchAction = 'pan-y';
  const pickable = () => PART_IDS.flatMap(id => [...parts[id].solids, ...parts[id].glows].map(o => ({ o, id })));
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const list = pickable();
    const hits = ray.intersectObjects(list.map(l => l.o), true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj) { const f = list.find(l => l.o === obj); if (f) return f.id; obj = obj.parent; }
    return null;
  }
  canvas.addEventListener('pointerdown', ev => {
    drag = { x: ev.clientX, y: ev.clientY, moved: 0, type: ev.pointerType, t0: userTheta, p0: userPhi };
  });
  window.addEventListener('pointermove', ev => {
    if (!drag) {
      if (ev.pointerType === 'mouse' && ev.target === canvas) canvas.style.cursor = pick(ev) ? 'pointer' : 'grab';
      return;
    }
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    userTheta = drag.t0 - dx * 0.008;
    if (drag.type === 'mouse') userPhi = clamp(drag.p0 - dy * 0.004, -0.4, 0.3);
  });
  const end = ev => {
    if (drag && drag.moved < 6 && ev.type === 'pointerup' && ev.target === canvas) {
      const id = pick(ev);
      if (id) { focus(id); onFocus(id); }
    }
    drag = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  /* ---------- intro timeline ---------- */
  let introT = reducedMotion ? 99 : startAt;
  let introDone = false;
  const tmp = V(0, 0, 0);

  function updateIntro(dt) {
    introT += dt;
    const t = introT;
    shared.uReveal.value = reducedMotion ? -3 : 2.75 - 5.6 * easeInOut(t / 1.5);
    drawables.forEach(d => {
      const p = reducedMotion ? 1 : clamp((t / 2.9 - d.start) / (d.end - d.start), 0, 1);
      const c = Math.floor((d.count * p) / 6) * 6;
      d.mesh.geometry.setDrawRange(0, c);
      d.mesh.visible = c > 0;
    });
    const mainProgress = reducedMotion ? 1 : clamp((t / 2.9 - 0.36) / (0.92 - 0.36), 0, 1);
    PART_IDS.forEach(id => {
      const P = parts[id];
      const reached = id === 'headers' ? t / 2.9 > 0.3 : mainProgress >= P.u;
      if (reached && !P.shown) { P.shown = true; P.flash = startAt > 2 ? 0 : 1.6; if (startAt > 2) P.appear = 1; }
      P.appear = P.shown ? damp(P.appear, 1, 10, dt) : 0;
      if (id === 'headers') P.solids.forEach(o => { if (!o.userData.draw) o.visible = P.appear > 0.4; });
      else P.solids.forEach(o => { const s = 0.001 + P.appear * 0.999; o.scale.setScalar(s); o.visible = P.appear > 0.01; });
    });
    xMerge.mesh.visible = mainProgress >= xMerge.u;
    // the intake + collector are tiny; let them pop with the headers
    if (!introDone && t > 3.0) {
      introDone = true;
      Object.values(labels).forEach(el => el && el.classList.add('is-visible'));
      onIntroDone();
    }
  }

  /* ---------- labels ---------- */
  const labelPos = PART_IDS.map(() => ({ x: 0, y: 0, ny: 0 }));
  function updateLabels() {
    const w = container.clientWidth, h = container.clientHeight;
    PART_IDS.forEach((id, i) => {
      tmp.copy(parts[id].anchor).project(camera);
      const p = labelPos[i];
      p.x = (tmp.x * 0.5 + 0.5) * w; p.y = (-tmp.y * 0.5 + 0.5) * h; p.ny = p.y; p.off = tmp.z > 1;
    });
    // keep name tags from stacking on each other: push the lower one down
    const order = labelPos.map((p, i) => i).sort((a, b) => labelPos[a].y - labelPos[b].y);
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const A = labelPos[order[a]], B = labelPos[order[b]];
      if (Math.abs(A.x - B.x) < 170 && B.ny - A.ny < 30) B.ny = A.ny + 30;
    }
    PART_IDS.forEach((id, i) => {
      const el = labels[id]; if (!el) return;
      const p = labelPos[i];
      const off = p.off || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40;
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      el.style.setProperty('--ny', `${(p.ny - p.y).toFixed(1)}px`);
      el.classList.toggle('is-off', off);
    });
  }

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now(), time = 0, running = false;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    // rAF timestamps can be slightly older than the moment the loop restarted: never step backwards
    const dt = clamp((now - last) / 1000, 0, 0.05); last = Math.max(last, now); time += dt;
    updateIntro(dt);
    setGoal(focused, time);
    const k = reducedMotion ? 20 : 3.2;
    cur.theta = damp(cur.theta, goal.theta, k, dt);
    cur.phi = damp(cur.phi, goal.phi, k, dt);
    cur.radius = damp(cur.radius, goal.radius, reducedMotion ? 20 : (introT < 2 ? 1.6 : 3.2), dt);
    cur.target.x = damp(cur.target.x, goal.target.x, k, dt);
    cur.target.y = damp(cur.target.y, goal.target.y, k, dt);
    cur.target.z = damp(cur.target.z, goal.target.z, k, dt);
    applyCamera();

    shared.uOpacity.value = damp(shared.uOpacity.value, focused ? 0.42 : 1, 4, dt);
    const pulse = reducedMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 2.6);
    PART_IDS.forEach(id => {
      const P = parts[id];
      P.current = damp(P.current, P.rest, 5, dt);
      P.flash = Math.max(0, P.flash - dt * 2.2);
      const g = (P.current * pulse + P.flash) * P.appear;
      P.glowMat.uniforms.uIntensity.value = g * (id === 'headers' ? 0.55 : 0.8);
      P.mat.emissiveIntensity = (id === 'muffler' ? 0.18 : 0) + g * (id === 'muffler' ? 0.35 : 0.22);
      if (P.extraMats) P.extraMats.forEach(m => { m.emissiveIntensity = g * 0.25; });
    });

    flowLevel = startAt > 2 ? 1 : damp(flowLevel, introT > 2.6 && !reducedMotion ? 1 : 0, 2, dt);
    if (particles.visible) updateParticles(dt);
    updateLabels();
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver(es => { es[0].isIntersecting && !document.hidden ? start() : stop(); }, { threshold: 0.01 });
  io.observe(container);
  const onVis = () => { if (document.hidden) stop(); else if (container.getBoundingClientRect().bottom > 0) start(); };
  document.addEventListener('visibilitychange', onVis);

  // first frame right away so the canvas is never blank
  updateIntro(0); setGoal(null, 0); applyCamera(); updateLabels(); renderer.render(scene, camera);

  return {
    focus,
    resize,
    renderOnce() { renderer.render(scene, camera); },
    dispose() {
      stop(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      renderer.dispose(); pmrem.dispose(); env.dispose();
      canvas.remove();
    }
  };
}
