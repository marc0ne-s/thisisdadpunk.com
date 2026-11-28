// Camera ranking.
//
// On a desktop the browser's default video input is frequently wrong, and the
// wrong one is not obviously wrong: OBS Virtual Camera, an iPhone Desk View, and
// an empty HDMI capture card all enumerate as cameras and all show a rectangle of
// nothing. A first-time visitor does not know to open the dropdown, so pick for
// them — then leave the picker available.
//
// Scoring over device labels. Labels only appear once camera permission has been
// granted, which is why the auto-select runs *after* the first stream opens.

export function scoreCamera(label = '') {
  const l = String(label).toLowerCase();
  let s = 0;

  // Things that look like cameras and show nothing useful.
  if (/obs\s*virtual|virtual\s*camera|virtual\s*desktop|\bndi\b/.test(l)) s -= 100;
  if (/desk\s*view/.test(l)) s -= 90;
  if (/\bcapture\b|\bscreen\b|\bdisplay\b|\bobs\b/.test(l)) s -= 70;

  // Things pointed at a human.
  if (/facetime|built-?in|integrated|internal/.test(l)) s += 100;
  if (/continuity|iphone/.test(l)) s += 60;
  if (/webcam|smartcam|c9\d0|c920|brio|usb.*camera|hd\s*camera/.test(l)) s += 50;
  if (/\bcamera\b/.test(l)) s += 10;

  return s;
}

export function rankCameras(devices) {
  return [...devices].sort((a, b) => scoreCamera(b.label) - scoreCamera(a.label));
}

export function bestCamera(devices) {
  if (!devices || devices.length === 0) return null;
  // With no labels (permission denied) scoring is meaningless; keep the default.
  if (devices.every((d) => !d.label)) return null;
  return rankCameras(devices)[0] || null;
}
