// Drum machine.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A SEQUENCER AND NOT A GESTURE TRIGGER
// ─────────────────────────────────────────────────────────────────────────────
// Everything else in this project is bowed rather than struck for one reason:
// camera + network latency is 45–90ms, and percussion is unforgiving of it. A
// hi-hat that lands 80ms late is not a hi-hat, it is a mistake.
//
// A drum machine is not a gesture instrument. It is a *clock*. Every hit is
// scheduled against AudioContext.currentTime to the sample, and the camera
// never touches it. So the drum machine can be as tight as anything in a DAW
// while the string stays loose, and the two coexist because they do not share
// a timing source.
//
// This is the standard lookahead scheduler (the "two clocks" pattern): a
// coarse setInterval wakes up often, and each wake schedules every hit that
// falls inside a short window ahead, at exact audio-clock times. Never drive
// audio from setInterval directly — the jitter is audible.
//
// All voices are synthesised. No samples, no network, no assets: the page's
// promise is that it runs entirely on the machine, and pulling in a 4MB kick
// sample set would quietly break that.

import { buildMaster } from './engine.js';

export const STEPS = 16;
export const TRACKS = ['kick', 'snare', 'hat', 'tom'];

const LOOKAHEAD_MS = 25;      // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12;  // how far ahead it schedules, in seconds

// ── voices ──────────────────────────────────────────────────────────────

function noiseBuffer(ctx, seconds = 0.5) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Every hit is built from oscillators and noise at schedule time, then thrown
// away. Nothing is kept alive between hits, so a long pattern has no memory
// cost and no stuck nodes.
function playKick(ctx, dest, t, gain) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.055);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  osc.connect(amp); amp.connect(dest);
  osc.start(t); osc.stop(t + 0.45);

  // Beater click. Without it the kick is a sine thump with no attack.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.03);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1800;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(gain * 0.30, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  click.connect(hp); hp.connect(cg); cg.connect(dest);
  click.start(t); click.stop(t + 0.04);
}

function playSnare(ctx, dest, t, gain) {
  // Noise body.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.25);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(gain * 0.9, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
  n.connect(bp); bp.connect(ng); ng.connect(dest);
  n.start(t); n.stop(t + 0.22);

  // Shell tone, so it reads as a drum and not a burst of static.
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(190, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
  og.gain.setValueAtTime(gain * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(og); og.connect(dest);
  osc.start(t); osc.stop(t + 0.16);
}

function playHat(ctx, dest, t, gain) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.08);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 7200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * 0.55, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  n.connect(hp); hp.connect(g); g.connect(dest);
  n.start(t); n.stop(t + 0.09);
}

function playTom(ctx, dest, t, gain) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(105, t + 0.13);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.85, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.33);
}

const VOICES = { kick: playKick, snare: playSnare, hat: playHat, tom: playTom };

// ── presets ─────────────────────────────────────────────────────────────
// Step strings, 16 chars per track. x = hit, . = rest.
const PRESETS = {
  'four on the floor': {
    kick:  'x...x...x...x...',
    snare: '....x.......x...',
    hat:   '..x...x...x...x.',
    tom:   '................',
  },
  'boom bap': {
    kick:  'x.....x...x.....',
    snare: '....x.......x...',
    hat:   'x.x.x.x.x.x.x.x.',
    tom:   '..............x.',
  },
  'half time punk': {
    kick:  'x.......x.......',
    snare: '........x.......',
    hat:   'x.x.x.x.x.x.x.x.',
    tom:   '..............x.',
  },
  'broken beat': {
    kick:  'x..x..x...x..x..',
    snare: '....x..x..x...x.',
    hat:   'x.xxx.x.xx.xxx.x',
    tom:   '..........x.....',
  },
};

function parsePattern(obj) {
  const out = {};
  for (const tr of TRACKS) {
    out[tr] = (obj[tr] || '').padEnd(STEPS, '.').split('').map((c) => c === 'x');
  }
  return out;
}

// ── the machine ─────────────────────────────────────────────────────────

export class DrumMachine {
  constructor(ctx, master) {
    this.ctx = ctx;
    // Straight to the master dry bus: it picks up the compressor and the
    // master volume, and deliberately skips the string's reverb send. Drums
    // through a bowed-string IR sound like they are in the next room.
    this.dest = master.dry;
    this.bus = ctx.createGain();
    // Level is set so a busy pattern sits *under* the bowed string rather than
    // on top of it. Measured, not guessed: at 0.9 the drum bus rendered at 0.331
    // RMS against the string's 0.0920 — the machine buried the instrument being
    // played, which defeats the point of having both.
    this.baseLevel = 0.22;
    this.muted = false;
    this.bus.gain.value = this.baseLevel;
    this.bus.connect(this.dest);

    this.pattern = parsePattern(PRESETS['boom bap']);
    this.tempo = 92;
    this.swing = 0;
    this.playing = false;
    this.currentStep = -1;
    this.nextNoteTime = 0;
    this.timer = null;

    // Stats the verification harness reads. Counting scheduled hits is how you
    // prove a sequencer ran without listening to it.
    this.scheduledHits = 0;
    this.scheduledSteps = 0;
    this.onStep = null;      // UI callback, fired from the scheduler wake
    this._lastUI = -1;
  }

