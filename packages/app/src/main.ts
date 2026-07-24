// The instrument (M2). One buffer, one document, one puck.
//
// Preview honesty is the load-bearing trick here: the live preview
// fills with the seed the NEXT op would get — deriveSeed(docSeed,
// ops.length) — so what you see while dragging is BYTE-IDENTICAL to
// what STAMP commits. The preview isn't a sketch of the mark; it is
// the mark, pending. (No other honest arrangement exists: a preview
// that lies about its seed is a UI making promises the log won't keep.)

import {
  createDocument,
  appendOp,
  truncate,
  forkDocument,
  replayFull,
  deriveSeed,
  kitFill,
  fenceKitFill,
  boostKit,
  NEUTRAL_EFFECTS,
  encodeDuctusUrl,
  decodeDuctusUrl,
  encodeKitUrl,
  decodeKitUrl,
  encodeDocUrl,
  decodeDocUrl,
  type GubbleDoc,
  type Kit,
  type Corners,
  type Ductus,
  type CellBuffer,
  type SectionState,
  weightedPick,
  deriveUnit,
} from "@gubble/core";

// The seed library, imported straight from the repo's aesthetics/
// folders — the studio and the instrument share one substrate.
import { renderFlow, ensureFonts, type FlowRegime, type FlowCursor } from "./flow.js";
import { GestureSampler } from "./gesture.js";
import { bilinearWeights } from "@gubble/core";

import gradientBlocks from "../../../aesthetics/gradient-blocks/ductus.json";
import myspaceSwirl from "../../../aesthetics/myspace-swirl/ductus.json";
import cultcow from "../../../aesthetics/cultcow/ductus.json";

// Mutable on purpose: aesthetics arriving as ?a= URLs dock here as
// guests — the rail grows by link, no registry, no gate (Directive 5).
const LIBRARY: Ductus[] = [gradientBlocks, myspaceSwirl, cultcow] as unknown as Ductus[];

// Every URL this app mints points at ITSELF — localhost tonight, the
// deploy origin the day one exists. A shared link that opens is the
// promise; gubble.example was a placeholder wearing its grammar.
const ORIGIN = location.origin;

// Each chip's aesthetic-as-URL, precomputed so drag-out can carry it.
const chipUrl = new Map<string, string>();
for (const d of LIBRARY) void encodeDuctusUrl(d, ORIGIN).then((u) => chipUrl.set(d.id, u));

// ── state ──────────────────────────────────────────────────────────────
const COLS = 96;
const ROWS = 40;

let doc: GubbleDoc = createDocument({ cols: COLS, rows: ROWS });
const kit: Kit = {
  corners: [LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2] ?? null, null] as Corners,
  puck: { x: 0.5, y: 0.5 },
  effects: { ...NEUTRAL_EFFECTS },
};
let frame = 0;
let strataView = false;

// ── FLOW state (M3) ────────────────────────────────────────────────────
let view: "grid" | "flow" = "grid";
let regime: FlowRegime = "vw";
let fontPx = 15;
let flowCursor: FlowCursor | null = null;

// ── selection state (M4) ───────────────────────────────────────────────
// The app mirrors what the log's replay state will hold — the LOGGED
// select op (one per completed gesture, per §4.1's coalescing rule) is
// the truth; this is just the live-drag preview of it.
let selAnchor: number | null = null; // cell index where the drag started
let selHead: number | null = null; // cell index under the pointer now
let selecting = false;

// ── arrival state (M5): documents that came here by URL ───────────────
// If this document arrived as a #g= fragment, the first committed touch
// FORKS it — lineage stamped with the parent's URL and the divergence
// point — because appending to someone else's history without saying so
// is exactly the provenance-laundering this project exists to refuse.
// Until that touch, you're a reader; the touch makes you a maker.
let arrivedFrom: string | null = null;
let arrivedFrozen = false;

/**
 * The ONLY way ops enter the log from this app. The wrapper is where
 * arrival becomes fork (once, at first touch) — raw appendOp calls
 * would let ambient state skip the lineage moment.
 */
function logOp(op: Parameters<typeof appendOp>[1]): void {
  if (arrivedFrom) {
    doc = forkDocument(doc, doc.ops.length, arrivedFrom);
    arrivedFrom = null;
  }
  arrivedFrozen = false; // performing unfreezes; a frozen arrival stays frozen only while merely viewed
  appendOp(doc, op);
}

// ── controller state (M4b) ─────────────────────────────────────────────
// A slider mid-drag is ephemeral performance; its RELEASE is history
// (one moveController op, §4.1 coalescing). The live preview fills with
// the seed the release op WILL get — preview honesty, third outing.
let liveMove: { id: string; value: number } | null = null;
const hiddenControllers = new Set<string>(); // local dismissals; the log forgets nothing
let lastSections: SectionState[] = [];
let controllersSig = "";

