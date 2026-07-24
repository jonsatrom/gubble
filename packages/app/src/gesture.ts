// Path sampling for continuous gestures (§4.1's coalescing rule: "log
// as one op with a sampled path, max ~20Hz, or the log bloats and
// playback jitters"). One sampler instance per gesture — begin() on
// pointerdown, sample() on every pointermove (self-throttling), finish()
// on pointerup to get the op-ready array.
//
// Why this exists as its own module and not inline in main.ts: it's
// pure timing/array logic with zero DOM and zero @gubble/core coupling
// — the first small cut of the decomposition the app README already
// admits main.ts owes (document/history vs. performances vs. gestures
// vs. arrivals vs. inspectors). One file, one concept, not a refactor.

import type { GestureSample } from "@gubble/core";

export class GestureSampler {
  private readonly hz: number;
  private readonly minIntervalMs: number;
  private startedAt = 0;
  private lastSampledAt = -Infinity;
  private path: GestureSample[] = [];

  constructor(hz = 20) {
    this.hz = hz;
    this.minIntervalMs = 1000 / hz;
  }

  begin(x: number, y: number): void {
    this.startedAt = performance.now();
    this.lastSampledAt = -Infinity;
    this.path = [];
    this.sample(x, y); // the gesture's first moment is always kept, even for a tap shorter than one throttle window
  }

  sample(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastSampledAt < this.minIntervalMs) return;
    this.lastSampledAt = now;
    this.path.push({ x, y, t: Math.round(now - this.startedAt) });
  }

  /** Always appends a final sample (even mid-throttle-window) so a gesture's last position is never lost to timing. */
  finish(x: number, y: number): GestureSample[] {
    this.path.push({ x, y, t: Math.round(performance.now() - this.startedAt) });
    return this.path;
  }
}
