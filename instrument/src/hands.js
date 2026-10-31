// Hand tracking. All local: vendored wasm + vendored model, no CDN.
//
// The camera itself lives in camera.js — the hand tracker and the pose
// tracker read the SAME stream, because opening the same UVC device twice
// halves the frame rate for both.

import { FilesetResolver, HandLandmarker } from '../vendor/vision_bundle.mjs';

export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  PINKY_MCP: 17,
};

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.video = null;
    this.running = false;
    this.videoTime = -1;
  }

  async init(video) {
    this.video = video;
    const vision = await FilesetResolver.forVisionTasks('./vendor/wasm');

    // GPU delegate when available, CPU as fallback — some macOS GPU paths
    // silently fail inside Chrome and return zero detections forever.
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: './vendor/hand_landmarker.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.delegate = delegate;
        break;
      } catch (err) {
        if (delegate === 'CPU') throw err;
      }
    }
    return this.delegate;
  }

  // Returns [] or [{ handedness, landmarks, pinch, scale }]
  detect(nowMs) {
    if (!this.landmarker || !this.running) return [];
    if (!this.video || this.video.readyState < 2) return [];

    // HandLandmarker throws if the same timestamp is submitted twice.
    const ts = Math.max(nowMs, this.videoTime + 1);
    if (ts === this.videoTime) return [];
    this.videoTime = ts;

    const t0 = performance.now();
    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, ts);
    } catch (_) {
      return [];
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

    if (!res || !res.landmarks || res.landmarks.length === 0) return [];

    return res.landmarks.map((lm, i) => {
      const label = res.handedness?.[i]?.[0]?.categoryName || 'Unknown';
      const wrist = lm[LANDMARK.WRIST];
      const mid = lm[LANDMARK.MIDDLE_MCP];
      const thumb = lm[LANDMARK.THUMB_TIP];
      const index = lm[LANDMARK.INDEX_TIP];
      const scale = Math.hypot(wrist.x - mid.x, wrist.y - mid.y) || 0.001;
      const pinchRaw = Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale;
      return { handedness: label, landmarks: lm, pinchRaw, scale };
    });
  }

  close() {
    try { this.landmarker && this.landmarker.close(); } catch (_) { /* already closed */ }
    this.landmarker = null;
  }
}