// Corner-swap crossfade (§10): swaps are performable moves, not menu
// operations. When a corner changes, the page dissolves toward the new
// material over ~2s — per-cell, seeded (WHICH cells flip early is
// deterministic; performance.now() only paces the sweep, same rule as
// op.t). The kit's truth is the DESTINATION from the moment of the
// drop: a STAMP mid-crossfade commits where you're going, not where
// you've theatrically been.
interface CornerSwap {
  k: number;
  from: Ductus | null;
  start: number;
}
let cornerSwap: CornerSwap | null = null;
const SWAP_MS = 2000;

// ── DOM ────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const canvas = $<HTMLCanvasElement>("#grid");
const ctx = canvas.getContext("2d")!;
const mirror = $<HTMLPreElement>("#mirror");
const pad = $("#pad");
const puckEl = $("#puck");
const readout = $("#readout");

// Cell metrics: measure the actual monospace advance once.
const FONT_PX = 14;
const FONT = `${FONT_PX}px ui-monospace, "SF Mono", Menlo, monospace`;
ctx.font = FONT;
const CELL_W = Math.ceil(ctx.measureText("█").width);
const CELL_H = Math.round(FONT_PX * 1.25);
const dpr = window.devicePixelRatio || 1;
canvas.width = COLS * CELL_W * dpr;
canvas.height = ROWS * CELL_H * dpr;
canvas.style.width = `${COLS * CELL_W}px`;
canvas.style.height = `${ROWS * CELL_H}px`;
ctx.scale(dpr, dpr);

// Provenance → color: a cell speaks in the swatch of whoever inked it.
// Aesthetics without swatches speak in gallery white.
const swatchOf = new Map<string, string>(
  LIBRARY.map((d) => [d.id, d.color.swatches[0] ?? "#d8d8e0"]),
);

// The readout doubles as a message line. flash() borrows it for a
// moment, then gives it back to the facts.
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function flash(message: string): void {
  readout.textContent = message;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    render();
  }, 2200);
}

// ── render ─────────────────────────────────────────────────────────────
// THE GESTURE-SPEED CACHE (soul-audit fix): replay() costs one full
// fill per committed op, and a performance ACCUMULATES ops — without
// this cache, every puck-drag frame re-fought the entire set's history,
// so the instrument got slower the longer you played it. Backwards.
// Now committed history replays only when history actually changes
// (new op, undo, reseed — or per-frame ONLY if some committed op
// carries phase and therefore genuinely breathes). Gestures pay for
// exactly one preview fill, forever, regardless of set length.
let committedKey = "";
let committedBuf: CellBuffer | null = null;

function committedBuffer(): CellBuffer {
  const breathing = doc.ops.some(
    (op) => (((op.args["kit"] as Kit | undefined)?.effects.phase ?? 0) > 0),
  );
  const key = `${doc.header.docSeed}·${doc.ops.length}·${breathing ? frame : "still"}`;
  if (key !== committedKey || !committedBuf) {
    committedKey = key;
    const result = replayFull(doc, { frame });
    committedBuf = result.buffer;
    lastSections = result.sections; // the page's anatomy rides the same replay
  }
  return committedBuf;
}

function currentBuffer(corners: Corners = kit.corners): CellBuffer {
  // Clone the cached history (resized-to-same-size IS a clone — it
  // copies every cell), then lay the pending mark over it with the
  // seed the next op WILL get.
  const buffer = committedBuffer().resized(COLS, ROWS);
  if (corners.some(Boolean)) {
    kitFill(
      buffer,
      { ...kit, corners },
      deriveSeed(doc.header.docSeed, doc.ops.length),
      doc.ops.length,
      { frame },
    );
  }
  // A slider mid-drag: fence-fill its section at the drag value, with
  // the exact seed the release op will get — what you hear while
  // dragging is what the log will remember.
  if (liveMove && liveMove.value > 0) {
    const section = lastSections.find((s) => s.id === liveMove!.id);
    if (section) {
      fenceKitFill(
        buffer,
        boostKit(section.kit, liveMove.value),
        deriveSeed(doc.header.docSeed, doc.ops.length),
        doc.ops.length,
        section.range,
        frame,
      );
    }
  }
  return buffer;
}

