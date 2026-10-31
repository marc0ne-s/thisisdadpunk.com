// Drum voice — the same gesture instrument, playing a drum kit instead of a
// bowed string.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS TRADES AWAY THE THING THE INSTRUMENT WAS BUILT FOR
// ─────────────────────────────────────────────────────────────────────────────
// The bowed voice exists because 45–90ms of camera latency makes struck
// percussion unplayable: a hit that lands 80ms late is a mistake, and no amount
// of good mapping fixes it. Swapping in drums does not remove that latency — it
// spends it. Every hit here inherits the camera's delay.
//
// It is still worth having, for one reason: a drum pad is forgiving of *timing*
// when you are not trying to keep a beat. Free-handed hits with a bit of slop
// read as expressive rather than wrong, and the kit is a fast way to find out
// what the gestures feel like. Do not expect to play a groove over the sequencer
// with it. If tight rhythm is the goal, that is what the drum machine is for.
//
// ─────────────────────────────────────────────────────────────────────────────
// MAPPING
// ─────────────────────────────────────────────────────────────────────────────
// The pitch lane becomes a rack. The same X position that selected a note now
// selects a pad, quantised into eight zones across C3–C5. Contact fires the pad;
// bow speed becomes hit velocity, so the same gesture that bowed a string harder
// now hits a drum harder.
//
// Sliding between pads *while still in contact* retriggers — that turns the
// lane into something you can drag across, which is the playable part.

export const PADS = [
  { id: 'kick_sub', file: 'samples/kick_sub.wav', label: 'KICK SUB', gain: 0.85 },
  { id: 'kick_707', file: 'samples/kick_707.wav', label: 'KICK 707', gain: 0.80 },
  { id: 'kick_spd', file: 'samples/kick_spd.wav', label: 'KICK SPD', gain: 0.80 },
  { id: 'snare', file: 'samples/snare_main.wav', label: 'SNARE', gain: 0.75 },
  { id: 'clap', file: 'samples/clap.wav', label: 'CLAP', gain: 0.65 },
  { id: 'hat_closed', file: 'samples/hihat_closed.wav', label: 'HAT CL', gain: 0.55 },
  { id: 'hat_open', file: 'samples/hihat_open.wav', label: 'HAT OP', gain: 0.50 },
  { id: 'crash', file: 'samples/crash.wav', label: 'CRASH', gain: 0.45 },
];

const ROOT_HZ = 130.81;   // C3, same lane origin as the string voice
const SPAN_SEMIS = 24;    // C3..C5
const MAX_VOICES = 8;     // stop runaway accumulation if a hand jitters on a pad

export class DrumVoice {
  constructor(ctx, master, basePath = '') {
    this.ctx = ctx;
    this.basePath = basePath;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.75;
    this.bus.connect(master.dry);

    this.buffers = new Map();
    this.loading = null;
    this.loadError = null;

    this.contact = false;
    this.hz = ROOT_HZ;
    this.padIndex = 0;
    this.velocity = 0.6;

    // Kept so the UI and the MPE layer, which both assume a string voice, keep
    // working without special-casing the drum kit.
    this.swing = 0.55;
    this.intensity = 1.0;
    this.pressure = 0;
    this.bowSpeed = 0;
    this.brightness = 0.5;

    this.hits = 0;
    this.active = [];
    this.ampTarget = 0;   // last velocity actually fired, for the harness
  }

