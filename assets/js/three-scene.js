// DADPUNK v6 — Three.js Hero Scene
// WebGL 3D: 11 orbital debris + dense constellation + 1200 ember particles + post-processing
// Post: bloom → scanlines → chromatic aberration glitch + flash → vignette

console.log('three-scene.js LOADED version 6.0');

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function initHeroScene() {
  const container = document.getElementById('hero-3d');
  if (!container) return;

  // ═══════════════════════════════════════════════
  //  SCENE
  // ═══════════════════════════════════════════════
  const scene = new THREE.Scene();

  // ═══════════════════════════════════════════════
  //  CAMERA
  // ═══════════════════════════════════════════════
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  // ═══════════════════════════════════════════════
  //  ORGANIC FLOW BACKDROP — domain-warped shader
  //  Subtle dark flowing forms behind all debris
  // ═══════════════════════════════════════════════
  const backdropGeo = new THREE.PlaneGeometry(40, 40);
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;

      // ── Domain warping — the organic flow engine ──
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 4; i++) {
          v += a * (sin(p.x * 3.0 + uTime * 0.2) * cos(p.y * 3.0 - uTime * 0.15));
          p = rot * p * 1.8 + shift;
          a *= 0.5;
        }
        return v * 0.5 + 0.5;
      }

      float domainWarp(vec2 p) {
        vec2 q = vec2(
          fbm(p + vec2(0.0, 0.0)),
          fbm(p + vec2(5.2, 1.3))
        );
        vec2 r = vec2(
          fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * uTime),
          fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.12 * uTime)
        );
        return fbm(p + 3.5 * r);
      }

      void main() {
        vec2 uv = vUv;
        uv = (uv - 0.5) * 2.2;

        float n = domainWarp(uv * 1.6);
        float ridges = abs(sin(n * 6.0 + uTime * 0.08)) * abs(cos(n * 4.0 - uTime * 0.06));
        ridges = pow(ridges, 1.0);

        float n2 = domainWarp(uv * 1.6 + vec2(3.3, 7.1));
        float mist = smoothstep(0.2, 0.8, n2);

        // Ground: near-black with a faint olive cast, matching the page's
        // #0a0a0a. The old base was rust at 0.25 red and never reached black,
        // so the hero read as a lit orange field rather than a dark one.
        vec3 col = vec3(0.045, 0.044, 0.030);

        // Only the ridgeline crests carry orange. This is the accent, not the field.
        float crest = smoothstep(0.45, 0.92, ridges);

        // Olive does the midtone work — it is the material, orange is the light.
        // Gated to the valleys so crests read orange, valleys read olive, and
        // everything between falls back toward black instead of going muddy.
        vec3 olive = vec3(0.55, 0.53, 0.21);
        col += olive * pow(1.0 - ridges, 1.25) * (0.35 + 0.65 * mist);

        // Orange, rationed to the crests.
        vec3 amber = vec3(1.0, 0.42, 0.07);
        col += amber * crest * (0.35 + 0.55 * mist);

        // Tight hot core, only on the very strongest crests.
        col += vec3(1.0, 0.58, 0.20) * pow(crest, 4.0) * 0.25;

        // Vignette now pulls the edges to true black so type has ground to sit on.
        float vignette = 1.0 - length(vUv - 0.5) * 1.15;
        col *= clamp(vignette, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // transparent — body bg shows through
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // ═══════════════════════════════════════════════
  //  COLORS
  // ═══════════════════════════════════════════════
  const ORANGE = 0xe85d04;
  const OLIVE = 0x5c5b3a;
  const OLIVE_DARK = 0x3a3925;
  const OFF_WHITE = 0xe8e4de;

  // ═══════════════════════════════════════════════
  //  LIGHTING
  // ═══════════════════════════════════════════════
  const ambientLight = new THREE.AmbientLight(OLIVE_DARK, 0.08);
  scene.add(ambientLight);

  const mainLight = new THREE.PointLight(ORANGE, 2.5, 30);
  mainLight.position.set(2, 3, 5);
  scene.add(mainLight);

  const fillLight = new THREE.PointLight(0x2a1a0a, 0.6, 22);
  fillLight.position.set(-4, -2, 3);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(ORANGE, 1.2, 25);
  rimLight.position.set(0, 5, -3);
  scene.add(rimLight);

  // ═══════════════════════════════════════════════
  //  DEBRIS OBJECTS — orbital, spiralling, alive
  // ═══════════════════════════════════════════════
  const debris = [];

  const wireOrange = new THREE.MeshBasicMaterial({
    color: ORANGE, wireframe: true, transparent: true, opacity: 0.55,
  });
  const wireOlive = new THREE.MeshBasicMaterial({
    color: OLIVE, wireframe: true, transparent: true, opacity: 0.3,
  });
  const solidOrange = new THREE.MeshStandardMaterial({
    color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.8,
    metalness: 0.9, roughness: 0.3,
  });
  const ghostOlive = new THREE.MeshStandardMaterial({
    color: OLIVE_DARK, emissive: OLIVE_DARK, emissiveIntensity: 0.3,
    metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.65,
  });

  // Helper to give debris orbital / spiral life
  function spawnDebris(mesh, opts) {
    mesh.userData = {
      basePos: mesh.position.clone(),
      rot: { x: opts.rx || 0, y: opts.ry || 0, z: opts.rz || 0 },
      float: { amp: opts.amp || 0.4, speed: opts.speed || 1.0, phase: opts.phase || 0 },
      orbit: {
        radius: opts.orbitR || 0,
        speed: opts.orbitS || 0,
        axis: opts.orbitA || new THREE.Vector3(0, 1, 0),
      },
      spiral: {
        radius: opts.spiralR || 0,
        speed: opts.spiralS || 0,
        yDrift: opts.spiralY || 0,
      },
      acc: {
        timer: 0,
        interval: 3 + Math.random() * 7,
        boost: 0,
      },
      depth: opts.depth || 0.6,
    };
    scene.add(mesh);
    debris.push(mesh);
  }

  // 1. Wireframe cube — fast tumble, small orbit
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), wireOlive);
  cube.position.set(4, 1.8, -2.5);
  spawnDebris(cube, {
    rx: 0.022, ry: 0.032, rz: 0.018,
    amp: 1.25, speed: 1.8, phase: 0,
    orbitR: 1.1, orbitS: 0.5,
    depth: 0.9,
  });

  // 2. Orange rod — slow spin, spirals upward
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.5, 8), solidOrange.clone());
  rod.material.transparent = true; rod.material.opacity = 0.8;
  rod.position.set(-3.5, -0.5, -1.5); rod.rotation.z = Math.PI / 5;
  spawnDebris(rod, {
    rx: 0.007, ry: 0.015, rz: 0.028,
    amp: 1.4, speed: 2.3, phase: 1.3,
    spiralR: 1.6, spiralS: 0.65, spiralY: 0.22,
    depth: 0.65,
  });

  // 3. Torus — wide orbit, dramatic tilt
  const torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 16, 48), wireOlive.clone());
  torus.material.opacity = 0.25;
  torus.position.set(-2.5, 2.5, -4);
  spawnDebris(torus, {
    rx: 0.025, ry: 0.013, rz: 0.020,
    amp: 1.65, speed: 1.2, phase: 2.1,
    orbitR: 2.0, orbitS: 0.38,
    depth: 1.1,
  });

  // 4. Tetrahedron — tight spiral, erratic
  const tetra = new THREE.Mesh(new THREE.TetrahedronGeometry(0.9), ghostOlive.clone());
  tetra.material.transparent = true; tetra.material.opacity = 0.35;
  tetra.position.set(3, -2, -2);
  spawnDebris(tetra, {
    rx: 0.018, ry: 0.030, rz: 0.011,
    amp: 1.15, speed: 2.1, phase: 0.7,
    spiralR: 1.3, spiralS: 1.0, spiralY: -0.16,
    depth: 0.75,
  });

  // 5. Ghost plane — slow drift, big arc
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3),
    new THREE.MeshBasicMaterial({ color: OFF_WHITE, transparent: true, opacity: 0.035, side: THREE.DoubleSide }),
  );
  plane.position.set(-5, -1.5, -6); plane.rotation.set(0.1, 0.3, -0.05);
  spawnDebris(plane, {
    rx: 0.003, ry: 0.005, rz: 0.001,
    amp: 2.35, speed: 0.7, phase: 3.0,
    orbitR: 2.6, orbitS: 0.18,
    depth: 1.5,
  });

  // 6. Octahedron — jittery, fast
  const octa = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), solidOrange.clone());
  octa.material.transparent = true; octa.material.opacity = 0.45;
  octa.position.set(-1, 3.5, -3);
  spawnDebris(octa, {
    rx: 0.040, ry: 0.020, rz: 0.029,
    amp: 1.0, speed: 2.9, phase: 4.5,
    spiralR: 0.7, spiralS: 1.5, spiralY: 0.12,
    depth: 0.85,
  });

  // 7. Wireframe icosahedron — wide lazy orbit
  const icosa = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), wireOrange.clone());
  icosa.material.opacity = 0.22;
  icosa.position.set(5.5, -1, -4);
  spawnDebris(icosa, {
    rx: 0.012, ry: 0.042, rz: 0.008,
    amp: 1.4, speed: 0.95, phase: 1.0,
    orbitR: 1.6, orbitS: 0.3,
    depth: 1.0,
  });

  // v6: 4 new debris — more background activity
  // 8. Dodecahedron — mid-orbit, olive wireframe
  const dodec = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), wireOrange.clone());
  dodec.material.opacity = 0.35;
  dodec.position.set(-4, -2.8, -5);
  spawnDebris(dodec, {
    rx: 0.015, ry: 0.028, rz: 0.022,
    amp: 1.5, speed: 1.4, phase: 5.2,
    orbitR: 2.2, orbitS: 0.42,
    depth: 1.2,
  });

  // 9. Small orange cube — fast, erratic, close
  const smallCube = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), solidOrange.clone());
  smallCube.material.transparent = true; smallCube.material.opacity = 0.7;
  smallCube.position.set(2, -3, -1.5);
  spawnDebris(smallCube, {
    rx: 0.055, ry: 0.045, rz: 0.035,
    amp: 0.8, speed: 3.2, phase: 3.8,
    spiralR: 1.0, spiralS: 1.8, spiralY: -0.25,
    depth: 0.55,
  });

  // 10. Thin ring — slow drift, fills background
  const ringTorus = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.03, 8, 64), wireOlive.clone());
  ringTorus.material.opacity = 0.2;
  ringTorus.position.set(6, 2, -6);
  spawnDebris(ringTorus, {
    rx: 0.004, ry: 0.002, rz: 0.006,
    amp: 2.0, speed: 0.5, phase: 1.8,
    orbitR: 1.0, orbitS: 0.15,
    depth: 1.4,
  });

  // 11. Second torus — vertical, dramatic angle
  const torus2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 12, 36), wireOrange.clone());
  torus2.material.opacity = 0.3;
  torus2.position.set(-5.5, 3.5, -5.5); torus2.rotation.z = Math.PI / 2.5;
  spawnDebris(torus2, {
    rx: 0.008, ry: 0.018, rz: 0.025,
    amp: 1.8, speed: 1.0, phase: 6.1,
    orbitR: 2.8, orbitS: 0.22,
    depth: 1.35,
  });

  // ═══════════════════════════════════════════════
  //  CONSTELLATION LINES — connect nearby debris
  // ═══════════════════════════════════════════════
  const CONNECTION_MAX_DIST = 6.0;
  const linePositions = [];
  const lineColors = [];
  let linePulse = 0; // spikes on glitch

  function buildConnectionLines() {
    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    const oliveColor = new THREE.Color(OLIVE);
    const orangeColor = new THREE.Color(ORANGE);

    linePositions.length = 0;
    lineColors.length = 0;

    for (let i = 0; i < debris.length; i++) {
      posA.copy(debris[i].position);
      for (let j = i + 1; j < debris.length; j++) {
        posB.copy(debris[j].position);
        const dist = posA.distanceTo(posB);
        if (dist < CONNECTION_MAX_DIST) {
          const alpha = 1 - dist / CONNECTION_MAX_DIST;
          linePositions.push(posA.x, posA.y, posA.z, posB.x, posB.y, posB.z);
          const pulseBoost = linePulse * alpha;
          const c = oliveColor.clone().lerp(orangeColor, Math.min(1, alpha * 0.5 + pulseBoost));
          lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
  }

  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
  });
  const connectionLines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(connectionLines);

  function updateConnectionLines() {
    buildConnectionLines();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
  }

  // ═══════════════════════════════════════════════
  //  CUSTOM PARTICLE SHADER — turbulent, ember sparks
  // ═══════════════════════════════════════════════
  const PARTICLE_COUNT = 1200;
  const pPositions = new Float32Array(PARTICLE_COUNT * 3);
  const pSizes = new Float32Array(PARTICLE_COUNT);
  const pColorMix = new Float32Array(PARTICLE_COUNT);
  const pVelocities = [];
  const pLife = new Float32Array(PARTICLE_COUNT); // 0..1 life cycle
  const pMaxLife = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Wide spread across full viewport depth
    pPositions[i * 3] = -14 + Math.random() * 28;
    pPositions[i * 3 + 1] = -6 + Math.random() * 12;
    pPositions[i * 3 + 2] = -8 + Math.random() * 12;
    // Larger visible sizes
    pSizes[i] = 1.0 + Math.random() * 2.0;
    // More orange embers (25%) and brighter olive dust
    pColorMix[i] = Math.random() < 0.25 ? 0.55 + Math.random() * 0.35 : 0.15 + Math.random() * 0.2;
    pVelocities.push({
      x: (Math.random() - 0.5) * 0.01,
      y: (Math.random() - 0.5) * 0.008,
      z: (Math.random() - 0.5) * 0.006,
      turbX: Math.random() * 2.0,
      turbY: Math.random() * 2.0,
      turbSpeed: 0.5 + Math.random() * 1.5,
    });
    pLife[i] = Math.random();
    pMaxLife[i] = 2 + Math.random() * 3;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  particleGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
  particleGeo.setAttribute('aColorMix', new THREE.BufferAttribute(pColorMix, 1));

  const particleVertShader = `
    attribute float aSize;
    attribute float aColorMix;
    varying float vColorMix;
    uniform float uPixelRatio;

    void main() {
      vColorMix = aColorMix;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (90.0 / -mvPosition.z);
      gl_PointSize = max(gl_PointSize, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const particleFragShader = `
    varying float vColorMix;
    uniform vec3 uColorOlive;
    uniform vec3 uColorOrange;

    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;

      float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
      alpha *= 0.95;

      // Ember field: subtle specks visible across the scene depth
      vec3 col = mix(vec3(0.06, 0.04, 0.02), vec3(0.5, 0.2, 0.04), vColorMix);

      // Soft center glow for embers only
      float core = 1.0 - smoothstep(0.0, 0.2, dist);
      col += vec3(0.2, 0.06, 0.0) * core * vColorMix * 0.4;

      gl_FragColor = vec4(col, alpha * 0.45);
    }
  `;

  const particleMat = new THREE.ShaderMaterial({
    vertexShader: particleVertShader,
    fragmentShader: particleFragShader,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColorOlive: { value: new THREE.Color(OLIVE) },
      uColorOrange: { value: new THREE.Color(ORANGE) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ═══════════════════════════════════════════════
  //  POST-PROCESSING
  // ═══════════════════════════════════════════════
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom — gentle, never blows out
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.12,  // strength — very subtle
    0.3,   // radius
    0.87   // threshold — high, only very bright things glow
  );
  composer.addPass(bloomPass);

  // Custom VHS / DadPunk post shader: scanlines + chromatic aberration + flash + vignette
  const dadpunkPostShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0.0 },
      uGlitchStrength: { value: 0.0 },
      uFlash: { value: 0.0 },
      uScanlineIntensity: { value: 0.05 },
      uVignetteStrength: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGlitchStrength;
      uniform float uFlash;
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
        float aberration = 0.0015 + uGlitchStrength * 0.065;
        float r = texture2D(tDiffuse, uv + vec2(aberration, 0.0)).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - vec2(aberration, 0.0)).b;
        vec3 color = vec3(r, g, b);

        // ── Glitch: horizontal shift bursts ──
        if (uGlitchStrength > 0.01) {
          float glitchLine = step(0.96 - uGlitchStrength * 0.35, random(vec2(floor(uv.y * 90.0), floor(uTime * 14.0))));
          if (glitchLine > 0.5) {
            float shift = (random(vec2(floor(uTime * 140.0), floor(uv.y * 60.0))) - 0.5) * uGlitchStrength * 0.08;
            color = texture2D(tDiffuse, uv + vec2(shift, 0.0)).rgb;
          }
        }

        // ── Scanlines (VHS) ──
        float scanline = sin(vUv.y * uResolution.y * 1.6 + uTime * 1.2) * 0.5 + 0.5;
        color -= scanline * uScanlineIntensity;

        // ── Vignette ──
        float dist = distance(vUv, vec2(0.5));
        color *= 1.0 - dist * uVignetteStrength;

        // ── Subtle noise dither ──
        float noise = (random(vUv + fract(uTime * 3.0)) - 0.5) * 0.025;
        color += noise;

        // Flash / strobe from glitch — stronger now
        color += vec3(1.0, 0.92, 0.85) * uFlash * 0.55;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  };

  const dadpunkPass = new ShaderPass(dadpunkPostShader);
  composer.addPass(dadpunkPass);

  // ═══════════════════════════════════════════════
  //  GLITCH SYSTEM — periodic bursts with flash
  // ═══════════════════════════════════════════════
  let glitchStrength = 0;
  let glitchTarget = 0;
  let nextGlitchTime = 4 + Math.random() * 6;
  let glitchDuration = 0;
  let flashStrength = 0;

  function triggerGlitch() {
    glitchTarget = 0.7 + Math.random() * 0.5;
    glitchDuration = 0.15 + Math.random() * 0.3;
    flashStrength = 0.6 + Math.random() * 0.4;
  }

  // ═══════════════════════════════════════════════
  //  INPUT TRACKING
  // ═══════════════════════════════════════════════
  let mouseX = 0, mouseY = 0;
  let targetMouseX = 0, targetMouseY = 0;

  document.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      targetMouseX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
    }
  }, { passive: true });

  // ═══════════════════════════════════════════════
  //  SCROLL TRACKING — full page, with velocity
  // ═══════════════════════════════════════════════
  let scrollProgress = 0;
  let pageScroll = 0;
  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;

  window.addEventListener('scroll', () => {
    const heroHeight = container.parentElement.offsetHeight || window.innerHeight;
    scrollProgress = Math.min(1, window.scrollY / heroHeight);
    // Canvas stays fully visible — sections handle their own opacity
    container.style.opacity = '1';
    pageScroll = window.scrollY;
  }, { passive: true });
  pageScroll = window.scrollY;
  lastScrollY = window.scrollY;

  // ═══════════════════════════════════════════════
  //  ANIMATION LOOP
  // ═══════════════════════════════════════════════
  const clock = new THREE.Clock();
  let isVisible = true;
  let connectionUpdateTimer = 0;

  const visObserver = new IntersectionObserver((entries) => {
    isVisible = entries[0].isIntersecting;
  }, { threshold: 0 });
  visObserver.observe(container);

  // camera shake accumulator
  let shakeX = 0, shakeY = 0;

  function animate() {
    requestAnimationFrame(animate);
    // Always run — fixed canvas is always visible
    // if (!isVisible) return;

    const t = clock.getElapsedTime();

    // ── Mouse interpolation (snappier) ──
    mouseX += (targetMouseX - mouseX) * 0.07;
    mouseY += (targetMouseY - mouseY) * 0.07;

    // ── Page scroll velocity & depth ──
    const scrollDelta = pageScroll - lastScrollY;
    lastScrollY = pageScroll;
    const scrollSpeed = Math.abs(scrollDelta);
    const pageDepth = Math.min(1, pageScroll / Math.max(1, document.body.scrollHeight - window.innerHeight));

    // ── Camera: dramatic orbit + mouse + breathing + scroll + shake ──
    const breathe = Math.sin(t * 1.1) * 0.34;
    const driftX = Math.sin(t * 0.22) * 0.35;
    const driftY = Math.cos(t * 0.18) * 0.2;

    // Glitch shake
    if (glitchStrength > 0.3) {
      shakeX = (Math.random() - 0.5) * glitchStrength * 0.35;
      shakeY = (Math.random() - 0.5) * glitchStrength * 0.35;
    } else {
      shakeX *= 0.7;
      shakeY *= 0.7;
    }

    camera.position.x = mouseX * 5.2 + driftX + shakeX;
    camera.position.y = -mouseY * 2.6 + breathe + driftY + shakeY;
    camera.position.z = 8 + Math.sin(t * 0.4) * 0.25;
    camera.lookAt(0, 0, -2);

    // ── Lights follow mouse + pulse ──
    mainLight.position.x = 2 + mouseX * 3 + Math.sin(t * 0.8) * 0.5;
    mainLight.position.y = 3 - mouseY * 2 + Math.sin(t * 0.6) * 0.5;
    mainLight.intensity = 4 + Math.sin(t * 0.9) * 0.8;
    rimLight.intensity = 1.2 + Math.sin(t * 1.1) * 0.4;

    // ── Animate debris — orbital, spiral, accelerate ──
    for (const obj of debris) {
      const ud = obj.userData;

      // Fast rotation
      obj.rotation.x += ud.rot.x;
      obj.rotation.y += ud.rot.y;
      obj.rotation.z += ud.rot.z;

      // Acceleration burst
      ud.acc.timer += 0.016;
      if (ud.acc.timer > ud.acc.interval) {
        ud.acc.timer = 0;
        ud.acc.interval = 2 + Math.random() * 6;
        ud.acc.boost = 1.0;
      }
      ud.acc.boost *= 0.96; // decay
      const accMul = 1 + ud.acc.boost * 2.5;

      // Float + orbital + spiral
      const floatY = Math.sin(t * ud.float.speed * accMul + ud.float.phase) * ud.float.amp;
      const floatX = Math.sin(t * ud.float.speed * 0.7 * accMul + ud.float.phase + 1.3) * ud.float.amp * 0.5;

      let ox = 0, oz = 0;
      if (ud.orbit.radius > 0) {
        const oAngle = t * ud.orbit.speed * accMul + ud.float.phase;
        ox = Math.cos(oAngle) * ud.orbit.radius;
        oz = Math.sin(oAngle) * ud.orbit.radius;
      }

      let sx = 0, sz = 0, sy = 0;
      if (ud.spiral.radius > 0) {
        const sAngle = t * ud.spiral.speed * accMul;
        sx = Math.cos(sAngle) * ud.spiral.radius;
        sz = Math.sin(sAngle) * ud.spiral.radius;
        sy = t * ud.spiral.yDrift;
      }

      obj.position.x = ud.basePos.x + floatX + ox + sx;
      obj.position.y = ud.basePos.y + floatY + sy;
      obj.position.z = ud.basePos.z + oz + sz;

      // Mouse parallax (strong)
      obj.position.x += mouseX * ud.depth * 1.8;
      obj.position.y -= mouseY * ud.depth * 0.9;
    }

    // ── Update constellation lines (throttled) ──
    connectionUpdateTimer++;
    if (connectionUpdateTimer % 2 === 0) {
      updateConnectionLines();
    }

    // Line opacity: visible baseline, pulse brighter during glitch
    lineMat.opacity = 0.04 + Math.sin(t * 1.2) * 0.015 + linePulse * 0.55;
    linePulse *= 0.85; // slower decay

    // ── Animate particles — turbulent, dying, reborn ──
    const posArr = particleGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const vel = pVelocities[i];

      // Turbulence
      const turb = Math.sin(t * vel.turbSpeed + vel.turbX) * 0.004;
      const turb2 = Math.cos(t * vel.turbSpeed * 0.7 + vel.turbY) * 0.003;

      posArr[i * 3] += vel.x + turb;
      posArr[i * 3 + 1] += vel.y;
      posArr[i * 3 + 2] += vel.z + turb2;

      // Life cycle
      pLife[i] += 0.016;
      if (pLife[i] > pMaxLife[i]) {
        // Reborn: full depth coverage
        pLife[i] = 0;
        posArr[i * 3] = -14 + Math.random() * 28;
        posArr[i * 3 + 1] = -6 + Math.random() * 12;
        posArr[i * 3 + 2] = -8 + Math.random() * 12;

        const vel = pVelocities[i];
        vel.x = (Math.random() - 0.5) * 0.008;
        vel.y = (Math.random() - 0.5) * 0.006;
        vel.z = (Math.random() - 0.5) * 0.005;
      }

      // Wrap fallback
      if (posArr[i * 3 + 1] < -12) posArr[i * 3 + 1] = 12;
      if (posArr[i * 3] > 14) posArr[i * 3] = -14;
      if (posArr[i * 3] < -14) posArr[i * 3] = 14;
    }
    particleGeo.attributes.position.needsUpdate = true;

    // Particle parallax
    particles.position.x = mouseX * 0.7;
    particles.position.y = -mouseY * 0.45;

    // ── Glitch timing ──
    if (t > nextGlitchTime) {
      triggerGlitch();
      nextGlitchTime = t + 3 + Math.random() * 7; // 3-10s — more active
    }

    // Glitch decay
    if (glitchTarget > 0) {
      glitchDuration -= 0.016;
      if (glitchDuration <= 0) {
        glitchTarget = 0;
      }
    }
    glitchStrength += (glitchTarget - glitchStrength) * 0.18;
    if (glitchStrength < 0.001) glitchStrength = 0;

    // Flash decay
    flashStrength *= 0.88;
    if (flashStrength < 0.001) flashStrength = 0;

    // Bloom reacts to glitch
    const targetBloom = 0.25 + glitchStrength * 0.35 + flashStrength * 0.15;
    bloomPass.strength += (targetBloom - bloomPass.strength) * 0.1;

    // Line pulse from glitch
    if (glitchStrength > 0.4) linePulse = 1.0;

    // ── Update post-processing uniforms ──
    dadpunkPass.uniforms.uTime.value = t;
    dadpunkPass.uniforms.uGlitchStrength.value = glitchStrength;
    dadpunkPass.uniforms.uFlash.value = flashStrength;
    // ── Backdrop shader time ──
    backdropMat.uniforms.uTime.value = t;

    // ── Render via composer ──
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
    dadpunkPass.uniforms.uResolution.value.set(w, h);
    particleMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  });

  // ═══════════════════════════════════════════════
  //  MOBILE PERFORMANCE — reduce but keep everything
  // ═══════════════════════════════════════════════
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    bloomPass.strength = 0.3;
    bloomPass.radius = 0.4;
    // Simplify heavy materials instead of removing objects
    plane.material.opacity = 0.015;
    icosa.material.opacity = 0.08;
    particleMat.uniforms.uPixelRatio.value = 1;
    // Slower focal
    // (no focalGroup in this version, keeping mobile simple)
  }
}