// The strata view (§14.1's inspector, first face; ratified in the §19
// strata conversation): tint by op AGE instead of aesthetic. Oldest
// deposits go cold sediment-blue, newest go hot; the pending preview —
// the not-yet-stratum — burns white. A geological survey of the page.
// This exists because the fossil/fog composite is nearly invisible when
// every stratum draws from the same palettes in the same swatches: the
// depth is real but unlabeled. This is the label.
function strataColor(opIndex: number, opCount: number): string {
  if (opIndex >= opCount) return "#ffffff"; // the pending mark: not yet sediment
  if (opCount <= 1) return "#7a9fc9";
  const t = opIndex / (opCount - 1); // 0 = oldest … 1 = newest committed
  const cold = { r: 74, g: 96, b: 138 };
  const hot = { r: 255, g: 157, b: 226 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(cold.r, hot.r)},${mix(cold.g, hot.g)},${mix(cold.b, hot.b)})`;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// ── FLOW rendering (M3) ────────────────────────────────────────────────
const flowCanvas = $<HTMLCanvasElement>("#flow");
const flowCtx = flowCanvas.getContext("2d")!;
const FLOW_W = COLS * CELL_W; // same stage footprint as GRID
const FLOW_H = ROWS * CELL_H;
flowCanvas.width = FLOW_W * dpr;
flowCanvas.height = FLOW_H * dpr;
flowCanvas.style.width = `${FLOW_W}px`;
flowCanvas.style.height = `${FLOW_H}px`;
flowCtx.scale(dpr, dpr);

/** The corner the puck currently leans hardest into — FLOW speaks in its voice. */
function dominantCorner(): Ductus | null {
  const w = bilinearWeights(kit.puck.x, kit.puck.y);
  let best: Ductus | null = null;
  let bestW = -1;
  for (let i = 0; i < 4; i++) {
    const d = kit.corners[i];
    if (d && w[i]! > bestW) {
      bestW = w[i]!;
      best = d;
    }
  }
  return best;
}

function fontStackOf(d: Ductus | null): { stack: string; families: string[] } {
  const hints = d?.flow.fontHints ?? [];
  const families = hints.map((h) => (/\s/.test(h) ? `"${h}"` : h));
  // Detritus deserves a serif fallback, not system-ui blandness.
  families.push("Georgia", "serif");
  return { stack: families.join(", "), families };
}

let flowToken = 0; // stale-render guard: only the latest async render lands
function renderFlowView(text: string): void {
  const token = ++flowToken;
  const dom = dominantCorner();
  const { stack, families } = fontStackOf(dom);
  void ensureFonts(fontPx, families).then(() => {
    if (token !== flowToken) return; // superseded while fonts loaded
    renderFlow(flowCtx, text, {
      regime,
      widthPx: FLOW_W,
      heightPx: FLOW_H,
      fontPx,
      fontStack: stack,
      color: dom?.color.swatches[0] ?? "#d8d8e0",
      cursor: flowCursor,
    });
  });
  // The inverse-lock readout (§6): at physical width, font size and
  // char count are one linked value — render it live so the collision
  // is visible even before print (M5) makes it enforceable.
  $("#v-linked").textContent =
    regime === "physical" ? `≈ ${Math.floor(FLOW_W / (fontPx * 0.6))} chars` : "";
}

function render(): void {
  // During a corner swap, two candidate pages exist — where we were and
  // where we're going — and each cell defects to the new material at its
  // own seeded moment. The dissolve ORDER is deterministic; only the
  // sweep's pacing rides the wall clock.
  let bufferNew = currentBuffer();
  let bufferOld: CellBuffer | null = null;
  let swapT = 1;
  if (cornerSwap) {
    swapT = smoothstep(Math.min(1, (performance.now() - cornerSwap.start) / SWAP_MS));
    if (swapT >= 1) {
      cornerSwap = null;
    } else {
      const oldCorners = [...kit.corners] as Corners;
      oldCorners[cornerSwap.k] = cornerSwap.from;
      bufferOld = currentBuffer(oldCorners);
    }
  }

  ctx.fillStyle = "#0e0e11";
  ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const mirrorLines: string[] = [];

  for (let r = 0; r < ROWS; r++) {
    let line = "";
    let skipNext = false; // set when a wide glyph claims the following cell
    for (let c = 0; c < COLS; c++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      // Pick this cell's source buffer: the new page, unless a swap is
      // mid-dissolve and this cell hasn't defected yet.
      const source =
        bufferOld && cornerSwap && deriveUnit(doc.header.docSeed, r * COLS + c, "swap", cornerSwap.k) >= swapT
          ? bufferOld
          : bufferNew;
      const cell = source.get(r, c);
      if (cell.glyph === "") {
        // Continuation cell in the chosen source whose head we didn't
        // draw (the head defected to the other buffer): render as space
        // rather than resurrecting half a glyph.
        line += " ";
        continue;
      }
      // A wide head claims its neighbor cell FROM THE SAME SOURCE — no
      // orphaned halves, even mid-dissolve.
      if (cell.glyph !== " " && c + 1 < COLS && source.get(r, c + 1).glyph === "") {
        skipNext = true;
      }
      line += cell.glyph;
      if (cell.glyph === " ") continue;
      ctx.fillStyle = strataView
        ? strataColor(cell.provenance?.op ?? 0, doc.ops.length)
        : (cell.provenance && swatchOf.get(cell.provenance.aes)) || "#d8d8e0";
      ctx.fillText(cell.glyph, c * CELL_W, r * CELL_H + 2);
    }
    mirrorLines.push(line.replace(/\s+$/, ""));
  }

  // Selection highlight: reading-order range, text-editor style (§11).
  if (selAnchor !== null && selHead !== null) {
    const lo = Math.min(selAnchor, selHead);
    const hi = Math.max(selAnchor, selHead);
    ctx.fillStyle = "rgba(255, 157, 226, 0.16)";
    for (let idx = lo; idx <= hi; idx++) {
      ctx.fillRect((idx % COLS) * CELL_W, Math.floor(idx / COLS) * CELL_H, CELL_W, CELL_H);
    }
  }

  // The mirror is the copy/export source of truth (§5.1): what you copy
  // is real characters, always — the canvas is just a fast opinion of it.
  mirror.textContent = mirrorLines.join("\n");

  // FLOW performs the same text the mirror holds — one buffer, two
  // performances (§5). GRID drew above; FLOW draws async behind its
  // font gate when it's the active view.
  if (view === "flow") renderFlowView(mirrorLines.join("\n"));

  if (cornerSwap) requestAnimationFrame(render);

  syncControllers();

  if (flashTimer) return; // a message is borrowing the readout; facts resume shortly
  readout.textContent =
    `doc ${doc.header.docSeed.slice(0, 8)}… · ${doc.ops.length} op${doc.ops.length === 1 ? "" : "s"}` +
    (doc.header.lineage ? ` · fork@${doc.header.lineage.at}` : "") +
    (arrivedFrom ? " · arrived (touch to fork)" : "") +
    ` · puck ${kit.puck.x.toFixed(2)},${kit.puck.y.toFixed(2)}` +
    (kit.effects.phase > 0 ? ` · frame ${frame}` : "") +
    ` · ${doc.header.rng} · ${doc.header.measure}`;
}

// ── rail: chips render THEMSELVES as their own label (§10) ────────────
const rail = $("#rail");

function addChip(d: Ductus): void {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.draggable = true;
  // The label is the aesthetic speaking: a deterministic one-liner drawn
  // from its own palette. No plain-text names in the rail's voice.
  let self = "";
  for (let i = 0; i < 22; i++) {
    self += weightedPick(d.palette.glyphs, d.palette.weights, deriveUnit(d.id, "chip", i));
  }
  chip.innerHTML = `<div class="self"></div><div class="id"></div>`;
  (chip.querySelector(".self") as HTMLElement).textContent = self;
  (chip.querySelector(".self") as HTMLElement).style.color = d.color.swatches[0] ?? "#d8d8e0";
  (chip.querySelector(".id") as HTMLElement).textContent = `${d.name} · ${d.id}`;
  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData("text/gubble-aes", d.id);
    // Drag OUT copies the aesthetic-URL (§10): the same drag that feeds
    // a corner, released into any text field, pastes the whole ductus
    // as a link. The chip is simultaneously material and address.
    const url = chipUrl.get(d.id);
    if (url) e.dataTransfer!.setData("text/plain", url);
  });
  chip.addEventListener("dragend", (e) => {
    // Released over nothing at all → the URL goes to the clipboard
    // instead. A drag that went nowhere still went somewhere.
    if (e.dataTransfer!.dropEffect === "none") {
      const url = chipUrl.get(d.id);
      if (url) {
        void navigator.clipboard.writeText(url);
        flash(`${d.name} → clipboard, as a URL. hand it to someone.`);
      }
    }
  });
  rail.appendChild(chip);
}

/** Dock an aesthetic into the library + rail (startup chips and ?a= guests alike). */
function dockAesthetic(d: Ductus): void {
  if (LIBRARY.some((a) => a.id === d.id)) return; // already aboard
  LIBRARY.push(d);
  swatchOf.set(d.id, d.color.swatches[0] ?? "#d8d8e0");
  void encodeDuctusUrl(d, ORIGIN).then((u) => chipUrl.set(d.id, u));
  addChip(d);
}

for (const d of LIBRARY) addChip(d);

// ── XY pad corners: drop targets ───────────────────────────────────────
function refreshCorners(): void {
  for (let k = 0; k < 4; k++) {
    const el = $(`#c${k}`);
    const d = kit.corners[k];
    el.classList.toggle("filled", !!d);
    if (d) {
      let self = "";
      for (let i = 0; i < 12; i++) {
        self += weightedPick(d.palette.glyphs, d.palette.weights, deriveUnit(d.id, "corner", i));
      }
      el.textContent = self;
      el.setAttribute("title", d.name);
      (el as HTMLElement).style.color = d.color.swatches[0] ?? "#d8d8e0";
    } else {
      el.textContent = "∅ drop here";
      (el as HTMLElement).style.color = "";
    }
  }
}
for (let k = 0; k < 4; k++) {
  const el = $(`#c${k}`);
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("over");
    const id = (e as DragEvent).dataTransfer!.getData("text/gubble-aes");
    const d = LIBRARY.find((a) => a.id === id) ?? null;
    if (kit.corners[k] !== d) {
      // The performable move (§10): don't snap — dissolve. State truth
      // is the destination immediately; the theater is preview-only.
      cornerSwap = { k, from: kit.corners[k] ?? null, start: performance.now() };
      kit.corners[k] = d;
      // Hands over choices: the swap itself is a logged gesture now
      // (§4.1's swapCorner, built 2026-07-18), not just whatever fill
      // happens to follow it. Discrete by nature — a drop, not a drag —
      // so no path-sampling needed, unlike the puck.
      logOp({ op: "swapCorner", scope: { kind: "page" }, args: { corner: k, aesId: d?.id ?? null } });
    }
    refreshCorners();
    render();
  });
}