  // fetch + decode once, up front. 256KB of mono 44.1k PCM — small enough that
  // decoding it all at start beats decoding on first hit, which would add a
  // visible stall to the exact moment you are trying to play.
  async load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const results = await Promise.all(PADS.map(async (p) => {
        const res = await fetch(this.basePath + p.file);
        if (!res.ok) throw new Error(`${p.file}: HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(bytes);
        this.buffers.set(p.id, buf);
        return p.id;
      }));
      return results.length;
    })();
    try {
      return await this.loading;
    } catch (err) {
      this.loadError = err;
      console.error('[drumvoice]', err);
      return 0;
    }
  }

  get ready() { return this.buffers.size === PADS.length; }

  padForHz(hz) {
    const semi = 12 * Math.log2(Math.max(hz, 1) / ROOT_HZ);
    const norm = semi / SPAN_SEMIS;
    if (!Number.isFinite(norm)) return 0;
    return Math.max(0, Math.min(PADS.length - 1, Math.floor(norm * PADS.length)));
  }

  setPitch(hz) {
    this.hz = Math.max(40, Math.min(2000, hz));
    const idx = this.padForHz(this.hz);
    if (idx !== this.padIndex) {
      const wasContact = this.contact;
      this.padIndex = idx;
      // Dragging across pads while bowed plays them. This is the one gesture
      // that feels good despite the latency, because it is continuous.
      if (wasContact) this.fire();
    }
  }

  setPressure(p) {
    this.pressure = Math.max(0, Math.min(1, p));
    this._recomputeVelocity();
  }

  setBowSpeed(v) {
    this.bowSpeed = Math.max(0, Math.min(1, v));
    this._recomputeVelocity();
  }

  _recomputeVelocity() {
    // Speed leads, pressure scales — the same relationship the bow uses, so a
    // hand that learned the string does not have to relearn the kit.
    //
    // The floor is deliberately high. A strike IS a velocity event, but at 30fps
    // the camera resolves almost none of a strike's speed, so a purely
    // speed-driven curve made every hit inaudible. Contacts land at roughly half
    // velocity and speed adds on top of that.
    this.velocity = Math.max(0.08, Math.min(1, (0.45 + this.bowSpeed * 0.55) * (0.60 + this.pressure * 0.40)));
  }

  bowOn() {
    if (this.contact) return;
    this.contact = true;
    this.fire();
  }

  // One-shots ring out on their own; releasing contact does not cut them, the
  // same way letting go of a drum pad does not un-hit the drum.
  bowOff() {
    this.contact = false;
    this.ampTarget = 0;
  }

  fire() {
    if (!this.ready) return false;
    const pad = PADS[this.padIndex];
    const buf = this.buffers.get(pad.id);
    if (!buf) return false;

    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const v = this.velocity;
    // 1.4 rather than 2.0: a squared curve is a believable dynamic range on a
    // DAW pad, but with this velocity floor it put soft hits at -27dB.
    g.gain.setValueAtTime(pad.gain * Math.pow(v, 1.4), t);
    src.connect(g);
    g.connect(this.bus);
    src.start(t);

    this.active.push(src);
    if (this.active.length > MAX_VOICES) {
      const old = this.active.shift();
      try { old.stop(); } catch (_) { /* already ended */ }
    }
    src.onended = () => {
      const i = this.active.indexOf(src);
      if (i >= 0) this.active.splice(i, 1);
      try { g.disconnect(); } catch (_) { /* already gone */ }
    };

    this.hits++;
    this.ampTarget = v;
    return true;
  }

  // String-voice API surface, so callers do not need to know which voice is live.
  setBrightness(b) { this.brightness = Math.max(0, Math.min(1, b)); }
  setVibrato() { /* a drum has no vibrato */ }
  setSpace(amount) {
    // Small send only: a drum kit in a big verb turns to mush.
    this.bus.gain.setTargetAtTime(0.75 + Math.max(0, Math.min(1, amount)) * 0.1, this.ctx.currentTime, 0.05);
  }
  setSwell(amount) { this.swell = Math.max(0, Math.min(1, amount)); }
  setIntensity(amount) { this.intensity = Math.max(0.1, Math.min(1, amount)); }

  dispose() {
    for (const s of this.active) { try { s.stop(); } catch (_) { /* ended */ } }
    this.active.length = 0;
    try { this.bus.disconnect(); } catch (_) { /* already gone */ }
  }
}

// Offscreen helper for the harness: render one pad at a fixed velocity and
// report its level, so a missing or silent sample is caught without listening.
export async function drumPadSelfTest(sr = 44100) {
  const out = {};
  for (const pad of PADS) {
    const off = new OfflineAudioContext(1, Math.floor(sr * 0.6), sr);
    let buf = null;
    try {
      const res = await fetch(pad.file);
      buf = await off.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      out[pad.id] = { error: String(err) };
      continue;
    }
    const src = off.createBufferSource();
    src.buffer = buf;
    const g = off.createGain();
    g.gain.value = pad.gain * 0.8;
    src.connect(g); g.connect(off.destination);
    src.start(0);

    const rendered = await off.startRendering();
    const d = rendered.getChannelData(0);
    let sumSq = 0, peak = 0;
    for (let i = 0; i < d.length; i++) {
      sumSq += d[i] * d[i];
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    out[pad.id] = { rms: +Math.sqrt(sumSq / d.length).toFixed(5), peak: +peak.toFixed(4) };
  }
  return out;
}
