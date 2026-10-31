// Bowed-string voice engine.
// Design rule: nothing here is percussive. Attack is slow, release is long,
// every parameter glides. The instrument family is bowed/breath/swept because
// that is the family a 60-100ms gesture loop can actually play.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Pinkish noise for bow friction. Not white — white sounds like hiss.
function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = 0.97 * last + 0.03 * w;
    d[i] = last * 3.2;
  }
  return buf;
}

// Procedural IR so the project stays zero-asset.
function makeIR(ctx, seconds = 2.4, decay = 2.8) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function buildMaster(ctx) {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 24;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const out = ctx.createGain();
  out.gain.value = 0.9;

  const dry = ctx.createGain();
  dry.gain.value = 1;

  const convolver = ctx.createConvolver();
  convolver.buffer = makeIR(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.0;

  dry.connect(compressor);
  convolver.connect(wet);
  wet.connect(compressor);
  compressor.connect(out);
  out.connect(ctx.destination);

  return { dry, reverb: convolver, wet, out };
}

export class BowedVoice {
  constructor(ctx, master) {
    this.ctx = ctx;
    this.master = master;
    this.contact = false;
    this.hz = 130.81;
    this.pressure = 0;
    this.bowSpeed = 0;
    this.brightness = 0.5;
    // Torso dimensions. Neutral defaults so the voice behaves identically
    // before the body map has said anything: swell 0.55 and intensity 1.0
    // multiply out to the original amplitude.
    this.swell = 0.55;
    this.intensity = 1.0;

    // Three partials. Saw pair gives the string; triangle an octave down gives body.
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscC = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB.type = 'sawtooth';
    this.oscC.type = 'triangle';
    this.oscB.detune.value = -7;

    this.gA = ctx.createGain(); this.gA.gain.value = 0.42;
    this.gB = ctx.createGain(); this.gB.gain.value = 0.30;
    this.gC = ctx.createGain(); this.gC.gain.value = 0.26;

    // Bow friction layer.
    this.noise = ctx.createBufferSource();
    this.noise.buffer = makeNoiseBuffer(ctx, 2);
    this.noise.loop = true;
    this.noiseBP = ctx.createBiquadFilter();
    this.noiseBP.type = 'bandpass';
    this.noiseBP.Q.value = 7;
    this.noiseBP.frequency.value = 800;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    this.pre = ctx.createGain();
    this.pre.gain.value = 0.8;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 2.5;

    // Instrument body. A string on its own is a thin buzz; the wooden box is
    // a fixed resonance that does not move with pitch. Without this the voice
    // reads as "synth" no matter how good the filtering is.
    this.body = ctx.createBiquadFilter();
    this.body.type = 'peaking';
    this.body.frequency.value = 1750;
    this.body.Q.value = 1.15;
    this.body.gain.value = 6.5;

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.send = ctx.createGain();
    this.send.gain.value = 0.12;

    // Vibrato
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5.2;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0;
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.oscA.detune);
    this.lfoDepth.connect(this.oscB.detune);
    this.lfoDepth.connect(this.oscC.detune);

    this.oscA.connect(this.gA); this.gA.connect(this.pre);
    this.oscB.connect(this.gB); this.gB.connect(this.pre);
    this.oscC.connect(this.gC); this.gC.connect(this.pre);
    this.noise.connect(this.noiseBP);
    this.noiseBP.connect(this.noiseGain);
    this.noiseGain.connect(this.pre);

    this.pre.connect(this.filter);
    this.filter.connect(this.body);
    this.body.connect(this.amp);
    this.amp.connect(master.dry);
    this.amp.connect(this.send);
    this.send.connect(master.reverb);

    const t0 = ctx.currentTime;
    this.oscA.start(t0);
    this.oscB.start(t0);
    this.oscC.start(t0);
    this.noise.start(t0);
    this.lfo.start(t0);
  }

  _set(param, value, tc = 0.02) {
    const t = this.ctx.currentTime;
    param.setTargetAtTime(value, t, Math.max(0.001, tc));
  }

  setPitch(hz) {
    this.hz = clamp(hz, 40, 2000);
    this._set(this.oscA.frequency, this.hz, 0.015);
    this._set(this.oscB.frequency, this.hz, 0.015);
    this._set(this.oscC.frequency, this.hz * 0.5, 0.015);
    this._set(this.noiseBP.frequency, this.hz * 2.2, 0.03);
    this._applyFilter();
  }

  setPressure(p) {
    this.pressure = clamp(p, 0, 1);
    this._applyAmp();
    this._applyFilter();
  }

  // Bow speed, not bow pressure, is what makes a friction layer speak.
  // A stationary bow sticks to the string and nearly silences it; the noise
  // and the top end both come from the draw. Without this the voice responds
  // to a fader and never to the gesture.
  setBowSpeed(v) {
    this.bowSpeed = clamp(v, 0, 1);
    this._applyAmp();
    this._applyFilter();
  }

  setBrightness(b) {
    this.brightness = clamp(b, 0, 1);
    this._applyFilter();
  }

  setVibrato(depth) {
    this._set(this.lfoDepth.gain, clamp(depth, 0, 1) * 42, 0.06);
  }

  setSpace(amount) {
    // Per-voice send only. Writing master.wet here would make two voices fight
    // over one shared gain and pump.
    this._set(this.send.gain, clamp(amount, 0, 1) * 0.55, 0.08);
  }

  // ── torso dimensions ───────────────────────────────────────────────────
  //
  // These come from the BODY map, not the hands. A hand cannot express a
  // phrase swell or a weight shift — those live in the torso and the hips.
  //
  // They are separate parameters rather than folded into pressure or
  // brightness because each one has a different physical source. Folding
  // them together would make it impossible to play a swelling phrase without
  // also changing the tone colour.

  // Swell: the phrase dynamic. 0 = flat, 1 = fully swelled.
  // Scales the bowed amplitude. Signed torso twist maps to this.
  setSwell(amount) {
    this.swell = clamp(amount, 0, 1);
    this._applyAmp();
  }

  // Intensity: the global weight shift. Scales the whole voice.
  setIntensity(amount) {
    this.intensity = clamp(amount, 0.1, 1);
    this._applyAmp();
  }

  _applyAmp() {
    // Bowing is pressure-driven: below a threshold the string does not speak.
    // That threshold is what makes it feel physical rather than like a fader.
    const p = this.pressure;
    const speed = this.bowSpeed;
    const bowed = p < 0.06 ? 0 : 0.05 + Math.pow(p, 0.7) * 0.52 + speed * 0.07;
    // The torso dimensions scale the result. Swell rides on top of
    // intensity, so a phrase can bloom without changing the global level.
    const scaled = bowed * this.intensity * (0.55 + this.swell * 0.45);
    const target = this.contact ? scaled : 0;
    // Expose the driven value. `amp.gain.value` is useless as a readout: _set()
    // only schedules setTargetAtTime, which never updates the AudioParam's
    // .value property, so anything reading it sees the constructor default
    // forever. Harnesses read this instead.
    this.ampTarget = target;
    // Release time constant 0.55s → the string is effectively silent by
    // ~1.6s. A bowed string does not stop dead, and a short release reads as
    // a synth pad being gated rather than a bow leaving the string.
    this._set(this.amp.gain, target, this.contact ? 0.025 : 0.55);
    // Friction is velocity-led, pressure-scaled.
    const friction = this.contact
      ? (0.014 + speed * 0.085) * (0.35 + p * 0.65)
      : 0;
    this._set(this.noiseGain.gain, friction, 0.02);
  }

  _applyFilter() {
    // Cutoff tracks pitch, so higher notes stay proportionally bright, and it
    // tracks bow speed, because a fast draw excites more partials.
    const base = this.hz * (1.6 + this.pressure * 9) * (1 + this.bowSpeed * 1.7);
    const tilt = this.brightness * 2600;
    this._set(this.filter.frequency, clamp(base + tilt, 180, 12000), 0.03);
    this._set(this.filter.Q, 1.2 + (1 - this.pressure) * 4.5, 0.05);
  }

  bowOn() {
    if (this.contact) return;
    this.contact = true;
    this._applyAmp();
  }

  bowOff() {
    if (!this.contact) return;
    this.contact = false;
    this._applyAmp();
  }

  dispose() {
    try {
      [this.oscA, this.oscB, this.oscC, this.noise, this.lfo].forEach((n) => n.stop());
    } catch (_) { /* already stopped */ }
  }
}