// ── puck ───────────────────────────────────────────────────────────────
// Hands over choices (Jon's ruling, 2026-07-18): the puck's whole drag
// path is sampled and logged as ONE movePuck op on release — not just
// the STAMP moments. See log.ts's movePuck case for why it's inert on
// the buffer today (fill stays self-contained; the path waits for v2
// playback to actually walk it) and gesture.ts for the ≤20Hz throttle.
function placePuck(): void {
  puckEl.style.left = `${kit.puck.x * 100}%`;
  puckEl.style.top = `${kit.puck.y * 100}%`;
}
let dragging = false;
const puckSampler = new GestureSampler();
pad.addEventListener("pointerdown", (e) => {
  dragging = true;
  try {
    pad.setPointerCapture(e.pointerId);
  } catch {
    // synthetic events carry pointer ids the browser never registered —
    // capture is a nicety, not a requirement. Uncaught here, this
    // silently skipped movePuck() and puckSampler.begin() below —
    // found via a synthetic-event test where a gesture's first
    // timestamp came out as raw performance.now() instead of ~0,
    // because begin() never ran to set startedAt. The canvas handler
    // already had this guard; the pad handler had drifted from it.
  }
  movePuck(e);
  puckSampler.begin(kit.puck.x, kit.puck.y);
});
pad.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  movePuck(e);
  puckSampler.sample(kit.puck.x, kit.puck.y);
});
pad.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  const path = puckSampler.finish(kit.puck.x, kit.puck.y);
  // A tap that never moved is still a touch: even a 1-sample path forks
  // an arrived document and enters the biography. Leaning is touching.
  logOp({ op: "movePuck", scope: { kind: "page" }, args: { path } });
  render(); // readout may now show fork@N
});
function movePuck(e: PointerEvent): void {
  arrivedFrozen = false; // leaning IS touching — a frozen arrival wakes under the hand
  const rect = pad.getBoundingClientRect();
  kit.puck.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  kit.puck.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  placePuck();
  render();
}

