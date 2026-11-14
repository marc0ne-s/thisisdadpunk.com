// Body-map self test. PURE — no DOM, no camera.
//
// This exists because the interesting failures in a gesture instrument are
// not crashes, they are mappings that silently do the wrong thing. A body
// map that is inverted still "works": it produces numbers, it makes sound,
// and it looks fine in a screenshot. Only a test that knows what the
// numbers SHOULD be can catch that.
//
// So this module builds synthetic poses where the correct answer is known by
// construction, runs them through the real mapping functions, and asserts.
//
// It runs in Node (tools/bodytest.mjs) and in the browser (?selftest=1).

import {
  bodyGesture, shoulderWidth, bowArmWeight, hipShoulderLean, wristHipDistance,
  bowArmHeight, leftArmHeight, shoulderTwist, POSE, SUBJECT_RIGHT, SUBJECT_LEFT,
} from './bodymap.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Build a synthetic 33-landmark pose.
//
// Convention reminder (measured, see bodymap.js): index 12/14/16 is the
// subject's RIGHT arm, and it appears on the LEFT of an un-mirrored frame.
// So to place the subject's right wrist at a given IMAGE x, we write
// x = 1 - desiredImageX.
//
// opts:
//   bowX     image x of the subject's right wrist (0..1)
//   bowY     image y of the subject's right wrist (0..1)
//   elbowX   image x of the subject's right elbow
//   elbowY   image y of the subject's right elbow
//   leftX    image x of the subject's left wrist
//   leftY    image y of the subject's left wrist
//   lean     extra image-x offset applied to BOTH hips (weight shift)
//   twistZ   extra z on the subject's left shoulder (torso rotation)
//   scale    shoulder half-width in image units
export function syntheticPose(opts = {}) {
  const {
    bowX = 0.5, bowY = 0.5,
    elbowX = 0.42, elbowY = 0.3,
    leftX = 0.6, leftY = 0.45,
    lean = 0, twistZ = 0,
    scale = 0.12,
  } = opts;

  const lm = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const world = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

  const shoulderY = 0.35;
  const hipY = 0.75;

  // Shoulders: subject's LEFT (11) on the image RIGHT, subject's RIGHT (12)
  // on the image LEFT.
  const set = (i, x, y, z = 0) => {
    lm[i] = { x, y, z, visibility: 0.99 };
    world[i] = { x: 1 - x, y, z };
  };

  set(POSE.LEFT_SHOULDER, 1 - (0.5 + scale), shoulderY);
  set(POSE.RIGHT_SHOULDER, 1 - (0.5 - scale), shoulderY);
  set(POSE.LEFT_ELBOW, 1 - 0.58, 0.5);
  set(POSE.RIGHT_ELBOW, 1 - elbowX, elbowY);
  set(POSE.LEFT_WRIST, 1 - leftX, leftY);
  set(POSE.RIGHT_WRIST, 1 - bowX, bowY);
  set(POSE.LEFT_HIP, 1 - (0.56 + lean), hipY);
  set(POSE.RIGHT_HIP, 1 - (0.44 + lean), hipY);
  set(POSE.LEFT_KNEE, 1 - 0.56, 1.0);
  set(POSE.RIGHT_KNEE, 1 - 0.44, 1.0);
  set(POSE.LEFT_ANKLE, 1 - 0.56, 1.25);
  set(POSE.RIGHT_ANKLE, 1 - 0.44, 1.25);

  // Torso twist: the subject's left shoulder swings back in z.
  world[POSE.LEFT_SHOULDER].z = twistZ;
  world[POSE.RIGHT_SHOULDER].z = -twistZ;

  return { lm, world };
}

// The tests.
//
// Each returns { name, pass, detail }. Nothing here needs a camera, a
// browser, or a human. The answer is known by construction.

// Convenience: synthetic pose -> body gesture, in one call.
const gestureOf = ({ lm, world }) => bodyGesture(lm, world);

