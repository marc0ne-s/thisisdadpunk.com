// Whole-body gesture mapping. SINGLE SOURCE OF TRUTH for the body map.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PHYSICAL MODEL — copied from real bowed-string technique
// ─────────────────────────────────────────────────────────────────────────────
// A bowed string is played with the ARM AND TORSO, not the fingers. On a
// violin or cello:
//   LEFT arm  (fingering hand)  → pitch: it slides along the fingerboard
//   RIGHT arm (bow arm)          → bow pressure + bow speed
//   TORSO rotation               → dynamics / phrase swell
//   WEIGHT SHIFT (hip vs shoulder) → phrasing, global intensity
//
// We copy that. We do not invent a new mapping.
//
// One deliberate deviation, called out by the card: PITCH comes from the
// dominant (bow-side) wrist X, "as now", so the instrument does not change
// character when you switch between hand tracking and body tracking. On a
// literal violin the LEFT hand would carry pitch. Here the RIGHT (bow) arm
// does, because the existing hand mapping already puts pitch on the bow
// hand's X.
//
// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE CONVENTION — MEASURED, NOT ASSUMED
// ─────────────────────────────────────────────────────────────────────────────
// MediaPipe's HandLandmarker documents that its handedness assumes a MIRRORED
// input image. getUserMedia hands us an UN-mirrored frame, so the hand code
// in mapping.js inverts that label on the way in.
//
// PoseLandmarker has no handedness output, so the equivalent question is:
// does index 11 ("left_shoulder") mean the SUBJECT's left shoulder, or the
// left side of the IMAGE?
//
// tools/pose-anatomy.mjs answers it from a portrait of a person facing the
// camera: index 11 lands on the RIGHT of the image and index 12 on the LEFT.
// Pose IS labelled by SUBJECT ANATOMY.
//
// Therefore, in an un-mirrored camera frame:
//   subject's RIGHT arm = 12 (shoulder), 14 (elbow), 16 (wrist)
//   subject's LEFT  arm = 11 (shoulder), 13 (elbow), 15 (wrist)
//   subject's RIGHT hip  = 24,  LEFT hip = 23
//
// The same probe confirmed the face points follow subject anatomy too
// (index 7 "left_ear" sits on the image right).
//
// Note the asymmetry with the hand tracker: for HANDS the LABEL is inverted
// on the way in; for POSE the INDEX already denotes the subject's own side
// and must NOT be flipped. Mixing those two up points the bow arm at the
// player's chest.
//
// ─────────────────────────────────────────────────────────────────────────────
// MIRRORING
// ─────────────────────────────────────────────────────────────────────────────
// Image-space helpers work in MIRRORED space: x = 1 - landmark.x. That
// matches the selfie preview, so moving your body right moves the marker
// right on screen, and it is the same convention as the hand path.
//
// World landmarks (metric, hip-centred) are used UNMIRRORED for torso
// twist: they are a 3D frame, and mirroring them would invert the sign of
// the rotation we are trying to measure.

export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 2,
  RIGHT_EYE_INNER: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUT_LEFT: 9,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

// Subject-anatomy indices. See the COORDINATE CONVENTION block above.
// These are the subject's OWN right side. Do not mirror them.
export const SUBJECT_RIGHT = {
  SHOULDER: POSE.RIGHT_SHOULDER,   // 12
  ELBOW: POSE.RIGHT_ELBOW,         // 14
  WRIST: POSE.RIGHT_WRIST,         // 16
  HIP: POSE.RIGHT_HIP,             // 24
};
export const SUBJECT_LEFT = {
  SHOULDER: POSE.LEFT_SHOULDER,    // 11
  ELBOW: POSE.LEFT_ELBOW,          // 13
  WRIST: POSE.LEFT_WRIST,          // 15
  HIP: POSE.LEFT_HIP,              // 23
};

// Skeleton edges for the on-screen overlay. Paired indices.
export const POSE_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],   // arms
  [11, 23], [12, 24], [23, 24],                      // torso
  [23, 25], [25, 27], [24, 26], [26, 28],            // legs
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ── body scale ────────────────────────────────────────────────────────────
// Every body measurement is normalised by the player's own shoulder width.
// Without this, a player who stands closer to the camera moves the marker
// more for the same physical gesture — the instrument would play differently
// depending on where they stand. Normalising by shoulder width (a stable
// body proportion, robust to arm position) makes a gesture relative to the
// person rather than to the camera.
export function shoulderWidth(lm) {
  const l = lm[POSE.LEFT_SHOULDER];
  const r = lm[POSE.RIGHT_SHOULDER];
  if (!l || !r) return 0;
  return Math.hypot(l.x - r.x, l.y - r.y);
}