// ── sliders ────────────────────────────────────────────────────────────
for (const name of ["density", "grain", "phase"] as const) {
  const input = $<HTMLInputElement>(`#fx-${name}`);
  input.addEventListener("input", () => {
    kit.effects[name] = Number(input.value);
    $(`#v-${name}`).textContent = input.value;
    render();
  });
}

// ── the verbs ──────────────────────────────────────────────────────────
$("#stamp").addEventListener("click", () => {
  // Deep-copy the kit into the log: the op owns its snapshot; later
  // puck moves must not haunt committed history.
  logOp({
    op: "fill",
    scope: { kind: "page" },
    args: { kit: JSON.parse(JSON.stringify(kit)) as Kit },
  });
  render();
});

$("#undo").addEventListener("click", () => {
  doc = truncate(doc, Math.max(0, doc.ops.length - 1));
  render();
});

$("#copy").addEventListener("click", () => {
  void navigator.clipboard.writeText(mirror.textContent ?? "");
});

$("#reseed").addEventListener("click", () => {
  doc = createDocument({ cols: COLS, rows: ROWS });
  frame = 0;
  // A fresh document is nobody's fork: disarm the arrival state, or the
  // new page's first op would stamp a lineage it never had.
  arrivedFrom = null;
  arrivedFrozen = false;
  render();
});

$("#strata").addEventListener("click", () => {
  strataView = !strataView;
  $("#strata").classList.toggle("active", strataView);
  render();
});

