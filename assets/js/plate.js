// Ember field — a contained plate.
//
// One bounded shader instance you can drop into a page section, no three.js, no
// dependencies. Same field as the hero backdrop (Marcus's OpenShaders module,
// retuned to brand orange), rendered by its own WebGL2 context.
//
//   <canvas id="plate"></canvas>
//   import { createPlate } from '/assets/js/plate.js';
//   const plate = createPlate(document.getElementById('plate'));
//
// Size it with CSS. It follows the element, caps its own pixel cost, pauses when
// scrolled out of view, and freezes under prefers-reduced-motion.
//
// Constants are load-bearing — see the note in three-scene.js. FALLOFF and
// GLOW_SIZE are the AREA knobs: at 1.10/0.0020 this reads as ember seams on char
// (~62% black); drop FALLOFF under ~0.8 and it becomes a molten flood.

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FIELD_SHADER = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uLightMode;
uniform vec3 uDarkBackground;
uniform vec3 uLightBackground;
out vec4 fragColor;

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
const float ECHO = 0.0;
const float ECHO_SHIFT = -0.135910705;
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
  vec2 R = iResolution.xy;
  vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float t = iTime * FLOW_SPEED * FLOW_DIRECTION + PHASE;
  float breath = (-sin(iTime * BREATH_RATE * 1.5) + sin(iTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;

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
#ifndef SKIP_ECHO
    vec2 e = vec2((q.x - ECHO_SHIFT) * ASPECT_X, s.y);
    glow += ECHO * GLOW_SIZE / (dot(e, e) + SOFTNESS);
#endif
    glow *= 0.25 + breath * 0.4;

    float r = length(u);
    float k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
    color += glow * tint * exp2(-r * FALLOFF);
  }

  vec3 x = max(color, 0.0);
  color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.85, 0.92, 0.98));

  float edge = smoothstep(0.5, 1.6, length(pos));
  color *= 1.0 - edge * VIGNETTE;

  vec3 dark = uDarkBackground + color * (1.0 - uDarkBackground);
  float strength = max(color.r, max(color.g, color.b));
  vec3 light = uLightBackground * (1.0 - strength) + color * 0.96;
  color = mix(dark, light, uLightMode);

  color += (blueNoise(gl_FragCoord.xy, floor(iTime * 24.0)) - 0.5) / 255.0;
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const MAX_PIXELS = 900000;   // a plate is a section, not a page background
const DPR_CAP = 1.5;

function attach(gl, program, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL could not create a shader object.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  gl.attachShader(program, shader);
  gl.deleteShader(shader);
}

function compile(gl, fragmentSource) {
  const program = gl.createProgram();
  attach(gl, program, gl.VERTEX_SHADER, VERTEX_SHADER);
  attach(gl, program, gl.FRAGMENT_SHADER, fragmentSource);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader failed to link: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export function createPlate(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const dark = options.background ?? [0.0392, 0.0392, 0.0392]; // #0a0a0a
  const program = compile(gl, FIELD_SHADER);
  const u = {
    iResolution: gl.getUniformLocation(program, 'iResolution'),
    iTime: gl.getUniformLocation(program, 'iTime'),
    uLightMode: gl.getUniformLocation(program, 'uLightMode'),
    uDarkBackground: gl.getUniformLocation(program, 'uDarkBackground'),
    uLightBackground: gl.getUniformLocation(program, 'uLightBackground'),
  };

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = canvas.clientWidth, height = canvas.clientHeight;
  let visible = true, disposed = false, frame = 0, started = 0;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
    const w = Math.max(1, Math.floor(width * scale));
    const h = Math.max(1, Math.floor(height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function draw(now) {
    if (!started) started = now;
    const t = still.matches ? 0 : (now - started) / 1000;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform2f(u.iResolution, canvas.width, canvas.height);
    gl.uniform1f(u.iTime, t);
    gl.uniform1f(u.uLightMode, 0);
    gl.uniform3fv(u.uDarkBackground, dark);
    gl.uniform3fv(u.uLightBackground, [1, 1, 1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now) {
    frame = 0;
    if (disposed || !visible) return;
    draw(now);
    if (!still.matches) frame = requestAnimationFrame(tick);
  }

  function refresh() {
    if (disposed) return;
    fit();
    if (!frame) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    }
  }

  const resize = new ResizeObserver(([entry]) => {
    if (disposed || !entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    if (width && height) refresh();
  });
  const io = new IntersectionObserver(([entry]) => {
    if (disposed || !entry) return;
    visible = entry.isIntersecting;
    if (visible) refresh(); else { cancelAnimationFrame(frame); frame = 0; }
  });
  const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : refresh());
  const onMotion = () => refresh();

  resize.observe(canvas);
  io.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  still.addEventListener('change', onMotion);
  refresh();

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      still.removeEventListener('change', onMotion);
      gl.deleteProgram(program);
    },
  };
}