// Midpoint of the shoulders, mirrored space.
export function shoulderMid(lm) {
  const l = lm[POSE.LEFT_SHOULDER];
  const r = lm[POSE.RIGHT_SHOULDER];
  if (!l || !r) return null;
  return { x: 1 - (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
}

// Midpoint of the hips, mirrored space.
export function hipMid(lm) {
  const l = lm[POSE.LEFT_HIP];
  const r = lm[POSE.RIGHT_HIP];
  if (!l || !r) return null;
  return { x: 1 - (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
}

// ── the individual gestures ───────────────────────────────────────────────
//
// Each returns a normalised value and takes the landmark array plus the
// player's body scale. Pure functions, so they can be unit-tested without a
// camera — which is exactly how the headless harness checks them.

// SHOULDER TWIST → dynamics / phrase swell.
//
// The rotation of the shoulder LINE about the vertical axis, measured from
// the world landmarks: how far the torso is turned. This is the conductor's
// gesture and the violinist's phrasing engine.
//
// Using world (3D) coordinates matters here. In image space, torso twist and
// side-lean both move the shoulders horizontally, so they would be
// indistinguishable. In 3D they are orthogonal: twist moves the shoulders
// in Z, lean moves them in X.
//
// Signed. Positive = torso turned toward the subject's left.
export function shoulderTwist(lm, world) {
  if (!world) return 0;
  const l = world[POSE.LEFT_SHOULDER];
  const r = world[POSE.RIGHT_SHOULDER];
  if (!l || !r) return 0;
  // World +x points toward the image right (which is the subject's LEFT).
  const dx = l.x - r.x;
  const dz = l.z - r.z;
  if (Math.abs(dx) < 1e-6) return 0;
  // atan2 of the shoulder line in the horizontal (x-z) plane.
  const angle = Math.atan2(dz, dx);
  // ±0.35 rad is a strong deliberate turn of the torso.
  return clamp(angle / 0.35, -1, 1);
}

// HIP ↔ SHOULDER LEAN → global intensity.
//
// How far the hips are displaced sideways relative to the shoulders. This is
// the player's weight shift: stepping into a phrase, leaning off a note.
// Measured in image space, because that is where lateral displacement
// actually shows up.
export function hipShoulderLean(lm) {
  const sh = shoulderMid(lm);
  const hip = hipMid(lm);
  if (!sh || !hip) return 0;
  const scale = shoulderWidth(lm) || 0.001;
  // Lean measured in shoulder-widths, then normalised. ±0.5 shoulder-widths
  // is a pronounced shift.
  const raw = (hip.x - sh.x) / scale;
  return clamp(raw / 0.5, -1, 1);
}

// BOW ARM WEIGHT → bow velocity / brightness.
//
// The vertical gap between the bow elbow and the bow wrist, normalised by
// shoulder width. On a bowed instrument the arm's own gravity sets how much
// bow weight lands on the string, and how much of the arm is hanging is
// that weight.
//
// A fully hanging arm gives roughly 0.7 shoulder-widths of drop; a level
// forearm (bow held out horizontally) gives near zero. Returns 0..1 where 1
// = the arm is hanging at full weight.
export function bowArmWeight(lm) {
  const elbow = lm[SUBJECT_RIGHT.ELBOW];
  const wrist = lm[SUBJECT_RIGHT.WRIST];
  if (!elbow || !wrist) return 0;
  const scale = shoulderWidth(lm) || 0.001;
  const gap = (wrist.y - elbow.y) / scale;
  return clamp(gap / 0.8, 0, 1);
}

// WRIST ↔ HIP DISTANCE → space send.
//
// How far the bow hand reaches away from the body. An arm opened out and
// away from the torso = more reverberant, more open. This mirrors the hand
// mapping's hand-to-hand distance → space.
export function wristHipDistance(lm) {
  const wrist = lm[SUBJECT_RIGHT.WRIST];
  const hip = lm[SUBJECT_RIGHT.HIP];
  if (!wrist || !hip) return 0;
  const scale = shoulderWidth(lm) || 0.001;
  const d = Math.hypot((1 - wrist.x) - (1 - hip.x), wrist.y - hip.y) / scale;
  // 0.7 shoulder-widths = arm at the side; 2.2 = fully extended.
  return clamp((d - 0.7) / 1.5, 0, 1);
}

// BOW CONTACT (pose-only mode) → arm at string height.
//
// On a bowed instrument the bow only speaks when the bow arm is up at the
// string. In a front-on camera view the bow arm's height is visible, so:
// the bow hand at or above the bow shoulder = on the string; the bow hand
// hanging down = the bow is off the string and at rest.
//
// This is the pose-only replacement for the pinch gesture, which needs
// fingers and therefore needs the hand model.
//
// Returns 0..1 where 1 = arm fully up at string height.
export function bowArmHeight(lm) {
  const shoulder = lm[SUBJECT_RIGHT.SHOULDER];
  const wrist = lm[SUBJECT_RIGHT.WRIST];
  if (!shoulder || !wrist) return 0;
  const scale = shoulderWidth(lm) || 0.001;
  // How far the wrist is ABOVE the shoulder, in shoulder-widths. Positive
  // means the bow hand is higher than the shoulder.
  const rise = (shoulder.y - wrist.y) / scale;
  // −0.15 (hand well below the shoulder) → 0, +0.25 (hand clearly above) → 1.
  return clamp((rise + 0.15) / 0.4, 0, 1);
}

// VIBRATO (pose-only mode) → left arm height.
//
// The expression hand's Y drove vibrato depth in the hand mapping. The
// subject's LEFT arm is the fingering arm, so its height plays the same
// role: raising and lowering the left hand vibrato's the string.
export function leftArmHeight(lm) {
  const shoulder = lm[SUBJECT_LEFT.SHOULDER];
  const wrist = lm[SUBJECT_LEFT.WRIST];
  if (!shoulder || !wrist) return 0;
  const scale = shoulderWidth(lm) || 0.001;
  const rise = (shoulder.y - wrist.y) / scale;
  return clamp((rise + 0.15) / 0.4, 0, 1);
}

// ── the combined body gesture ─────────────────────────────────────────────
//
// Everything the body contributes, in one pass, so the caller has a single
// object. Returns null when the pose is not usable.
export function bodyGesture(lm, world) {
  if (!lm || lm.length < 33) return null;
  if (!lm[SUBJECT_RIGHT.WRIST] || !lm[SUBJECT_RIGHT.ELBOW]) return null;
  if (!lm[POSE.LEFT_SHOULDER] || !lm[POSE.RIGHT_SHOULDER]) return null;

  const scale = shoulderWidth(lm);
  if (!scale || scale < 0.02) return null;   // too far away to read

  const wrist = lm[SUBJECT_RIGHT.WRIST];
  const elbow = lm[SUBJECT_RIGHT.ELBOW];
  const sh = shoulderMid(lm);

  // PITCH: dominant (bow-side) wrist X, measured from the shoulder midline
  // in shoulder-widths, so the gesture is relative to the player's body.
  const reach = (1 - wrist.x) - sh.x;
  const pitchNorm = clamp(reach / (scale * 1.8) + 0.5, 0, 1);

  // BOW PRESSURE: dominant wrist Y. Push the wrist DOWN to press harder,
  // the same direction as the hand mapping (push down = press).
  const pressureNorm = clamp(1 - wrist.y, 0, 1);

  return {
    pitchNorm,
    pressureNorm,
    weight: bowArmWeight(lm),
    twist: shoulderTwist(lm, world),
    lean: hipShoulderLean(lm),
    space: wristHipDistance(lm),
    contact: bowArmHeight(lm),
    vibrato: leftArmHeight(lm),
    // Mirrored positions for the overlay.
    wrist: { x: 1 - wrist.x, y: wrist.y },
    elbow: { x: 1 - elbow.x, y: elbow.y },
    scale,
  };
}

// Mirrored landmark set, for drawing the overlay.
export function mirrorLandmarks(lm) {
  return lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

// Visibility gate. MediaPipe reports how confident it is that a landmark is
// visible; a landmark the model is guessing at should not drive the sound.
export function isVisible(p, min = 0.5) {
  return !!p && (p.visibility == null || p.visibility >= min);
}