// ── the kit as URL: share out, load in (§10, §12) ─────────────────────
$("#sharekit").addEventListener("click", () => {
  void encodeKitUrl(kit, ORIGIN).then((url) => {
    void navigator.clipboard.writeText(url);
    flash("kit → clipboard. the URL is the patch file.");
  });
});

// ── the DOCUMENT as URL (§12): the performance is the recording ───────
function docIsBreathing(): boolean {
  return doc.ops.some((op) => (((op.args["kit"] as Kit | undefined)?.effects.phase ?? 0) > 0));
}

$("#sharedoc").addEventListener("click", () => {
  void encodeDocUrl(doc, docIsBreathing() ? { origin: ORIGIN, frame } : { origin: ORIGIN }).then((url) => {
    void navigator.clipboard.writeText(url);
    flash(`performance → clipboard (${doc.ops.length} ops, ${url.length} chars). replayable by strangers.`);
  });
});

// ── FREEZE (§12): both a print path and a keep-this-flutter-frame ─────
// gesture. The pending preview isn't logged, so freezing means
// COMMITTING the moment first — keeping is stamping. Then: the exact
// moment's URL (frame included if anything breathes) to the clipboard,
// the mirror's characters onto the printsheet, and the browser's own
// print dialog does the rest. On paper, gubble is just its characters.
$("#freeze").addEventListener("click", () => {
  if (kit.corners.some(Boolean)) {
    logOp({
      op: "fill",
      scope: { kind: "page" },
      args: { kit: JSON.parse(JSON.stringify(kit)) as Kit },
    });
    render();
  }
  void encodeDocUrl(doc, docIsBreathing() ? { origin: ORIGIN, frame, mode: "view" } : { origin: ORIGIN, mode: "view" }).then((url) => {
    void navigator.clipboard.writeText(url);
    $("#printsheet").textContent = mirror.textContent;
    flash("moment stamped · URL on clipboard · print dialog yours");
    window.print();
  });
});

// ── URL arrival (§12): boot AND hashchange ────────────────────────────
// A #g= fragment means someone handed this browser a whole performance.
// Load it, honor at (stop at that op), honor f (freeze the shimmer at
// that exact frame; view mode holds the flutter still until touched).
// The FORK doesn't happen here — it happens at your first committed
// touch, in logOp(): arrival makes you a reader, the touch makes you a
// maker, and the lineage stamp records exactly where you diverged.
// hashchange matters because same-origin fragment navigation never
// reloads the page: a URL pasted into a RUNNING instrument must load
// too, or the sovereignty story has a hole in it.
function loadFromHash(): void {
  if (!/[#?&]g=/.test(location.hash)) return;
  void decodeDocUrl<GubbleDoc>(location.href)
    .then((decoded) => {
      doc = decoded.doc;
      if (decoded.at !== null) doc = truncate(doc, decoded.at);
      if (decoded.frame !== null) frame = decoded.frame;
      arrivedFrozen = decoded.mode === "view" && decoded.frame !== null;
      arrivedFrom = location.href; // the parent's address, held until first touch forks
      kit.corners = [null, null, null, null]; // arrive as a reader: no pending mark over someone else's page
      refreshCorners();
      render();
      flash(`performance loaded — ${doc.ops.length} ops replayed from the URL alone. touch it and it forks.`);
    })
    .catch(() => flash("that #g= didn't decode. broken link is broken — the artifact survives in your address bar."));
}
window.addEventListener("hashchange", loadFromHash);
loadFromHash();

function syncControlsToKit(): void {
  for (const name of ["density", "grain", "phase"] as const) {
    const input = $<HTMLInputElement>(`#fx-${name}`);
    input.value = String(kit.effects[name]);
    $(`#v-${name}`).textContent = String(kit.effects[name]);
  }
  placePuck();
  refreshCorners();
}

$("#load").addEventListener("click", () => {
  const raw = $<HTMLInputElement>("#loadurl").value.trim();
  if (!raw) return;
  if (/[#?&]k=/.test(raw)) {
    void decodeKitUrl(raw)
      .then((loaded) => {
        // The whole patch arrives: corners (inline ductuses — dock any
        // strangers in the rail as guests), puck, effects.
        for (const d of loaded.corners) if (d) dockAesthetic(d);
        kit.corners = loaded.corners.map(
          (d): Ductus | null => (d ? (LIBRARY.find((a) => a.id === d.id) ?? d) : null),
        ) as Corners;
        kit.puck = loaded.puck;
        kit.effects = loaded.effects;
        syncControlsToKit();
        render();
        flash("kit loaded — someone else's lean, your page now.");
      })
      .catch(() => flash("that ?k= didn't decode. broken link is broken."));
  } else if (/[#?&]a=/.test(raw)) {
    void decodeDuctusUrl<Ductus>(raw)
      .then((d) => {
        dockAesthetic(d);
        flash(`${d.name} docked in the rail — an aesthetic, hand-delivered by URL.`);
      })
      .catch(() => flash("that ?a= didn't decode. broken link is broken."));
  } else {
    flash("no ?k= or ?a= in that — nothing to load.");
  }
});

// ── GRID/FLOW toggle + definition controls (M3) ───────────────────────
function setView(next: "grid" | "flow"): void {
  view = next;
  canvas.style.display = next === "grid" ? "" : "none";
  flowCanvas.style.display = next === "flow" ? "" : "none";
  $("#view-grid").classList.toggle("active", next === "grid");
  $("#view-flow").classList.toggle("active", next === "flow");
  $("#flow-controls").style.display = next === "flow" ? "" : "none";
  $("#flow-size").style.display = next === "flow" ? "" : "none";
  render();
}
$("#view-grid").addEventListener("click", () => setView("grid"));
$("#view-flow").addEventListener("click", () => setView("flow"));

for (const r of ["vw", "chars", "physical"] as const) {
  $(`#rg-${r === "physical" ? "physical" : r}`).addEventListener("click", () => {
    regime = r;
    for (const other of ["vw", "chars", "physical"]) {
      $(`#rg-${other}`).classList.toggle("active", other === r);
    }
    render();
  });
}

$<HTMLInputElement>("#fontpx").addEventListener("input", () => {
  fontPx = Number($<HTMLInputElement>("#fontpx").value);
  $("#v-fontpx").textContent = `${fontPx}px`;
  render();
});

// The cursor displacer (§5.2): ephemeral, never logged. Text reflows
// around the pointer while it's over the FLOW canvas; leaves no trace.
flowCanvas.addEventListener("pointermove", (e) => {
  const rect = flowCanvas.getBoundingClientRect();
  flowCursor = { x: e.clientX - rect.left, y: e.clientY - rect.top, r: 48 };
  render();
});
flowCanvas.addEventListener("pointerleave", () => {
  flowCursor = null;
  render();
});

// ── drag-select on GRID (M4, "like a text editor DUH") ────────────────
function cellAt(e: PointerEvent): number {
  const rect = canvas.getBoundingClientRect();
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - rect.left) / CELL_W)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((e.clientY - rect.top) / CELL_H)));
  return r * COLS + c;
}