export function runBodyTests() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

  // ── 1. Subject anatomy, not image side ────────────────────────────────
  // The single most consequential fact in the whole body map. If it is
  // wrong, the bow arm is the wrong arm and the instrument plays
  // backwards.
  {
    const { lm } = syntheticPose({ bowX: 0.2 });
    const w = lm[SUBJECT_RIGHT.WRIST];
    check(
      'subject right wrist index 16 is the one we placed on the image left',
      Math.abs(w.x - (1 - 0.2)) < 1e-9,
      `landmark16.x=${w.x.toFixed(3)} expected ${(1 - 0.2).toFixed(3)}`,
    );
    const l = lm[SUBJECT_LEFT.WRIST];
    check(
      'subject left wrist index 15 is on the image right',
      Math.abs(l.x - (1 - 0.6)) < 1e-9,
      `landmark15.x=${l.x.toFixed(3)} expected ${(1 - 0.6).toFixed(3)}`,
    );
  }

  // ── 2. Pitch follows the bow wrist, and moves the right way ──────────
  {
    const left = gestureOf(syntheticPose({ bowX: 0.30 }));
    const right = gestureOf(syntheticPose({ bowX: 0.70 }));
    check(
      'pitch rises when the bow wrist moves to the image right',
      right.pitchNorm > left.pitchNorm + 0.2,
      `left=${left.pitchNorm.toFixed(3)} right=${right.pitchNorm.toFixed(3)}`,
    );
    check(
      'pitch stays inside 0..1',
      left.pitchNorm >= 0 && left.pitchNorm <= 1 && right.pitchNorm >= 0 && right.pitchNorm <= 1,
      `${left.pitchNorm.toFixed(3)} ${right.pitchNorm.toFixed(3)}`,
    );
  }

  // ── 3. Pressure follows the bow wrist height ─────────────────────────
  {
    const high = gestureOf(syntheticPose({ bowY: 0.20 }));
    const low = gestureOf(syntheticPose({ bowY: 0.80 }));
    check(
      'pressure is higher with the bow wrist raised',
      high.pressureNorm > low.pressureNorm + 0.3,
      `high=${high.pressureNorm.toFixed(3)} low=${low.pressureNorm.toFixed(3)}`,
    );
  }

  // ── 4. Bow arm weight comes from the elbow-wrist gap ────────────────
  {
    const hanging = bowArmWeight(syntheticPose({ elbowY: 0.2, bowY: 0.75 }).lm);
    const level = bowArmWeight(syntheticPose({ elbowY: 0.5, bowY: 0.52 }).lm);
    check(
      'a hanging bow arm weighs more than a level one',
      hanging > level + 0.2,
      `hanging=${hanging.toFixed(3)} level=${level.toFixed(3)}`,
    );
    check(
      'bow arm weight stays inside 0..1',
      hanging >= 0 && hanging <= 1 && level >= 0 && level <= 1,
      `${hanging.toFixed(3)} ${level.toFixed(3)}`,
    );
  }

  // ── 5. Weight shift (hip vs shoulder lean) ──────────────────────────
  {
    const centred = hipShoulderLean(syntheticPose({ lean: 0 }).lm);
    const shifted = hipShoulderLean(syntheticPose({ lean: 0.10 }).lm);
    check(
      'shifting the hips sideways is detected as a lean',
      Math.abs(shifted) > 0.3 && Math.abs(centred) < 0.05,
      `centred=${centred.toFixed(3)} shifted=${shifted.toFixed(3)}`,
    );
    check(
      'lean is signed, not a magnitude',
      hipShoulderLean(syntheticPose({ lean: 0.10 }).lm) * hipShoulderLean(syntheticPose({ lean: -0.10 }).lm) < 0,
      'left and right leans must have opposite signs',
    );
  }

  // ── 6. Torso twist is a 3D quantity and is signed ───────────────────
  {
    const { lm, world } = syntheticPose({ twistZ: 0.15 });
    const twist = shoulderTwist(lm, world);
    const flipped = shoulderTwist(lm, {
      ...world,
      [POSE.LEFT_SHOULDER]: { ...world[POSE.LEFT_SHOULDER], z: -0.15 },
      [POSE.RIGHT_SHOULDER]: { ...world[POSE.RIGHT_SHOULDER], z: 0.15 },
    });
    check(
      'torso twist is detected and signed',
      Math.abs(twist) > 0.2 && twist * flipped < 0,
      `twist=${twist.toFixed(3)} flipped=${flipped.toFixed(3)}`,
    );
  }

  // ── 7. Twist and lean are independent axes ───────────────────────────
  // This is the reason twist is measured in 3D. In image space, turning the
  // torso and shifting the weight both move the shoulders sideways, so a
  // 2D implementation cannot tell a phrase swell from a weight shift.
  {
    const twisted = gestureOf(syntheticPose({ twistZ: 0.15 }));
    const leaned = gestureOf(syntheticPose({ lean: 0.10 }));
    check(
      'twist does not register as lean',
      Math.abs(twisted.lean) < 0.2,
      `twisted.lean=${twisted.lean.toFixed(3)}`,
    );
    check(
      'lean does not register as twist',
      Math.abs(leaned.twist) < 0.2,
      `leaned.twist=${leaned.twist.toFixed(3)}`,
    );
  }

  // ── 8. Reach → space send ───────────────────────────────────────────
  {
    const tucked = wristHipDistance(syntheticPose({ bowX: 0.5, bowY: 0.78 }).lm);
    const extended = wristHipDistance(syntheticPose({ bowX: 0.9, bowY: 0.30 }).lm);
    check(
      'an extended bow arm sends more to space than a tucked one',
      extended > tucked + 0.2,
      `tucked=${tucked.toFixed(3)} extended=${extended.toFixed(3)}`,
    );
  }

  // ── 9. Contact: bow arm at string height ────────────────────────────
  {
    const down = bowArmHeight(syntheticPose({ bowY: 0.85 }).lm);
    const up = bowArmHeight(syntheticPose({ bowY: 0.20 }).lm);
    check(
      'the bow arm up at string height reads as contact, hanging down does not',
      up > 0.6 && down < 0.4,
      `up=${up.toFixed(3)} down=${down.toFixed(3)}`,
    );
  }

  // ── 10. Vibrato comes from the LEFT (fingering) arm ─────────────────
  {
    const low = leftArmHeight(syntheticPose({ leftY: 0.8 }).lm);
    const high = leftArmHeight(syntheticPose({ leftY: 0.2 }).lm);
    check(
      'the left arm drives vibrato, not the bow arm',
      high > low + 0.3,
      `high=${high.toFixed(3)} low=${low.toFixed(3)}`,
    );
  }

  // ── 11. Body scale normalisation ─────────────────────────────────────
  // A player who steps closer to the camera must not change how the
  // instrument plays. Everything is measured in shoulder-widths, so a
  // scaled-up body gives the same numbers.
  {
    const near = syntheticPose({ bowX: 0.4, scale: 0.20 });
    const far = syntheticPose({ bowX: 0.4, scale: 0.10 });
    const a = bodyGesture(near.lm, near.world);
    const b = bodyGesture(far.lm, far.world);
    // The wrist offsets scale with the body, so the resulting gesture
    // should be close even though the raw pixels differ.
    check(
      'gesture is relative to the body, not to the camera',
      Math.abs(a.pitchNorm - b.pitchNorm) < 0.25,
      `near=${a.pitchNorm.toFixed(3)} far=${b.pitchNorm.toFixed(3)}`,
    );
    check(
      'shoulder width is measured, not assumed',
      Math.abs(shoulderWidth(near.lm) - 0.40) < 1e-6,
      `got ${shoulderWidth(near.lm).toFixed(4)} expected 0.4000`,
    );
  }

  // ── 12. Garbage in, no crash, no NaN ─────────────────────────────────
  {
    const empty = bodyGesture(null, null);
    const short = bodyGesture(new Array(10).fill({ x: 0.5, y: 0.5, z: 0 }), null);
    const allZero = bodyGesture(
      new Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 }),
      new Array(33).fill({ x: 0, y: 0, z: 0 }),
    );
    check('a null pose returns null, not a crash', empty === null, String(empty));
    check('a truncated pose returns null', short === null, String(short));
    check(
      'a degenerate all-zero pose returns null rather than NaN',
      allZero === null,
      String(allZero),
    );

    // A real pose must produce only finite numbers. NaN reaching an
    // AudioParam is a silent, ugly failure: the parameter is simply
    // ignored and the voice sits at whatever it was last set to.
    const good = syntheticPose({ bowX: 0.4, bowY: 0.6 });
    const g = bodyGesture(good.lm, good.world);
    const numericFields = ['pitchNorm', 'pressureNorm', 'weight', 'twist', 'lean', 'space', 'contact', 'vibrato', 'scale'];
    const bad = numericFields.filter((k) => !Number.isFinite(g[k]));
    check(
      'a valid pose yields only finite numbers',
      g !== null && bad.length === 0,
      bad.length ? `non-finite: ${bad.join(', ')}` : 'all finite',
    );
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    pass: passed === results.length,
    results,
  };
}