  get stepDuration() { return 60 / this.tempo / 4; }  // one 16th

  setTempo(bpm) {
    this.tempo = Math.min(200, Math.max(40, bpm));
  }

  setSwing(amount) {
    this.swing = Math.min(1, Math.max(0, amount));
  }

  setLevel(v) {
    this.baseLevel = Math.min(1, Math.max(0, v));
    if (!this.muted) this.bus.gain.setTargetAtTime(this.baseLevel, this.ctx.currentTime, 0.02);
  }

  // Muting silences the bus but leaves the transport running, so the bar keeps
  // counting and coming back lands in time rather than restarting.
  setMuted(on) {
    this.muted = !!on;
    this.bus.gain.setTargetAtTime(this.muted ? 0 : this.baseLevel, this.ctx.currentTime, 0.02);
  }

  toggle(track, step) {
    const row = this.pattern[track];
    if (!row) return false;
    row[step] = !row[step];
    return row[step];
  }

  set(track, step, on) {
    const row = this.pattern[track];
    if (!row) return;
    row[step] = !!on;
  }

  clear() {
    for (const tr of TRACKS) this.pattern[tr].fill(false);
  }

  loadPreset(name) {
    if (!PRESETS[name]) return false;
    this.pattern = parsePattern(PRESETS[name]);
    return true;
  }

  getPattern() {
    const o = {};
    for (const tr of TRACKS) o[tr] = this.pattern[tr].map((b) => (b ? 1 : 0));
    return o;
  }

  setPattern(obj) {
    this.pattern = parsePattern(
      Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.map((b) => (b ? 'x' : '.')).join('')]))
    );
  }

  start() {
    if (this.playing) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this.currentStep = 0;
    // Small lead so the first hit is not scheduled in the past.
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this._lastUI = -1;
    this.timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
    this._tick();
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.currentStep = -1;
    if (this.onStep) this.onStep(-1);
  }

  _tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    while (this.nextNoteTime < now + SCHEDULE_AHEAD) {
      this._scheduleStep(this.currentStep, this.nextNoteTime);
      this._advance();
    }
    // Hand the UI the step that is sounding right now, not the one being
    // scheduled ~120ms in the future, or the highlight runs ahead of the audio.
    const lag = this.nextNoteTime - now;
    const behind = Math.round((SCHEDULE_AHEAD - lag) / this.stepDuration);
    const uiStep = ((this.currentStep - behind) % STEPS + STEPS) % STEPS;
    if (uiStep !== this._lastUI) {
      this._lastUI = uiStep;
      if (this.onStep) this.onStep(uiStep);
    }
  }

  _advance() {
    this.nextNoteTime += this.stepDuration;
    this.currentStep = (this.currentStep + 1) % STEPS;
  }

  _scheduleStep(step, baseTime) {
    // Swing: push the odd 16ths later. This is what makes a straight pattern
    // breathe, and it is the difference between a drum machine and a metronome.
    let t = baseTime;
    if (this.swing > 0 && step % 2 === 1) t += this.stepDuration * this.swing * 0.5;

    for (const tr of TRACKS) {
      if (!this.pattern[tr][step]) continue;
      const voice = VOICES[tr];
      if (!voice) continue;
      // Accent the downbeat slightly; a perfectly even velocity grid sounds
      // like a test tone.
      const accent = step % 4 === 0 ? 1 : 0.82;
      voice(this.ctx, this.bus, t, TRACK_HIT[tr] * accent);
      this.scheduledHits++;
    }
    this.scheduledSteps++;
  }

  dispose() {
    this.stop();
    try { this.bus.disconnect(); } catch (_) { /* already gone */ }
  }
}

const TRACK_HIT = { kick: 1.0, snare: 0.75, hat: 0.42, tom: 0.7 };

export { PRESETS };

// Boolean pattern for a preset, for UI that exists before the AudioContext does.
export function presetPattern(name) {
  const p = parsePattern(PRESETS[name] || {});
  const o = {};
  for (const tr of TRACKS) o[tr] = p[tr].slice();
  return o;
}

// ── offline verification ────────────────────────────────────────────────
// Renders each voice alone and reports its level. Proves the synthesis makes
// sound and that no voice is silently dead — a drum machine whose kick track
// schedules hits into a disconnected node would pass every other test.
export async function drumVoiceSelfTest(sr = 48000) {
  const DUR = 0.6;
  const out = {};
  for (const tr of TRACKS) {
    const off = new OfflineAudioContext(2, Math.floor(sr * DUR), sr);
    const master = buildMaster(off);
    const dm = new DrumMachine(off, master);
    dm.clear();
    dm.set(tr, 0, true);
    dm._scheduleStep(0, 0.01);
    const buf = await off.startRendering();
    let sumSq = 0, peak = 0;
    const n = buf.length * buf.numberOfChannels;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const s = d[i];
        sumSq += s * s;
        if (Math.abs(s) > peak) peak = Math.abs(s);
      }
    }
    out[tr] = { rms: +Math.sqrt(sumSq / n).toFixed(5), peak: +peak.toFixed(4) };
  }
  return out;
}
