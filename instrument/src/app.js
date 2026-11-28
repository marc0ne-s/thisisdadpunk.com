import { BowedVoice, buildMaster } from './engine.js';
import { HandTracker, LANDMARK } from './hands.js';
import { PoseTracker } from './pose.js';
import { CameraSource } from './camera.js';
import { Smoother } from './smoothing.js';
import { MPEOut, panic } from './midi.js';
import {
  ROOT_HZ, ROOT_NOTE, SPAN_SEMIS, PINCH_ON, PINCH_OFF, SPEED_FULL,
  noteName, xToSemis, semisToHz, yToPressure, distanceToSpace, PinchGate, LevelGate, clamp,
} from './mapping.js';
import {
  bodyGesture, mirrorLandmarks, POSE_EDGES, POSE, SUBJECT_RIGHT, SUBJECT_LEFT,
} from './bodymap.js';
import { runBodyTests } from './bodytest.js';
import { DrumMachine, TRACKS, STEPS, PRESETS, presetPattern, drumVoiceSelfTest } from './drums.js';
import { DrumVoice, PADS, drumPadSelfTest } from './drumvoice.js';

const $ = (id) => document.getElementById(id);

// ── state ────────────────────────────────────────────────────────────────
const state = {
  ctx: null,
  master: null,
  voices: [],
  tracker: new HandTracker(),
  poseTracker: new PoseTracker(),
  camera: new CameraSource(null),      // filled in enableCamera()
  smoother: new Smoother(0.35),
  speedSmoother: new Smoother(0.30),
  bodySmoother: new Smoother(0.25),    // body params move slower than hands
  prevPos: {},
  mpe: new MPEOut(),
  audioReady: false,
  cameraReady: false,
  contact: [false, false],
  note: [ROOT_NOTE, ROOT_NOTE],        // float: continuous pitch position for UI
  midiNote: [null, null],             // int: last note sent to the synth
  gate: [new PinchGate(PINCH_ON, PINCH_OFF), new PinchGate(PINCH_ON, PINCH_OFF)],
  bodyGate: new LevelGate(0.62, 0.40), // bow arm at string height -> contact
  glide: 0.65,
  brightness: 0.5,
  volume: 0.7,
  mouse: { x: 0.5, y: 0.5, down: false, active: false },
  mousePrev: null,
  inferences: 0,
  frames: 0,
  hands: [],
  body: null,                         // latest body gesture (see bodymap.js)
  bodyRaw: null,                      // latest raw pose landmarks, for the overlay
  bodyWorld: null,                    // latest world landmarks (metric), for torso twist
  bodyPrevWrist: null,                // for bow-velocity from wrist travel
  driver: 'hands',                    // 'hands' | 'body' — which source drives the voice
  drum: null,                         // DrumMachine, created with the AudioContext
  // The grid is visible and clickable before audio exists, so the pattern has
  // to live outside the machine until there is an AudioContext to hand it to.
  drumPending: presetPattern('boom bap'),
  drumTempo: 92,
  drumSwing: 0,
  stringBus: null,
  voiceMode: 'string',                // 'string' | 'drums' — what the gestures drive
  drumVoice: null,                    // DrumVoice, the sample kit
  drumVoices: [],                     // every voice that can be driven, for panics
  lastError: null,
};

// noteName() comes from mapping.js — one source of truth.

// ── audio ────────────────────────────────────────────────────────────────
function startAudio() {
  if (state.audioReady) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: 'interactive',
  });
  state.ctx = ctx;
  state.master = buildMaster(ctx);
  state.master.out.gain.value = state.volume;
  // A bowed voice connects itself to master.dry, so to mute the string without
  // muting the drums it needs its own bus in front of the master. BowedVoice only
  // ever touches .dry and .reverb, so handing it a proxy master is enough — the
  // reverb send still goes to the real convolver.
  const stringBus = ctx.createGain();
  stringBus.gain.value = 1;
  stringBus.connect(state.master.dry);
  state.stringBus = stringBus;
  const voiceMaster = Object.assign({}, state.master, { dry: stringBus });

  state.voices = [new BowedVoice(ctx, voiceMaster), new BowedVoice(ctx, voiceMaster)];
  // The kit hangs off the same string bus, so "what you hear" mutes it too: it is
  // an alternative voice, not a second instrument.
  state.drumVoice = new DrumVoice(ctx, { dry: stringBus }, '');
  state.drumVoice.load();
  state.drum = new DrumMachine(ctx, state.master);
  state.drum.setTempo(state.drumTempo);
  state.drum.setSwing(state.drumSwing);
  state.drum.setPattern(state.drumPending);
  state.drum.onStep = (step) => highlightStep(step);
  setVoiceMode(state.voiceMode);
  syncDrumGrid();
  state.audioReady = true;
  if (ctx.state === 'suspended') ctx.resume();
  $('start').textContent = 'Audio running';
  $('start').disabled = true;
  setStatus(`audio ${ctx.sampleRate}Hz · base latency ${(ctx.baseLatency * 1000).toFixed(1)}ms`);
}

// Which voice the gestures are driving right now. Everything downstream calls
// this instead of state.voices[0], so swapping the voice is a one-line change
// rather than a branch in every gesture handler.
function activeVoice() {
  if (state.voiceMode === 'drums' && state.drumVoice) return state.drumVoice;
  return state.voices[0];
}

function setVoiceMode(mode) {
  state.voiceMode = mode === 'drums' ? 'drums' : 'string';
  // Release whatever was sounding before switching, or a bowed note hangs.
  try { state.voices[0] && state.voices[0].bowOff(); } catch (_) {}
  try { state.drumVoice && state.drumVoice.bowOff(); } catch (_) {}
  state.contact[0] = false;
  for (const b of document.querySelectorAll('#outMode button')) {
    b.classList.toggle('on', b.dataset.mode === state.voiceMode);
  }
}

