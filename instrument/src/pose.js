// Body pose tracking. All local: vendored wasm + vendored model, no CDN.
//
// Swapping Hands -> Pose is a model path change plus mapping work, not a new
// dependency: same @mediapipe/tasks-vision package, same vendored wasm.
//
// LANDMARK INDEX CONVENTION — MEASURED, NOT ASSUMED.
// See the long note in bodymap.js. Short version: PoseLandmarker labels
// landmarks by SUBJECT ANATOMY, so index 12/14/16 is the subject's own RIGHT
// shoulder/elbow/wrist and appears on the LEFT of an un-mirrored camera
// frame. This is the OPPOSITE of the HandLandmarker's handedness label, which
// assumes a mirrored input and therefore gets inverted on the way in.
//
// Verified with tools/pose-anatomy.mjs against a portrait of a person facing
// the camera: index 11 ("left_shoulder") lands on the image RIGHT.

import { FilesetResolver, PoseLandmarker } from '../vendor/vision_bundle.mjs';

export class PoseTracker {
  constructor() {
    this.landmarker = null;
    this.video = null;
    this.running = false;
    this.videoTime = -1;
    this.delegate = null;
  }

  async init(video) {
    this.video = video;
    const vision = await FilesetResolver.forVisionTasks('./vendor/wasm');

    // GPU delegate when available, CPU as fallback — some macOS GPU paths
    // silently fail inside Chrome and return zero detections forever.
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: './vendor/pose_landmarker_full.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
        });
        this.delegate = delegate;
        break;
      } catch (err) {
        if (delegate === 'CPU') throw err;
      }
    }
    return this.delegate;
  }

  // Returns null when no pose is visible, else
  // { landmarks: [33], worldLandmarks: [33], raw }
  detect(nowMs) {
    if (!this.landmarker || !this.running) return null;
    if (!this.video || this.video.readyState < 2) return null;

    // PoseLandmarker throws if the same timestamp is submitted twice. This
    // tracker keeps its OWN clock, separate from the hand tracker's, because
    // the two models are independent graphs.
    const ts = Math.max(nowMs, this.videoTime + 1);
    if (ts === this.videoTime) return null;
    this.videoTime = ts;

    const t0 = performance.now();
    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, ts);
    } catch (_) {
      return null;
    }
    const dt = performance.now() - t0;
    this.lastDetectMs = dt;
    this.detectSamples = (this.detectSamples || 0) + 1;
    // The first few calls pay wasm/JIT warmup and are not representative of
    // steady-state latency. Skip them so the average means something.
    if (this.detectSamples > 5) {
      this.detectTotalMs = (this.detectTotalMs || 0) + dt;
      this.detectSteadySamples = (this.detectSteadySamples || 0) + 1;
    }

    if (!res || !res.landmarks || res.landmarks.length === 0) return null;

    return {
      landmarks: res.landmarks[0],
      worldLandmarks: (res.worldLandmarks && res.worldLandmarks[0]) || null,
      raw: res,
    };
  }

  close() {
    try { this.landmarker && this.landmarker.close(); } catch (_) { /* already closed */ }
    this.landmarker = null;
  }
}
