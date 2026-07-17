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
import gradientBlocks from "../../../aesthetics/gradient-blocks/ductus.json";
import myspaceSwirl from "../../../aesthetics/myspace-swirl/ductus.json";
import cultcow from "../../../aesthetics/cultcow/ductus.json";

const LIBRARY = [gradientBlocks, myspaceSwirl, cultcow] as unknown as Ductus[];

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

// ── render ─────────────────────────────────────────────────────────────
function currentBuffer(): CellBuffer {
  // Committed history first…
  const buffer = replay(doc, { frame });
  // …then the pending mark, drawn with the seed the next op WILL get.
  if (kit.corners.some(Boolean)) {
    kitFill(buffer, kit, deriveSeed(doc.header.docSeed, doc.ops.length), doc.ops.length, { frame });
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

function render(): void {
  const buffer = currentBuffer();
  ctx.fillStyle = "#0e0e11";
  ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
  ctx.font = FONT;
  ctx.textBaseline = "top";
  for (let r = 0; r < buffer.rows; r++) {
    for (let c = 0; c < buffer.cols; c++) {
      const cell = buffer.get(r, c);
      if (cell.glyph === " " || cell.glyph === "") continue;
      ctx.fillStyle = strataView
        ? strataColor(cell.provenance?.op ?? 0, doc.ops.length)
        : (cell.provenance && swatchOf.get(cell.provenance.aes)) || "#d8d8e0";
      ctx.fillText(cell.glyph, c * CELL_W, r * CELL_H + 2);
    }
  }
  // The mirror is the copy/export source of truth (§5.1): what you copy
  // is real characters, always — the canvas is just a fast opinion of it.
  mirror.textContent = buffer.toText();

  readout.textContent =
    `doc ${doc.header.docSeed.slice(0, 8)}… · ${doc.ops.length} op${doc.ops.length === 1 ? "" : "s"}` +
    ` · puck ${kit.puck.x.toFixed(2)},${kit.puck.y.toFixed(2)}` +
    (kit.effects.phase > 0 ? ` · frame ${frame}` : "") +
    ` · ${doc.header.rng} · ${doc.header.measure}`;
}

// ── rail: chips render THEMSELVES as their own label (§10) ────────────
const rail = $("#rail");
for (const d of LIBRARY) {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.draggable = true;
  // The label is the aesthetic speaking: a deterministic one-liner drawn
  // from its own palette. No plain-text names in the rail's voice.
  let self = "";
  for (let i = 0; i < 22; i++) {
    self += weightedPick(d.palette.glyphs, d.palette.weights, deriveUnit(d.id, "chip", i));
  }
  chip.innerHTML = `<div class="self"></div><div class="id">${d.name} · ${d.id}</div>`;
  (chip.querySelector(".self") as HTMLElement).textContent = self;
  (chip.querySelector(".self") as HTMLElement).style.color = d.color.swatches[0] ?? "#d8d8e0";
  chip.addEventListener("dragstart", (e) => e.dataTransfer!.setData("text/gubble-aes", d.id));
  rail.appendChild(chip);
}

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
    kit.corners[k] = d;
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
