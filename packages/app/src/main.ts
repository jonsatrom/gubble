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
  replay,
  deriveSeed,
  kitFill,
  NEUTRAL_EFFECTS,
  encodeDuctusUrl,
  decodeDuctusUrl,
  encodeKitUrl,
  decodeKitUrl,
  type GubbleDoc,
  type Kit,
  type Corners,
  type Ductus,
  type CellBuffer,
  weightedPick,
  deriveUnit,
} from "@gubble/core";

// The seed library, imported straight from the repo's aesthetics/
// folders — the studio and the instrument share one substrate.
import { renderFlow, ensureFonts, type FlowRegime, type FlowCursor } from "./flow.js";
import { bilinearWeights } from "@gubble/core";

import gradientBlocks from "../../../aesthetics/gradient-blocks/ductus.json";
import myspaceSwirl from "../../../aesthetics/myspace-swirl/ductus.json";
import cultcow from "../../../aesthetics/cultcow/ductus.json";

// Mutable on purpose: aesthetics arriving as ?a= URLs dock here as
// guests — the rail grows by link, no registry, no gate (Directive 5).
const LIBRARY: Ductus[] = [gradientBlocks, myspaceSwirl, cultcow] as unknown as Ductus[];

// Each chip's aesthetic-as-URL, precomputed so drag-out can carry it.
const chipUrl = new Map<string, string>();
for (const d of LIBRARY) void encodeDuctusUrl(d).then((u) => chipUrl.set(d.id, u));

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
function currentBuffer(corners: Corners = kit.corners): CellBuffer {
  // Committed history first…
  const buffer = replay(doc, { frame });
  // …then the pending mark, drawn with the seed the next op WILL get.
  if (corners.some(Boolean)) {
    kitFill(
      buffer,
      { ...kit, corners },
      deriveSeed(doc.header.docSeed, doc.ops.length),
      doc.ops.length,
      { frame },
    );
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

  if (flashTimer) return; // a message is borrowing the readout; facts resume shortly
  readout.textContent =
    `doc ${doc.header.docSeed.slice(0, 8)}… · ${doc.ops.length} op${doc.ops.length === 1 ? "" : "s"}` +
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
  void encodeDuctusUrl(d).then((u) => chipUrl.set(d.id, u));
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
    }
    refreshCorners();
    render();
  });
}

// ── puck ───────────────────────────────────────────────────────────────
function placePuck(): void {
  puckEl.style.left = `${kit.puck.x * 100}%`;
  puckEl.style.top = `${kit.puck.y * 100}%`;
}
let dragging = false;
pad.addEventListener("pointerdown", (e) => {
  dragging = true;
  pad.setPointerCapture(e.pointerId);
  movePuck(e);
});
pad.addEventListener("pointermove", (e) => dragging && movePuck(e));
pad.addEventListener("pointerup", () => (dragging = false));
function movePuck(e: PointerEvent): void {
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
  appendOp(doc, {
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
  render();
});

$("#strata").addEventListener("click", () => {
  strataView = !strataView;
  $("#strata").classList.toggle("active", strataView);
  render();
});

// ── the kit as URL: share out, load in (§10, §12) ─────────────────────
$("#sharekit").addEventListener("click", () => {
  void encodeKitUrl(kit).then((url) => {
    void navigator.clipboard.writeText(url);
    flash("kit → clipboard. the URL is the patch file.");
  });
});

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
      appendOp(doc, { op: "clearSelect", scope: { kind: "selection" }, args: {} });
    }
    selAnchor = selHead = null;
    $("#verbs").style.display = "none";
  } else {
    // One logged op per completed gesture (§4.1 coalescing) — the drag
    // itself was ephemeral preview; the release is history.
    appendOp(doc, {
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
    appendOp(doc, {
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

// ── PHASE: the flutter loop ────────────────────────────────────────────
// Time enters as an integer frame counter, never a clock (§4.3). ~10fps
// is a breath, not a strobe; when phase is 0 the counter doesn't even
// advance — a still page costs nothing.
setInterval(() => {
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