function setStatus(msg) { $('status').textContent = msg; }

// ── drum machine UI ───────────────────────────────────────────────────────
// The grid is built once and reads whichever pattern exists: the pending one
// before audio starts, the machine's own after. One source of truth at a time,
// never two copies drifting apart.

function buildDrumGrid() {
  const grid = $('drumGrid');
  if (!grid || grid.childElementCount) return;
  for (const tr of TRACKS) {
    const lab = document.createElement('div');
    lab.className = 'lab';
    lab.textContent = tr;
    grid.appendChild(lab);
    for (let i = 0; i < STEPS; i++) {
      const b = document.createElement('button');
      b.className = 'step' + (i % 4 === 0 ? ' beat' : '');
      b.dataset.track = tr;
      b.dataset.step = String(i);
      b.title = tr + ' · step ' + (i + 1);
      b.addEventListener('click', () => toggleStep(tr, i));
      grid.appendChild(b);
    }
  }
  const sel = $('drumPreset');
  if (sel) {
    sel.innerHTML = '';
    for (const name of Object.keys(PRESETS)) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    }
    sel.value = 'boom bap';
  }
}

function currentPattern() {
  return state.drum ? state.drum.getPattern() : state.drumPending;
}

function syncDrumGrid() {
  const pat = currentPattern();
  for (const b of $('drumGrid').querySelectorAll('.step')) {
    const on = pat[b.dataset.track] && pat[b.dataset.track][+b.dataset.step];
    b.classList.toggle('on', !!on);
  }
}

function toggleStep(track, step) {
  let on;
  if (state.drum) {
    on = state.drum.toggle(track, step);
  } else {
    state.drumPending[track][step] = !state.drumPending[track][step];
    on = state.drumPending[track][step];
  }
  const btn = $('drumGrid').querySelector(
    '.step[data-track="' + track + '"][data-step="' + step + '"]'
  );
  if (btn) btn.classList.toggle('on', !!on);
}

function highlightStep(step) {
  const grid = $('drumGrid');
  if (!grid) return;
  for (const el of grid.querySelectorAll('.step.now')) el.classList.remove('now');
  if (step < 0) return;
  for (const tr of TRACKS) {
    const el = grid.querySelector('.step[data-track="' + tr + '"][data-step="' + step + '"]');
    if (el) el.classList.add('now');
  }
}

function toggleDrumTransport() {
  if (!state.audioReady) startAudio();
  if (!state.drum) return;
  const btn = $('drumPlay');
  if (state.drum.playing) {
    state.drum.stop();
    btn.textContent = '\u25b6 Play';
    btn.classList.add('primary');
  } else {
    state.drum.start();
    btn.textContent = '\u25a0 Stop';
    btn.classList.remove('primary');
  }
}


// ── camera ───────────────────────────────────────────────────────────────
// One camera, one stream, two models. The hand tracker and the pose tracker
// both read the SAME <video> element: opening the same UVC device twice
// halves the frame rate for both.
async function enableCamera() {
  setStatus('loading models…');
  try {
    state.camera = new CameraSource($('cam'));

    const handDelegate = await state.tracker.init($('cam'));
    state.trackerDelegate = handDelegate;
    setStatus(`hand model ok (${handDelegate}) · loading pose model…`);

    // The pose model is the primary driver now. If it fails to load we
    // still have hands, so a pose failure degrades to hand tracking rather
    // than killing the camera.
    try {
      const poseDelegate = await state.poseTracker.init($('cam'));
      state.poseDelegate = poseDelegate;
      state.tracker.running = true;
      state.poseTracker.running = true;
      setStatus(`pose model ok (${poseDelegate}) · requesting camera…`);
    } catch (poseErr) {
      console.error('[pose]', poseErr);
      state.poseError = poseErr;
      state.tracker.running = true;
      setStatus('pose model failed — hand tracking only · requesting camera…');
    }

    await state.camera.start();
    state.cameraReady = true;
    $('camoff').style.display = 'none';
    $('camBtn').textContent = 'Camera on';
    $('camBtn').disabled = true;
    await populateCameras();

    // Auto-select the best camera. This runs AFTER the first stream opened,
    // because device labels are only exposed once permission has been
    // granted — ranking is impossible before that.
    const picked = await state.camera.autoSelect();
    if (picked) {
      resetTrackingClock();
      await populateCameras();
      setStatus(`camera live · hand ${handDelegate} · pose ${state.poseDelegate || 'none'} · auto-selected`);
    } else {
      setStatus(`camera live · hand ${handDelegate} · pose ${state.poseDelegate || 'none'}`);
    }
  } catch (err) {
    state.lastError = err;
    $('camoff').textContent = 'NO CAMERA';
    setStatus('camera failed — mouse fallback active');
    console.error('[camera]', err);
  }
}

// OBS Virtual Camera and iPhone Desk View both show up as video inputs, so the
// default pick is frequently wrong. Always let the operator choose.
async function populateCameras() {
  const sel = $('camSel');
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    sel.innerHTML = '';
    for (const d of cams) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `camera ${sel.length + 1}`;
      sel.appendChild(opt);
    }
    if (state.camera.activeDeviceId) sel.value = state.camera.activeDeviceId;
    sel.disabled = cams.length < 2;
  } catch (_) { /* enumeration needs permission; harmless */ }
}