canvas.addEventListener("pointerdown", (e) => {
  selecting = true;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic events carry pointer ids the browser never registered —
    // capture is a nicety, not a requirement
  }
  selAnchor = selHead = cellAt(e);
  render();
});
canvas.addEventListener("pointermove", (e) => {
  if (!selecting) return;
  selHead = cellAt(e);
  render();
});
canvas.addEventListener("pointerup", (e) => {
  if (!selecting) return;
  selecting = false;
  selHead = cellAt(e);
  if (selAnchor === selHead) {
    // A click is a clearSelect — same as any text editor.
    if (doc.ops.some((op) => op.op === "select")) {
      logOp({ op: "clearSelect", scope: { kind: "selection" }, args: {} });
    }
    selAnchor = selHead = null;
    $("#verbs").style.display = "none";
  } else {
    // One logged op per completed gesture (§4.1 coalescing) — the drag
    // itself was ephemeral preview; the release is history.
    logOp({
      op: "select",
      scope: { kind: "selection" },
      args: { range: { from: selAnchor!, to: selHead } },
    });
    $("#verbs").style.display = "";
  }
  render();
});

for (const verb of ["redact", "mistranscode", "invert", "posterize", "fillWith"] as const) {
  $(`#vb-${verb}`).addEventListener("click", () => {
    logOp({
      op: "applyOnce",
      scope: { kind: "selection" },
      args:
        verb === "fillWith"
          ? { verb, kit: JSON.parse(JSON.stringify(kit)) as Kit }
          : { verb },
    });
    render();
  });
}

// ── spawn a controller (M4b): the mixer materializes ON the selection ──
$("#vb-spawn").addEventListener("click", () => {
  if (selAnchor === null || selHead === null) return;
  logOp({
    op: "spawnController",
    scope: { kind: "selection" },
    args: {
      range: { from: Math.min(selAnchor, selHead), to: Math.max(selAnchor, selHead) },
      kit: JSON.parse(JSON.stringify(kit)) as Kit,
    },
  });
  render(); // the controller appears under the hand, playable immediately
});

// ── controller overlays: instruments pinned to the page's anatomy ─────
const controllersLayer = $("#controllers");

