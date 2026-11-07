// Gesture → parameter mapping. SINGLE SOURCE OF TRUTH.
// One job per axis. If two things want the same axis, one of them is wrong.
//
// Handedness note: MediaPipe's HandLandmarker documents that handedness is
// "determined assuming the input image is mirrored, i.e., taken with a
// front-facing/selfie camera with images flipped horizontally. If it is not
// the case, please swap the handedness output in the application."
// getUserMedia gives us an UN-mirrored frame, so we swap the label.
//
// Everything here is mirrored-image space: x = 1 - landmark.x, so x grows to
// the RIGHT as the operator sees themselves in the preview.

export const ROLES = { BOW: 'bow', STRING: 'string' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── pitch ────────────────────────────────────────────────────────────────
export const ROOT_HZ = 130.81;      // C3
export const ROOT_NOTE = 48;        // C3 in MIDI
export const SPAN_SEMIS = 24;       // two octaves, C3–C5
// Normalized-units/second that counts as a full-speed bow draw. A hand crossing
// the frame in ~0.45s reads as 1.0. Friction and top end follow this, not
// pressure — a stationary bow sticks and nearly silences the string.
export const SPEED_FULL = 2.2;

// Pinch hysteresis on the normalised thumb↔index distance (divided by hand
// scale). MediaPipe pinch is noisy near a single threshold — a Schmitt
// trigger is the difference between a bow and a stutter.
export const PINCH_ON = 0.45;       // close tighter than this => contact
export const PINCH_OFF = 0.62;      // must open past this to release

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi) {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

// Pitch: two octaves, fretless, continuous. No quantiser — the point is glide.
// `glide` blends toward a chromatic snap; 0 = pure fretless, 1 = fully fretted.
export function xToSemis(mirroredX, glide = 0) {
  const semis = clamp(mirroredX, 0, 1) * SPAN_SEMIS;
  return semis * (1 - glide) + Math.round(semis) * glide;
}

export function semisToHz(semis) {
  return ROOT_HZ * Math.pow(2, semis / 12);
}

// Push DOWN to press harder, like pushing a bow onto a string.
export function yToPressure(screenY) {
  return clamp(Math.pow(clamp(1 - screenY, 0, 1), 1.35) * 1.25, 0, 1);
}

// Expression hand: Y = vibrato depth, X = brightness tilt.
export function yToVibrato(screenY) {
  return clamp(1 - screenY, 0, 1) * 0.8;
}

export function xToBrightness(mirroredX) {
  return clamp(mirroredX, 0, 1);
}

// Hand-to-hand distance -> reverb send. Hands close = dry, hands apart = space.
export function distanceToSpace(ax, ay, bx, by) {
  const d = Math.hypot(ax - bx, ay - by);
  return clamp((d - 0.2) * 1.6, 0, 1);
}

// Schmitt trigger on the pinch ratio. Contact sticks at PINCH_ON and only
// releases past PINCH_OFF, so a trembling pinch cannot chatter the bow.
export class PinchGate {
  constructor(on = PINCH_ON, off = PINCH_OFF) {
    this.on = on;
    this.off = off;
    this.state = false;
  }
  update(ratio) {
    if (this.state) {
      if (ratio >= this.off) this.state = false;
    } else if (ratio < this.on) {
      this.state = true;
    }
    return this.state;
  }
}

// Schmitt trigger for a signal where HIGHER means on — the inverse of
// PinchGate. The body map's contact signal is "bow arm at string height",
// which rises to 1 as the arm comes up, so it needs the opposite polarity.
//
// Same reason as the pinch gate: a single threshold on a noisy continuous
// signal chatters, and chatter on a note gate is a stutter.
export class LevelGate {
  constructor(on = 0.62, off = 0.40) {
    this.on = on;
    this.off = off;
    this.state = false;
  }
  update(value) {
    if (this.state) {
      if (value < this.off) this.state = false;
    } else if (value > this.on) {
      this.state = true;
    }
    return this.state;
  }
}

// MIDI helpers. Continuous pitch -> note number + 14-bit bend (MPE style).
export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiNoteFor(hz) {
  return clamp(Math.round(hzToMidi(hz)), 0, 127);
}

// Bend expressed in semitones relative to the note we sent.
export function bendSemitonesFor(hz) {
  const note = midiNoteFor(hz);
  const noteHz = 440 * Math.pow(2, (note - 69) / 12);
  return clamp(hzToMidi(hz) - note, -0.98, 0.98);
}

export { clamp, lerp };
