// MPE output. Side channel only — audio never travels this path.
// MPE because gestural input is per-note pitch bend + pressure + timbre.
// Plain MIDI would quantise every expressive axis into a switch.

const MPE_FIRST_CHANNEL = 1; // 0-indexed => MIDI channel 2
const MPE_LAST_CHANNEL = 15; // 0-indexed => MIDI channel 16

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class MPEOut {
  constructor() {
    this.access = null;
    this.output = null;
    this.enabled = false;
    this.nextChannel = MPE_FIRST_CHANNEL;
    this.lastSend = 0;
    this.channelForVoice = new Map();
  }

  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  }

  async enable() {
    if (!MPEOut.supported()) throw new Error('Web MIDI not supported in this browser');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => { /* device list refresh handled by UI */ };
    this.enabled = true;
    return this.listOutputs();
  }

  listOutputs() {
    if (!this.access) return [];
    const out = [];
    this.access.outputs.forEach((o) => out.push({ id: o.id, name: o.name, manufacturer: o.manufacturer }));
    return out;
  }

  selectOutput(id) {
    if (!this.access) return false;
    this.output = this.access.outputs.get(id) || null;
    return !!this.output;
  }

  // Round-robin channel allocation, skipping channels still releasing.
  allocateChannel(voiceId) {
    const span = MPE_LAST_CHANNEL - MPE_FIRST_CHANNEL + 1;
    for (let i = 0; i < span; i++) {
      const ch = MPE_FIRST_CHANNEL + ((this.nextChannel - MPE_FIRST_CHANNEL + i) % span);
      let taken = false;
      for (const [v, c] of this.channelForVoice) if (v !== voiceId && c === ch) taken = true;
      if (!taken) {
        this.nextChannel = MPE_FIRST_CHANNEL + ((ch - MPE_FIRST_CHANNEL + 1) % span);
        this.channelForVoice.set(voiceId, ch);
        return ch;
      }
    }
    return MPE_FIRST_CHANNEL;
  }

  releaseChannel(voiceId) { this.channelForVoice.delete(voiceId); }

  _send(bytes) {
    if (!this.output) return;
    try { this.output.send(bytes); } catch (_) { /* device removed mid-flight */ }
  }

  noteOn(voiceId, note, velocity) {
    const ch = this.allocateChannel(voiceId);
    this._send([0x90 | ch, clamp(note, 0, 127), clamp(Math.round(velocity * 127), 1, 127)]);
    return ch;
  }

  noteOff(voiceId, note) {
    const ch = this.channelForVoice.get(voiceId) ?? MPE_FIRST_CHANNEL;
    this._send([0x80 | ch, clamp(note, 0, 127), 0]);
    this.releaseChannel(voiceId);
  }

  // semiOffset in semitones, range ±48 (MPE default bend range)
  pitchBend(voiceId, semiOffset, range = 48) {
    const ch = this.channelForVoice.get(voiceId);
    if (ch === undefined) return;
    const norm = clamp(semiOffset / range, -1, 1);
    const value = clamp(Math.round(8192 + norm * 8191), 0, 16383);
    this._send([0xE0 | ch, value & 0x7f, (value >> 7) & 0x7f]);
  }

  pressure(voiceId, p) {
    const ch = this.channelForVoice.get(voiceId);
    if (ch === undefined) return;
    this._send([0xD0 | ch, clamp(Math.round(p * 127), 0, 127)]);
  }

  timbre(voiceId, t) {
    const ch = this.channelForVoice.get(voiceId);
    if (ch === undefined) return;
    this._send([0xB0 | ch, 74, clamp(Math.round(t * 127), 0, 127)]);
  }

  allNotesOff() {
    for (let ch = 0; ch < 16; ch++) this._send([0xB0 | ch, 123, 0]);
    this.channelForVoice.clear();
  }
}

// MPE wants one note-off per channel; a panic helper is worth having on a
// gesture instrument because a lost hand can otherwise strand a channel.
export function panic(mpe) {
  if (!mpe || !mpe.output) return;
  mpe.allNotesOff();
}