function syncControllers(): void {
  controllersLayer.style.display = view === "grid" ? "" : "none";
  const visible = lastSections.filter((s) => !hiddenControllers.has(s.id));

  // Rebuild the DOM only when the anatomy changes; reposition always.
  const sig = visible.map((s) => `${s.id}:${s.persisted}`).join("|");
  if (sig !== controllersSig) {
    controllersSig = sig;
    controllersLayer.innerHTML = "";
    for (const section of visible) {
      const el = document.createElement("div");
      el.className = "controller";
      el.dataset["id"] = section.id;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "1";
      slider.step = "0.01";
      slider.value = String(section.value);
      slider.title = "intensity — the drag is preview, the release is history";
      // One axis, so the shared 2-D sampler carries value on x and
      // leaves y at 0 — same throttle, same GestureSample shape as the
      // puck, rather than inventing a second recording mechanism for
      // what's really the same idea (a hand, moving, over time).
      const moveSampler = new GestureSampler();
      let moveStarted = false;
      slider.addEventListener("pointerdown", () => {
        moveStarted = true;
        moveSampler.begin(Number(slider.value), 0);
      });
      slider.addEventListener("input", () => {
        liveMove = { id: section.id, value: Number(slider.value) };
        if (moveStarted) moveSampler.sample(Number(slider.value), 0);
        render();
      });
      slider.addEventListener("change", () => {
        liveMove = null;
        const path = moveStarted ? moveSampler.finish(Number(slider.value), 0) : undefined;
        moveStarted = false;
        logOp({
          op: "moveController",
          scope: { kind: "selection" },
          args: { id: section.id, value: Number(slider.value), ...(path ? { path } : {}) },
        });
        render();
      });

      const mkBtn = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
        const b = document.createElement("button");
        b.className = "cbtn";
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", onClick);
        return b;
      };

      el.append(
        mkBtn("×", "dismiss this handle (the log forgets nothing; you just stop seeing it)", () => {
          hiddenControllers.add(section.id);
          syncControllers();
        }),
        slider,
        mkBtn("⧉", "adopt the pad's current corners — the mini-XY expansion (§11)", () => {
          logOp({
            op: "moveController",
            scope: { kind: "selection" },
            args: {
              id: section.id,
              value: Number(slider.value),
              kit: JSON.parse(JSON.stringify(kit)) as Kit,
            },
          });
          render();
        }),
        mkBtn("◆", "persist: this selection-with-a-controller becomes a SECTION (§11)", () => {
          logOp({ op: "persistSection", scope: { kind: "selection" }, args: { id: section.id } });
          render();
        }),
      );
      controllersLayer.appendChild(el);
    }
  }

  // Position pass: pin each controller to its range's right flank.
  const stageEl = $("#stage");
  const stageRect = stageEl.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  let stackOffset = 0;
  for (const el of controllersLayer.children as HTMLCollectionOf<HTMLElement>) {
    const section = visible.find((s) => s.id === el.dataset["id"]);
    if (!section) continue;
    el.classList.toggle("persisted", section.persisted);
    const rowLo = Math.floor(Math.min(section.range.from, section.range.to) / COLS);
    const rowHi = Math.floor(Math.max(section.range.from, section.range.to) / COLS);
    const top = canvasRect.top - stageRect.top + stageEl.scrollTop + rowLo * CELL_H;
    const height = Math.max(88, (rowHi - rowLo + 1) * CELL_H);
    el.style.top = `${top}px`;
    // Pinned at the selection's END CELL — where the gesture finished,
    // the controller appears. Under the hand, literally (§11). The
    // instrument sits ON the material it plays.
    const endCol = Math.max(section.range.from, section.range.to) % COLS;
    el.style.left = `${canvasRect.left - stageRect.left + stageEl.scrollLeft + Math.min(endCol * CELL_W, COLS * CELL_W - 34) + stackOffset}px`;
    el.style.height = `${height}px`;
    stackOffset += 34; // neighbors shelve sideways instead of stacking blind
  }
}

// ── PHASE: the flutter loop ────────────────────────────────────────────
// Time enters as an integer frame counter, never a clock (§4.3). ~10fps
// is a breath, not a strobe; when phase is 0 the counter doesn't even
// advance — a still page costs nothing.
setInterval(() => {
  if (arrivedFrozen) return; // a ?f=&mode=view arrival stays mid-shimmer until touched
  const phaseActive =
    kit.effects.phase > 0 ||
    doc.ops.some((op) => ((op.args["kit"] as Kit | undefined)?.effects.phase ?? 0) > 0);
  if (phaseActive) {
    frame++;
    render();
  }
}, 100);

// ── go ─────────────────────────────────────────────────────────────────
refreshCorners();
placePuck();
render();

// A live getter, not a snapshot (doc is reassigned on fork/reseed/load)
// — devtools inspection of the actual document, on-brand for a tool
// that treats provenance as visible material rather than a black box.
(window as unknown as { gubble: { doc: () => GubbleDoc } }).gubble = { doc: () => doc };
