// Camera source. Owns the ONE video stream.
//
// Why this is separate: the hand tracker and the pose tracker both need to
// read frames. If each one called getUserMedia independently, the machine
// would open two copies of the same UVC device — which on this box means
// halved frame rate for both and a device that may refuse to open twice.
// So the camera is a single object and both trackers read from it.
//
// The frame counter lives here too, because "has a new video frame arrived"
// is a property of the camera, not of any one model.
//
// Resolution note: the MediaPipe models take 192x192-256x256 internally
// (verified by unpacking the .tflite tensors out of the .task archives), so
// anything above 640x480 is USB bandwidth and decode time thrown away.
// Measured on this machine: the GoPro-over-UGREEN feed manages 7.3fps at
// 1280x720 and 27fps at 640x480. Do not "improve" this to 720p.

import { bestCamera } from './camrank.js';

export class CameraSource {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.running = false;
    this.activeDeviceId = null;
    this.frameSeq = 0;
    this.consumedSeq = -1;
    // Set once the operator picks a camera by hand. Auto-select must never
    // override a deliberate choice.
    this.manualSelection = false;
  }

  // Pick the best available camera by scoring its label.
  //
  // On a desktop the browser's default video input is frequently wrong, and
  // the wrong one is not obviously wrong: OBS Virtual Camera, an iPhone Desk
  // View and an empty HDMI capture card all enumerate as cameras and all
  // show a rectangle of nothing. A first-time visitor does not know to open
  // the dropdown, so pick for them.
  //
  // Labels only appear once camera permission has been granted, which is why
  // this runs AFTER the first stream opens — by then the labels are known.
  // Returns the chosen deviceId, or null when there is nothing to switch to.
  async autoSelect() {
    if (this.manualSelection) return null;
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (_) {
      return null;
    }
    const best = bestCamera(devices.filter((d) => d.kind === 'videoinput'));
    if (!best || !best.deviceId) return null;
    if (best.deviceId === this.activeDeviceId) return null;

    try {
      await this.switchTo(best.deviceId);
      return best.deviceId;
    } catch (err) {
      // A failed switch must not cost the working stream. The current
      // stream keeps running; the operator still has a camera.
      console.warn('[camera] auto-select switch failed, keeping default', err);
      return null;
    }
  }

  async start(deviceId = null) {
    const videoConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
      : {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.running = true;
    this.stream = stream;
    this.activeDeviceId = stream.getVideoTracks()[0]?.getSettings()?.deviceId || null;
    this.attachFrameCounter();
    return stream;
  }

  // rAF runs at 60Hz while the camera delivers 30fps, so a naive per-frame
  // detect() runs inference twice on identical pixels. Counting real video
  // frames halves the GPU cost and gives the player nothing worse.
  attachFrameCounter() {
    this.frameSeq = 0;
    this.consumedSeq = -1;
    const v = this.video;
    if (!('requestVideoFrameCallback' in v)) {
      this.frameSeq = -1; // unsupported: always report a new frame
      return;
    }
    const tick = () => {
      this.frameSeq++;
      v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
  }

  hasNewFrame() {
    if (this.frameSeq === undefined || this.frameSeq < 0) return true;
    return this.frameSeq !== this.consumedSeq;
  }

  consumeFrame() {
    this.consumedSeq = this.frameSeq;
  }

  async switchTo(deviceId) {
    // Acquire the NEW stream BEFORE tearing down the old one.
    //
    // Order matters. The obvious implementation — stop(), then start() —
    // leaves a window where the player has no camera at all, and it destroys
    // the old stream even when the new one fails to open. That turns a
    // recoverable "that camera did not open" into a dead instrument.
    //
    // It also breaks outright when getUserMedia hands back the SAME stream
    // object it gave us before (some virtual camera sources do exactly
    // that): stop() kills the tracks of the stream we are about to reuse,
    // and the video element ends up holding a dead stream that will never
    // deliver another frame.
    const oldStream = this.stream;
    const stream = await this.start(deviceId);
    if (oldStream && oldStream !== stream) {
      oldStream.getTracks().forEach((t) => t.stop());
    }
    return stream;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.running = false;
  }
}