// ── midi ─────────────────────────────────────────────────────────────────
async function enableMidi() {
  try {
    const outs = await state.mpe.enable();
    const sel = $('midiSel');
    sel.innerHTML = '<option value="">— none —</option>';
    outs.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name}${o.manufacturer ? ' · ' + o.manufacturer : ''}`;
      sel.appendChild(opt);
    });
    const preferred = outs.find((o) => /IAC|SP-404|Roland/i.test(o.name));
    if (preferred) sel.value = preferred.id;
    if (preferred || outs.length === 1) {
      state.mpe.selectOutput(sel.value);
    }
    $('midiBtn').textContent = 'MIDI ready';
    $('midiBtn').disabled = true;
    $('midistate').textContent = outs.length
      ? `${outs.length} output${outs.length > 1 ? 's' : ''} found`
      : 'no MIDI outputs — enable IAC Driver in Audio MIDI Setup';
  } catch (err) {
    $('midistate').textContent = `MIDI unavailable: ${err.message}`;
  }
}

// ── body pose ────────────────────────────────────────────────────────────
// Read the pose and turn it into a body gesture.
//
// The body map lives in bodymap.js; this function's job is to run it on a
// fresh frame and smooth the result. Smoothing matters more here than for
// hands: a whole body is a much larger object in frame, so the same
// centimetre of landmark jitter is a much smaller fraction of the measured
// quantity — but the TORSO parameters (twist, lean) are the ones that must
// not twitch, because they drive the phrase swell and the global level.
function readBody() {
  if (!state.cameraReady || !state.poseTracker) return null;

  const detected = state.poseTracker.detect(performance.now());
  if (!detected) {
    state.bodyRaw = null;
    return null;
  }
  state.bodyRaw = detected.landmarks;
  // World landmarks (metric, hip-centred) are kept separately: the torso
  // twist is measured in 3D, because in image space a twist and a side
  // lean move the shoulders the same way and cannot be told apart.
  state.bodyWorld = detected.worldLandmarks;

  const raw = bodyGesture(detected.landmarks, detected.worldLandmarks);
  if (!raw) return null;

  const sm = state.bodySmoother;
  const now = performance.now();

  // Bow velocity from how far the bow wrist actually travelled. Same idea
  // as the hand path: measure on the smoothed position so landmark jitter
  // does not read as a fast bow.
  let speed = 0;
  const prev = state.bodyPrevWrist;
  if (prev) {
    const dt = Math.max(0.008, (now - prev.t) / 1000);
    const dx = raw.wrist.x - prev.x;
    const dy = raw.wrist.y - prev.y;
    speed = state.speedSmoother.push('bodyS', Math.hypot(dx, dy) / dt);
  }
  state.bodyPrevWrist = { x: raw.wrist.x, y: raw.wrist.y, t: now };

  return {
    pitchNorm: sm.push('pitch', raw.pitchNorm),
    pressureNorm: sm.push('press', raw.pressureNorm),
    weight: sm.push('weight', raw.weight),
    twist: sm.push('twist', raw.twist),
    lean: sm.push('lean', raw.lean),
    space: sm.push('space', raw.space),
    contact: sm.push('contact', raw.contact),
    vibrato: sm.push('vib', raw.vibrato),
    speed: clamp(speed / SPEED_FULL, 0, 1),
    wrist: raw.wrist,
    elbow: raw.elbow,
    scale: raw.scale,
  };
}

// ── mapping ──────────────────────────────────────────────────────────────
// Mirrored so the instrument agrees with what you see in the selfie preview.
//
// Role assignment is by PHYSICAL HAND, not by screen position. MediaPipe's
// handedness assumes a mirrored input image; getUserMedia hands us an
// UN-mirrored frame, so the label is inverted (see mapping.js). Sorting by x
// instead would let the two hands trade roles whenever they crossed, which
// would swap pitch and vibrato mid-phrase.
function readHands() {
  if (!state.cameraReady) return [];
  const raw = state.tracker.detect(performance.now());
  const smooth = state.smoother;
  const now = performance.now();
  const out = [];

  raw.forEach((h, i) => {
    const tip = h.landmarks[LANDMARK.INDEX_TIP];
    const x = smooth.push(`x${i}`, 1 - tip.x);   // mirrored
    const y = smooth.push(`y${i}`, tip.y);

    // Bow velocity from how far the hand actually travelled. Measured on the
    // smoothed position so landmark jitter does not read as a fast bow.
    const prev = state.prevPos[i];
    let speed = 0;
    if (prev) {
      const dt = Math.max(0.008, (now - prev.t) / 1000);
      speed = state.speedSmoother.push(`s${i}`, Math.hypot(x - prev.x, y - prev.y) / dt);
    }
    state.prevPos[i] = { x, y, t: now };

    // MediaPipe labels the UN-mirrored frame → invert to get the real hand.
    out.push({
      x,
      y,
      pinch: smooth.push(`p${i}`, h.pinchRaw),
      speed: clamp(speed / SPEED_FULL, 0, 1),
      physical: h.handedness === 'Right' ? 'Left' : 'Right',
      raw: h,
    });
  });

  if (out.length === 2) {
    // Bow hand = the player's right hand (bow arm). Expression hand = left.
    // Ties broken by x so roles stay stable frame to frame.
    out.sort((a, b) => (a.physical === b.physical ? a.x - b.x : a.physical === 'Right' ? -1 : 1));
  } else if (out.length === 1) {
    // One hand only: treat it as the bow hand regardless of label.
    out[0].physical = 'Right';
  }
  return out;
}

function applyHands(hands) {
  const bow = hands[0];
  const expr = hands[1];

  // voice 0 — bow hand
  if (bow) {
    const blended = xToSemis(bow.x, state.glide);
    const hz = semisToHz(blended);
    const pressure = yToPressure(bow.y);

    activeVoice().setPitch(hz);
    activeVoice().setPressure(pressure);
    activeVoice().setBowSpeed(bow.speed);
    activeVoice().setBrightness(clamp(state.brightness + (expr ? (expr.x - 0.5) * 1.2 : 0), 0, 1));

    // Pinch hysteresis — MediaPipe pinch is noisy right at a single threshold.
    const pinching = state.gate[0].update(bow.pinch);
    setContact(0, pinching, pressure, blended);
    state.note[0] = ROOT_NOTE + blended;

    if (expr) {
      activeVoice().setVibrato(clamp(1 - expr.y, 0, 1) * 0.8);
      activeVoice().setSpace(distanceToSpace(bow.x, bow.y, expr.x, expr.y));
    } else {
      activeVoice().setVibrato(0.12);
      activeVoice().setSpace(0.15);
    }
  } else {
    setContact(0, false, 0, state.note[0] - ROOT_NOTE);
  }

  // voice 1 — expression hand doubles as a second string if held alone
  if (expr && !bow) {
    const blended = xToSemis(expr.x, state.glide);
    state.voices[1].setPitch(semisToHz(blended));
    state.voices[1].setPressure(clamp(1 - expr.y, 0, 1));
    setContact(1, false, 0, 0);
  }
}

// state.note holds a FLOAT (continuous pitch position) for the UI.
// state.midiNote holds the INTEGER note last sent to the synth. These must be
// separate: comparing a float against an int made the legato check fire on
// every frame, spamming note-off/note-on pairs at 60Hz.
function setContact(voiceIdx, on, pressure, semis) {
  const v = voiceIdx === 0 ? activeVoice() : state.voices[voiceIdx];
  if (!v) return;
  const midiNote = ROOT_NOTE + Math.round(semis);
  const offset = semis - Math.round(semis);   // fractional semitones

  if (on && !state.contact[voiceIdx]) {
    state.contact[voiceIdx] = true;
    v.bowOn();
    state.midiNote[voiceIdx] = midiNote;
    if (state.mpe.output) state.mpe.noteOn(voiceIdx, midiNote, clamp(pressure, 0.15, 1));
  } else if (!on && state.contact[voiceIdx]) {
    state.contact[voiceIdx] = false;
    v.bowOff();
    if (state.mpe.output && state.midiNote[voiceIdx] != null) {
      state.mpe.noteOff(voiceIdx, state.midiNote[voiceIdx]);
    }
    state.midiNote[voiceIdx] = null;
  } else if (on && state.mpe.output) {
    // Legato across notes: retrigger only when the quantised note actually moves.
    if (midiNote !== state.midiNote[voiceIdx]) {
      state.mpe.noteOff(voiceIdx, state.midiNote[voiceIdx]);
      state.mpe.noteOn(voiceIdx, midiNote, clamp(pressure, 0.15, 1));
      state.midiNote[voiceIdx] = midiNote;
    }
    // offset is already in semitones; midi.js divides by the MPE range.
    state.mpe.pitchBend(voiceIdx, offset, 48);
    state.mpe.pressure(voiceIdx, pressure);
    state.mpe.timbre(voiceIdx, state.brightness);
  }
}

// ── mouse fallback ───────────────────────────────────────────────────────
// The mouse is the regression harness and the fallback when the camera is
// TCC-blocked. It is the ONLY driver when the camera is off (see frame()).
function applyMouse() {
  if (!state.audioReady) return;
  const m = state.mouse;
  if (!m.active) {
    // Never leave a note stuck if the pointer leaves the canvas.
    setContact(0, false, 0, state.note[0] - ROOT_NOTE);
    return;
  }
  const blended = xToSemis(m.x, state.glide);
  const pressure = yToPressure(m.y);

  // Mouse gets the same bow-velocity path as a hand, so the fallback exercises
  // the real mapping instead of a degraded copy of it.
  const now = performance.now();
  const prev = state.mousePrev;
  let speed = 0;
  if (prev) {
    const dt = Math.max(0.008, (now - prev.t) / 1000);
    speed = Math.hypot(m.x - prev.x, m.y - prev.y) / dt;
  }
  state.mousePrev = { x: m.x, y: m.y, t: now };

  activeVoice().setPitch(semisToHz(blended));
  activeVoice().setPressure(pressure);
  activeVoice().setBowSpeed(clamp(speed / SPEED_FULL, 0, 1));
  activeVoice().setBrightness(state.brightness);
  activeVoice().setVibrato(0.1);
  setContact(0, m.down, pressure, blended);
  state.note[0] = ROOT_NOTE + blended;
}

// ── render ───────────────────────────────────────────────────────────────
const canvas = $('view');
const g = canvas.getContext('2d');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

function draw() {
  const r = canvas.getBoundingClientRect();
  const w = r.width, h = r.height;

  g.fillStyle = '#0a0a0a';
  g.fillRect(0, 0, w, h);

  // pitch ladder
  const padL = 56, padR = 32;
  const laneW = w - padL - padR;
  const laneY0 = h * 0.14, laneY1 = h * 0.86;

  g.font = '10px ui-monospace, Menlo, monospace';
  g.textBaseline = 'middle';
  for (let i = 0; i <= SPAN_SEMIS; i++) {
    const x = padL + (i / SPAN_SEMIS) * laneW;
    const isC = i % 12 === 0;
    g.strokeStyle = isC ? '#3a392c' : '#1b1b17';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, laneY0);
    g.lineTo(x, laneY1);
    g.stroke();
    // In drums mode the lane is a rack, so it is labelled with pad names at pad
    // boundaries instead of note names. Same lane, different instrument.
    let label = null;
    if (state.voiceMode === 'drums') {
      if (i % (24 / PADS.length) === 0) {
        const pad = PADS[Math.floor(i / (24 / PADS.length))];
        if (pad) label = pad.label;
      }
    } else if (isC || i % 12 === 7) {
      label = noteName(ROOT_NOTE + i);
    }
    if (label) {
      g.fillStyle = isC ? '#5c5b3a' : '#2f2e26';
      g.textAlign = 'center';
      g.fillText(label, x, laneY1 + 16);
    }
  }

  // the string
  const bowVoice = activeVoice();
  const pressed = state.contact[0];
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(92,91,58,0.18)');
  grad.addColorStop(0.5, pressed ? 'rgba(232,93,4,0.85)' : 'rgba(92,91,58,0.45)');
  grad.addColorStop(1, 'rgba(92,91,58,0.18)');
  g.strokeStyle = grad;
  g.lineWidth = pressed ? 2.5 : 1.2;
  g.beginPath();
  g.moveTo(padL, h * 0.5);
  g.lineTo(padL + laneW, h * 0.5);
  g.stroke();

  // hand markers
  const hands = state.hands;
  const markers = [];
  const yFor = (yn) => laneY1 - (1 - clamp(yn, 0, 1)) * (laneY1 - laneY0);
  if (hands[0]) {
    markers.push({
      x: padL + hands[0].x * laneW,
      y: yFor(hands[0].y),
      kind: 'bow',
      p: clamp(1 - hands[0].y, 0, 1),
    });
  }
  if (hands[1]) {
    markers.push({
      x: padL + hands[1].x * laneW,
      y: yFor(hands[1].y),
      kind: 'expr',
      p: clamp(1 - hands[1].y, 0, 1),
    });
  }
  if (!hands.length && state.mouse.active) {
    markers.push({
      x: padL + clamp(state.mouse.x, 0, 1) * laneW,
      y: yFor(state.mouse.y),
      kind: 'mouse',
      p: 1 - state.mouse.y,
    });
  }

  for (const m of markers) {
    const y = clamp(m.y, laneY0, laneY1);
    const rad = 8 + m.p * 26;
    const col = m.kind === 'bow'
      ? (state.contact[0] ? '232,93,4' : '92,91,58')
      : '113,216,241';
    g.beginPath();
    g.arc(m.x, y, rad, 0, Math.PI * 2);
    g.strokeStyle = `rgba(${col},${m.kind === 'bow' && state.contact[0] ? 0.95 : 0.5})`;
    g.lineWidth = 1.5;
    g.stroke();
    g.beginPath();
    g.arc(m.x, y, 2.5, 0, Math.PI * 2);
    g.fillStyle = `rgba(${col},0.95)`;
    g.fill();
  }

  // ── body overlay ──────────────────────────────────────────────────────
  // The per-landmark skeleton, drawn in MIRRORED space so it lines up with
  // the selfie preview (which is also mirrored). Acceptance criterion 1:
  // the body must be visible, not just felt.
  if (state.bodyRaw) {
    const lm = mirrorLandmarks(state.bodyRaw);
    const bx = (i) => lm[i].x * laneW;
    const by = (i) => lm[i].y * h;

    // Skeleton first, so the joints sit on top of the lines.
    g.lineWidth = 1.5;
    for (const [a, b] of POSE_EDGES) {
      const pa = lm[a], pb = lm[b];
      if (!pa || !pb) continue;
      const dim = (pa.visibility != null && pa.visibility < 0.5)
        || (pb.visibility != null && pb.visibility < 0.5);
      g.strokeStyle = dim ? 'rgba(92,91,58,0.25)' : 'rgba(92,91,58,0.75)';
      g.beginPath();
      g.moveTo(padL + bx(a), by(a));
      g.lineTo(padL + bx(b), by(b));
      g.stroke();
    }

    // Joints. The bow arm is highlighted in orange because it is the arm
    // that carries pitch and pressure — the eye needs to know which one.
    for (let i = 0; i < lm.length; i++) {
      const pt = lm[i];
      if (!pt) continue;
      const vis = pt.visibility == null ? 1 : pt.visibility;
      if (vis < 0.5) continue;
      const isBowArm = i === SUBJECT_RIGHT.SHOULDER || i === SUBJECT_RIGHT.ELBOW
        || i === SUBJECT_RIGHT.WRIST;
      const isFingerArm = i === SUBJECT_LEFT.SHOULDER || i === SUBJECT_LEFT.ELBOW
        || i === SUBJECT_LEFT.WRIST;
      const col = isBowArm ? '232,93,4' : isFingerArm ? '113,216,241' : '92,91,58';
      g.beginPath();
      g.arc(padL + bx(i), by(i), isBowArm || isFingerArm ? 4 : 2.5, 0, Math.PI * 2);
      g.fillStyle = `rgba(${col},${isBowArm || isFingerArm ? 0.95 : 0.55})`;
      g.fill();
    }
  }

  // pressure envelope along the string
  if (bowVoice && pressed) {
    const cx = padL + (state.note[0] - ROOT_NOTE) / SPAN_SEMIS * laneW;
    const pw = 26 + bowVoice.pressure * 90;
    const pg = g.createRadialGradient(cx, h * 0.5, 0, cx, h * 0.5, pw);
    pg.addColorStop(0, 'rgba(232,93,4,0.30)');
    pg.addColorStop(1, 'rgba(232,93,4,0)');
    g.fillStyle = pg;
    g.fillRect(cx - pw, h * 0.5 - pw, pw * 2, pw * 2);
  }

  // readouts
  $('handcount').textContent = hands.length;
  $('noteout').textContent = state.audioReady ? noteName(state.note[0]) : '—';
  const bowEl = $('bowout');
  bowEl.textContent = state.contact[0] ? 'on' : 'off';
  bowEl.className = state.contact[0] ? 'on' : '';

  // Which source is actually driving. This is worth showing: it is the
  // difference between "the instrument is broken" and "the body map lost
  // the player", and those look identical from the outside.
  const drv = $('driverout');
  if (drv) {
    drv.textContent = state.driver;
    drv.className = state.driver === 'body' ? 'on' : '';
  }

  // Torso readouts, so the body map is legible rather than mysterious.
  const b = state.body;
  const tw = $('twistout'), ln = $('leanout');
  if (tw && ln) {
    if (b) {
      tw.textContent = b.twist.toFixed(2);
      ln.textContent = b.lean.toFixed(2);
    } else {
      tw.textContent = '—';
      ln.textContent = '—';
    }
  }
}

// ── body → voice ─────────────────────────────────────────────────────────
//
// When no hand is detected, the BODY drives the instrument. This is the
// whole point of increment 1: a bowed string is played with the arm and
// torso, so the body map is a first-class driver, not a fallback.
//
// When a hand IS detected, the hand takes priority (acceptance criterion 1)
// because the fingers are finer and faster than the body for pitch and
// contact — but the body's torso parameters still ride on top, because a
// hand cannot express a phrase swell.
//
// Which driver is in charge is reported in state.driver so the UI and the
// verification harness can both see it.
function applyBody(body, hands) {
  const voice = activeVoice();
  if (!voice) return;

  // The hand map already ran and owns pitch/pressure/contact. The body adds
  // the torso dimensions on top, which is the whole point of the body map:
  // dynamics, phrase swell, global intensity.
  //
  // Each parameter gets exactly one owner. The body never overwrites pitch
  // or pressure when a hand is driving them — that would make the two
  // sources fight, which is the class of bug that produced the original
  // double-driver MIDI spam.
  const torsoTwist = body.twist;                 // signed: -1..1
  const torsoLean = body.lean;                   // signed: -1..1

  // DYNAMICS / PHRASE SWELL: the torso twist swells the voice. Signed, so
  // twisting one way swells and the other way subsides — that asymmetry is
  // what makes it read as phrasing rather than as a fader.
  const swell = 0.5 + torsoTwist * 0.5;           // 0..1
  voice.setSwell(clamp(swell * 1.25, 0, 1));

  // GLOBAL INTENSITY: the weight shift sets the overall level.
  voice.setIntensity(clamp(0.55 + torsoLean * 0.45, 0.1, 1));

  // Space send also follows the body reach, but only when the hands are not
  // providing their own distance reading (see applyHands).
  if (!hands.length) {
    voice.setSpace(body.space);
    voice.setVibrato(clamp(body.vibrato, 0, 1) * 0.8);
    voice.setBrightness(clamp(state.brightness + body.weight * 0.35 - 0.15, 0, 1));
  }
}

// When the body is driving (no hands), the body must also own pitch,
// pressure and contact — otherwise there is no note at all.
function applyBodyAlone(body) {
  const voice = activeVoice();
  if (!voice) return;

  const blended = xToSemis(body.pitchNorm, state.glide);
  const hz = semisToHz(blended);
  const pressure = body.pressureNorm;

  voice.setPitch(hz);
  voice.setPressure(pressure);
  voice.setBowSpeed(clamp(body.weight * 0.5 + body.speed * 0.7, 0, 1));
  voice.setBrightness(clamp(state.brightness + body.weight * 0.35 - 0.15, 0, 1));

  // Contact: the bow arm at string height. LevelGate gives it hysteresis so
  // the note does not chatter on a noisy arm-height signal.
  const contacting = state.bodyGate.update(body.contact);
  setContact(0, contacting, pressure, blended);
  state.note[0] = ROOT_NOTE + blended;
}

// ── loop ─────────────────────────────────────────────────────────────────
function frame() {
  state.frames++;

  // ONE frame gate for both models. rAF runs at 60Hz while the camera
  // delivers ~30, so inferring on every rAF tick would run both models
  // twice on identical pixels. The gate lives here — not inside each
  // tracker — because the two models must see the SAME frame, and a gate
  // inside each tracker would let whichever ran first consume the frame and
  // starve the other.
  const fresh = state.cameraReady && state.camera.hasNewFrame();
  if (fresh) {
    state.camera.consumeFrame();
    state.inferences++;
    state.hands = readHands();
    state.body = readBody();
  } else if (!state.cameraReady) {
    state.hands = [];
    state.body = null;
  }

  if (state.audioReady) {
    // Exactly one source drives the voice. With a camera, hands drive it and
    // a lost hand releases the note. Without a camera, the mouse drives it.
    // Running both at once made setContact release and re-engage every frame,
    // which fired a note-off/note-on pair at 60Hz on the MIDI output.
    if (state.cameraReady) {
      const hands = state.hands;
      const body = state.body;

      if (hands.length) {
        // Hands win pitch/pressure/contact; the body still contributes the
        // torso dimensions it alone can express.
        state.driver = 'hands';
        applyHands(hands);
        if (body) applyBody(body, hands);
      } else if (body) {
        // Body-only: the torso drives everything.
        state.driver = 'body';
        applyBodyAlone(body);
        applyBody(body, []);
      } else {
        // Camera up but nobody detected — release, do not drone.
        state.driver = 'none';
        setContact(0, false, 0, state.note[0] - ROOT_NOTE);
      }
    } else {
      state.driver = 'mouse';
      applyMouse();
    }
    if (state.master) state.master.out.gain.value = state.volume;
  }
  draw();
  requestAnimationFrame(frame);
}

// ── self-test ────────────────────────────────────────────────────────────
// Renders the real voice graph offline and reports RMS/peak. This is how we
// prove the audio engine works without a human in the loop.
async function selfTest() {
  const box = $('selftest');
  box.style.display = 'block';
  box.className = '';
  box.textContent = 'rendering…';

  const SR = 48000;
  const DUR = 2.5;
  const off = new OfflineAudioContext(2, Math.floor(SR * DUR), SR);
  const master = buildMaster(off);
  const v = new BowedVoice(off, master);

  v.contact = true;
  // Envelope
  v.amp.gain.setValueAtTime(0, 0);
  v.amp.gain.linearRampToValueAtTime(0.38, 0.12);
  v.amp.gain.setValueAtTime(0.38, 1.9);
  v.amp.gain.linearRampToValueAtTime(0, DUR);
  // Pitch sweep proves the oscillators are wired and frequency reaches output
  for (const [osc, mul] of [[v.oscA, 1], [v.oscB, 1], [v.oscC, 0.5]]) {
    osc.frequency.setValueAtTime(ROOT_HZ * mul, 0);
    osc.frequency.exponentialRampToValueAtTime(392 * mul, 2.0);
  }
  v.filter.frequency.setValueAtTime(700, 0);
  v.filter.frequency.exponentialRampToValueAtTime(4200, 2.0);
  v.noiseGain.gain.setValueAtTime(0, 0);
  v.noiseGain.gain.linearRampToValueAtTime(0.05, 0.4);
  v.send.gain.setValueAtTime(0.25, 0);
  master.wet.gain.setValueAtTime(0.35, 0);

  const buf = await off.startRendering();
  let sumSq = 0, peak = 0, n = buf.length * buf.numberOfChannels;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const s = d[i];
      sumSq += s * s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
  }
  const rms = Math.sqrt(sumSq / n);
  const audioPass = rms > 0.02 && peak < 1.0 && peak > 0.05;

  // The body map gets its own tests, run against synthetic poses where the
  // correct answer is known by construction. A gesture map that is inverted
  // still makes sound and still looks fine in a screenshot; only a test that
  // knows the right numbers catches it.
  const body = runBodyTests();
  const pass = audioPass && body.pass;

  const result = {
    rms: +rms.toFixed(4),
    peak: +peak.toFixed(4),
    audioPass,
    bodyPassed: body.passed,
    bodyTotal: body.total,
    bodyFailures: body.results.filter((r) => !r.pass).map((r) => r.name),
    pass,
  };
  box.className = pass ? 'pass' : 'fail';
  box.textContent =
    `SELF-TEST ${pass ? 'PASS' : 'FAIL'} · rms ${result.rms} · peak ${result.peak} · ` +
    `body ${result.bodyPassed}/${result.bodyTotal} · ${DUR}s @ ${SR}Hz`;
  console.log('[selftest]', result);
  return result;
}

// ── wire up ──────────────────────────────────────────────────────────────
// ── drum machine wiring ───────────────────────────────────────────────────
buildDrumGrid();
for (const b of document.querySelectorAll('#outMode button')) {
  b.addEventListener('click', () => setVoiceMode(b.dataset.mode));
}
$('drumPlay').addEventListener('click', toggleDrumTransport);
$('drumClear').addEventListener('click', () => {
  if (state.drum) state.drum.clear();
  else for (const tr of TRACKS) state.drumPending[tr].fill(false);
  syncDrumGrid();
});
$('tempo').addEventListener('input', (e) => {
  const v = +e.target.value;
  state.drumTempo = v;
  if (state.drum) state.drum.setTempo(v);
  $('tempoOut').textContent = String(v);
});
$('swing').addEventListener('input', (e) => {
  const v = +e.target.value;
  state.drumSwing = v;
  if (state.drum) state.drum.setSwing(v);
  $('swingOut').textContent = v.toFixed(2);
});
$('drumPreset').addEventListener('change', (e) => {
  const name = e.target.value;
  if (state.drum) state.drum.loadPreset(name);
  state.drumPending = presetPattern(name);
  syncDrumGrid();
});

$('start').addEventListener('click', startAudio);
$('camBtn').addEventListener('click', enableCamera);
$('midiBtn').addEventListener('click', enableMidi);
$('panicBtn').addEventListener('click', () => {
  panic(state.mpe);
  state.voices.forEach((v) => v.bowOff());
  if (state.drumVoice) state.drumVoice.bowOff();
  state.contact = [false, false];
  state.midiNote = [null, null];
  state.gate.forEach((g) => { g.state = false; });
});

$('midiSel').addEventListener('change', (e) => {
  const ok = state.mpe.selectOutput(e.target.value);
  $('midistate').textContent = ok ? `→ ${e.target.selectedOptions[0].textContent}` : 'no output';
});

// Both models keep their own video timestamps; a new stream restarts the
// clock, so both must be reset or the next detect() throws on a timestamp it
// has already seen. Any stream change goes through here.
function resetTrackingClock() {
  state.tracker.videoTime = -1;
  state.poseTracker.videoTime = -1;
  state.smoother.reset();
  state.bodySmoother.reset();
}

$('camSel').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  // A deliberate pick must never be overridden by auto-select.
  state.camera.manualSelection = true;
  setStatus('switching camera…');
  try {
    await state.camera.switchTo(e.target.value);
    resetTrackingClock();
    setStatus(`camera: ${e.target.selectedOptions[0].textContent}`);
  } catch (err) {
    setStatus('camera switch failed');
    console.error('[camera switch]', err);
  }
});

$('glide').addEventListener('input', (e) => {
  state.glide = +e.target.value;
  $('glideOut').textContent = state.glide.toFixed(2);
});
$('bright').addEventListener('input', (e) => {
  state.brightness = +e.target.value;
  $('brightOut').textContent = state.brightness.toFixed(2);
});
$('vol').addEventListener('input', (e) => {
  state.volume = +e.target.value;
  $('volOut').textContent = state.volume.toFixed(2);
});

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  const padL = 56, padR = 32;
  const laneW = r.width - padL - padR;
  state.mouse.x = clamp((e.clientX - r.left - padL) / laneW, 0, 1);
  state.mouse.y = clamp((e.clientY - r.top) / r.height, 0, 1);
  state.mouse.active = true;
});
canvas.addEventListener('mousedown', () => { state.mouse.down = true; });
window.addEventListener('mouseup', () => { state.mouse.down = false; });

// Space also bows in mouse mode — useful when the camera is blocked.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); state.mouse.down = true; }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') state.mouse.down = false;
});

resize();
requestAnimationFrame(frame);

// Expose for headless verification.
window.__instrument = {
  state, selfTest, startAudio, noteName,
  // Drum machine: the harness starts the transport and counts scheduled hits.
  drum: () => {
    const d = state.drum;
    if (!d) return { ready: false };
    return {
      ready: true,
      playing: d.playing,
      tempo: d.tempo,
      swing: d.swing,
      stepDuration: +d.stepDuration.toFixed(5),
      scheduledHits: d.scheduledHits,
      scheduledSteps: d.scheduledSteps,
      currentStep: d.currentStep,
      pattern: d.getPattern(),
      busGain: +d.bus.gain.value.toFixed(3),
    };
  },
  drumStart: () => { if (!state.drum) startAudio(); state.drum.start(); return true; },
  drumStop: () => { if (state.drum) state.drum.stop(); return true; },
  drumSelfTest: () => drumVoiceSelfTest(),
  setVoiceMode: (m) => { setVoiceMode(m); return state.voiceMode; },
  voice: () => ({
    mode: state.voiceMode,
    active: state.voiceMode === 'drums' ? 'drum' : 'string',
    kitReady: state.drumVoice ? state.drumVoice.ready : false,
    kitLoaded: state.drumVoice ? state.drumVoice.buffers.size : 0,
    kitError: state.drumVoice && state.drumVoice.loadError
      ? String(state.drumVoice.loadError.message || state.drumVoice.loadError) : null,
    pads: state.drumVoice ? state.drumVoice.padIndex : null,
    hits: state.drumVoice ? state.drumVoice.hits : 0,
    velocity: state.drumVoice ? +state.drumVoice.velocity.toFixed(3) : null,
    contact: state.contact[0],
  }),
  drumPadSelfTest: () => drumPadSelfTest(),
  // Exposed for the verify harness: the raw and derived body state, so a
  // headless run can assert that the body map is actually driving the voice.
  body: () => ({
    driver: state.driver,
    gesture: state.body,
    rawLandmarks: state.bodyRaw ? state.bodyRaw.length : 0,
    voice: state.voices[0] ? {
      hz: +state.voices[0].hz.toFixed(2),
      pressure: +state.voices[0].pressure.toFixed(4),
      bowSpeed: +state.voices[0].bowSpeed.toFixed(4),
      swell: +state.voices[0].swell.toFixed(4),
      intensity: +state.voices[0].intensity.toFixed(4),
      ampTarget: +(state.voices[0].ampTarget ?? 0).toFixed(4),
      contact: state.voices[0].contact,
    } : null,
    contact: state.contact[0],
    note: +state.note[0].toFixed(3),
  }),
  // Latency instrumentation — measured, not estimated.
  latency: () => {
    const t = state.tracker;
    const pt = state.poseTracker;
    const avg = (o) => (o && o.detectSteadySamples
      ? +(o.detectTotalMs / o.detectSteadySamples).toFixed(2) : null);
    return {
      detectLastMs: t.lastDetectMs ?? null,
      detectAvgMs: avg(t),
      detectSamples: t.detectSamples || 0,
      // Pose is the heavier model, so its budget is stated separately
      // rather than averaged in with the hand number.
      poseDetectLastMs: pt.lastDetectMs ?? null,
      poseDetectAvgMs: avg(pt),
      poseDetectSamples: pt.detectSamples || 0,
      // Combined per-frame inference cost: both models run on the same
      // camera frame, so this is what the player actually waits for.
      combinedAvgMs: (avg(t) != null && avg(pt) != null)
        ? +(avg(t) + avg(pt)).toFixed(2) : null,
      baseLatencyMs: state.ctx ? +(state.ctx.baseLatency * 1000).toFixed(2) : null,
      outputLatencyMs: state.ctx && state.ctx.outputLatency != null
        ? +(state.ctx.outputLatency * 1000).toFixed(2) : null,
    };
  },
  // Body-map tests, exposed so the verify harness can assert on them
  // without needing a camera or a person.
  bodyTests: () => runBodyTests(),
};

const params = new URLSearchParams(location.search);
if (params.has('selftest')) {
  // Offline render needs no user gesture, so this runs headless.
  selfTest().then((r) => { window.__selftest = r; });
}

// ── publish guards ───────────────────────────────────────────────────────
// Hosted on a public page, these matter: a phone can't give a useful hand
// view, and Safari/Firefox have no Web MIDI. Neither should look broken.
(() => {
  try {
    if (window.matchMedia('(max-width: 820px), (pointer: coarse)').matches) {
      const n = $('mobileNote');
      if (n) n.style.display = 'block';
    }
  } catch (_) { /* matchMedia unavailable */ }

  if (!MPEOut.supported()) {
    for (const id of ['midiBtn', 'midiSel']) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
    const st = $('midistate');
    if (st) st.textContent = 'MPE output needs Chrome or Edge';
  }
})();
