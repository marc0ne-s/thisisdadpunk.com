// DADPUNK — Three.js hero. Shader only.
//
// The ember field is the whole picture: one full-screen fragment shader, plus a
// VHS post pass (scanlines, chromatic aberration, vignette, grain). No debris,
// no particle field, no glitch bursts — the plate carries the motion.
//
// The field is Marcus's own OpenShaders module (openshaders.com/@dadpunk),
// retuned to the brand palette. The constants are load-bearing:
//   HUE 0.120969  = #e85d04 in OKLCH (43.5°)
//   FALLOFF / GLOW_SIZE are the AREA knobs. At 1.10 / 0.0020 the field reads as
//   ember seams on char (~62% black). Drop FALLOFF under ~0.8 and it becomes a
//   molten flood at ~3% black, whatever the hue is set to.
// Measured 1440×900: 62.3% black, 22.3% orange, 0% green-dominant.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FIELD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FIELD_FRAGMENT = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;

  // ── Ember field ──
  // Ported from the @dadpunk OpenShaders "Liquid" module, retuned to the
  // brand palette. Same 77-layer fold-warp, but with the 1/r² tail cut
  // (FALLOFF 1.10, GLOW 0.0020) so it reads as ember seams on char instead
  // of a molten field: measured 62.3% black / 22.3% orange at 1440×900,
  // against 49.8%/50% green as published. The hue/chroma/lightness values
  // are load-bearing — #e85d04 is OKLCH 43.5° = HUE 0.120969.
  const float HUE = 0.120969;
  const float HUE_SPREAD = 0.045;
  const float HUE_TRAVEL = 1.9133693;
  const float CHROMA = 0.135;
  const float LIGHTNESS = 0.46;
  const float COLOUR_CYCLE = 0.206462756;
  const float THETA = 2.10856009;
  const float SHEAR = 0.967408597;
  const float SHRINK = 0.956948638;
  const float LAYERS = 77.0;
  const float WARP_FREQ_X = 0.569496334;
  const float WARP_FREQ_Y = 2.61956787;
  const float WARP_AMP_X = 0.132899508;
  const float WARP_AMP_Y = 0.0215559471;
  const float ASPECT_X = 2.39489675;
  const float ASPECT_Y = 0.131931365;
  const float OFFSET_X = 0.415838659;
  const float OFFSET_Y = -0.0487511642;
  const float TILT = 1.20207369;
  const float ZOOM = 0.909897387;
  const float CENTRE_X = 0.149415508;
  const float CENTRE_Y = 0.599949718;
  const float GLOW_SIZE = 0.0020;
  const float FALLOFF = 1.10;
  const float VIGNETTE = 0.22;
  const float FLOW_SPEED = 0.522351265;
  const float FLOW_DIRECTION = -1.0;
  const float BREATH_RATE = 0.556988955;
  const float BREATH_AMOUNT = 0.0746767893;
  const float PHASE = 6.18943644;
  const float SOFTNESS = 0.00274089701;
  const float LIGHT_SWING = 0.12;

  const float TAU = 6.28318530718;

  vec3 oklchToLinear(float L, float C, float h) {
    float a = C * cos(h), b = C * sin(h);
    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    vec3 lms = vec3(l_, m_, s_);
    lms = lms * lms * lms;
    return mat3(4.0767416621, -1.2684380046, -0.0041960863,
                -3.3077115913, 2.6097574011, -0.7034186147,
                0.2309699292, -0.3413193965, 1.7076147010) * lms;
  }

  float blueNoise(vec2 p, float frame) {
    p += 5.588238 * mod(frame, 64.0);
    return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
  }

  void main() {
    vec2 R = uResolution.xy;
    vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;
    float t = uTime * FLOW_SPEED * FLOW_DIRECTION + PHASE;
    float breath = (-sin(uTime * BREATH_RATE * 1.5) + sin(uTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;

    vec2 u = (pos - vec2(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
    float ct = cos(TILT), st = sin(TILT);
    u = mat2(ct, st, -st, ct) * u;

    mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

    float hue0 = HUE * TAU;
    float hue1 = hue0 + HUE_SPREAD * TAU;
    vec3 color = vec3(0.0);

    for (float i = 1.0; i <= 96.0; i += 1.0) {
      if (i > LAYERS) break;
      u.x += -sin(u.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
      u.y += -sin(u.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
      u = fold * u * SHRINK;

      vec2 q = u - vec2(OFFSET_X + breath * 0.1, OFFSET_Y);
      vec2 s = vec2(q.x * ASPECT_X, q.y * ASPECT_Y);
      float glow = GLOW_SIZE / (dot(s, s) + SOFTNESS);
      glow *= 0.25 + breath * 0.4;

      float r = length(u);
      float k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
      vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
      color += glow * tint * exp2(-r * FALLOFF);
    }

    // Fit to display range: same curve the module ships with.
    vec3 x = max(color, 0.0);
    color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    color = pow(clamp(color, 0.0, 1.0), vec3(0.85, 0.92, 0.98));

    float edge = smoothstep(0.5, 1.6, length(pos));
    color *= 1.0 - edge * VIGNETTE;

    color += (blueNoise(gl_FragCoord.xy, floor(uTime * 24.0)) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

const VHS_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VHS_FRAGMENT = `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uScanlineIntensity;
  uniform float uVignetteStrength;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;

    // ── Chromatic aberration ──
    float aberration = 0.0015;
    float r = texture2D(tDiffuse, uv + vec2(aberration, 0.0)).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - vec2(aberration, 0.0)).b;
    vec3 color = vec3(r, g, b);

    // ── Scanlines (VHS) ──
    float scanline = sin(vUv.y * uResolution.y * 1.6 + uTime * 1.2) * 0.5 + 0.5;
    color -= scanline * uScanlineIntensity;

    // ── Vignette ──
    float dist = distance(vUv, vec2(0.5));
    color *= 1.0 - dist * uVignetteStrength;

    // ── Subtle noise dither ──
    float noise = (random(vUv + fract(uTime * 3.0)) - 0.5) * 0.025;
    color += noise;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function initHeroScene() {
  const container = document.getElementById('hero-3d');
  if (!container) return;

  // The hero is now nothing but motion, so honour the OS setting: freeze time
  // rather than ship a still frame of a different look.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  // ═══════════════════════════════════════════════
  //  EMBER FIELD — the entire backdrop
  // ═══════════════════════════════════════════════
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: FIELD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });

  // 60×60 at z=-15 covers the frustum at every aspect we care about; the shader
  // works in gl_FragCoord space, so the plane only has to be big enough.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), fieldMat);
  backdrop.position.z = -15;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  // ═══════════════════════════════════════════════
  //  RENDERER
  // ═══════════════════════════════════════════════
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  // The hero is a soft field with no fine geometry in the canvas — the type is
  // DOM. Capping the canvas at 1.5× halves the fragment cost of every full-screen
  // pass at 2× displays and is not visible on a blurred field.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0); // transparent — body bg shows through
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // The field shader works in gl_FragCoord space, so its resolution uniform has
  // to be the drawing-buffer size (CSS px × pixel ratio), not the CSS size.
  // Mixing them made the field zoom with device pixel ratio.
  const syncFieldResolution = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    fieldMat.uniforms.uResolution.value.copy(size);
  };
  syncFieldResolution();

  // ═══════════════════════════════════════════════
  //  POST — bloom, VHS, optional liquid warp
  // ═══════════════════════════════════════════════
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.25,  // strength
    0.3,   // radius
    0.87   // threshold — only the hottest cores glow
  );
  composer.addPass(bloomPass);

  const vhsPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0.0 },
      uScanlineIntensity: { value: 0.05 },
      uVignetteStrength: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    },
    vertexShader: VHS_VERTEX,
    fragmentShader: VHS_FRAGMENT,
  });
  composer.addPass(vhsPass);

  // Liquid ink warp — off unless asked for. With the field as the backdrop the
  // warp smears the hot vein and turns the embers into smudges, so it is opt-in
  // (?ink=0.35) rather than default.
  const inkParam = new URLSearchParams(location.search).get('ink');
  const inkStrength = still.matches ? 0
    : inkParam === null ? 0
    : Math.max(0, Math.min(1, parseFloat(inkParam) || 0));
  const inkPass = inkStrength > 0 ? new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0.0 },
      uStrength: { value: inkStrength },
      uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    },
    vertexShader: FIELD_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uStrength;
      uniform vec2 uResolution;
      varying vec2 vUv;

      vec2 liquidFlow(vec2 p, float t) {
        vec2 drift = vec2(p.y * 3.1 + t * 0.21, p.x * 2.7 - t * 0.17);
        vec2 q = p + 0.22 * sin(drift);
        vec2 bend = 0.22 * vec2(3.1, 2.7) * cos(drift);
        vec2 d0 = vec2(0.94, 0.342);
        vec2 d1 = vec2(-0.6, 0.8);
        vec2 d2 = vec2(0.28, 0.96);
        vec2 g = 0.38 * cos(dot(q, d0) * 10.0 - t * 0.65) * d0;
        g += 0.24 * cos(dot(q, d1) * 16.0 - t * 0.83 + 2.1) * d1;
        g += 0.12 * cos(dot(q, d2) * 23.0 - t * 1.1 + 4.3) * d2;
        return vec2(g.x + g.y * bend.y, g.y + g.x * bend.x);
      }

      void main() {
        float aspect = uResolution.x / uResolution.y;
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        vec2 shift = liquidFlow(p, uTime) * 0.22 * uStrength * vec2(1.0 / aspect, 1.0);
        gl_FragColor = texture2D(tDiffuse, clamp(vUv + shift, 0.0, 1.0));
      }
    `,
  }) : null;
  if (inkPass) composer.insertPass(inkPass, 1); // after RenderPass, before bloom
  // State marker so a probe (or future me) can tell whether the pass is live.
  container.dataset.ink = String(inkStrength);

  // ═══════════════════════════════════════════════
  //  LOOP
  // ═══════════════════════════════════════════════
  const clock = new THREE.Clock();
  let visible = true;
  const visObserver = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  }, { threshold: 0 });
  visObserver.observe(container);

  function animate() {
    requestAnimationFrame(animate);
    if (!visible) return;

    const t = still.matches ? 0 : clock.getElapsedTime();
    fieldMat.uniforms.uTime.value = t;
    vhsPass.uniforms.uTime.value = t;
    if (inkPass) inkPass.uniforms.uTime.value = t;

    composer.render();
  }
  animate();

  // ═══════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    vhsPass.uniforms.uResolution.value.set(w, h);
    if (inkPass) inkPass.uniforms.uResolution.value.set(w, h);
    syncFieldResolution();
  });

  // ═══════════════════════════════════════════════
  //  MOBILE
  // ═══════════════════════════════════════════════
  if (window.innerWidth < 768) {
    bloomPass.strength = 0.3;
    bloomPass.radius = 0.4;
  }
}
