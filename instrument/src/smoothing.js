// Signal smoothing. Shared by the hand tracker and the pose tracker.
//
// One-euro-ish smoothing: plain EMA is enough at 30fps, and it never
// overshoots. A one-euro filter would adapt the cutoff to speed, which is
// nicer, but at 30fps with centimetre-scale jitter the extra machinery buys
// nothing you can hear.

export class Smoother {
  constructor(alpha = 0.35) {
    this.alpha = alpha;
    this.values = new Map();
  }
  push(key, value) {
    const prev = this.values.get(key);
    const next = prev === undefined ? value : prev + (value - prev) * this.alpha;
    this.values.set(key, next);
    return next;
  }
  get(key) { return this.values.get(key); }
  reset() { this.values.clear(); }
}
