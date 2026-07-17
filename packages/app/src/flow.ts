// FLOW (§5.2): the second performance of the buffer — proportional,
// live, the one where gubble stops inheriting ANSI-scene assumptions.
// Pretext does the measurement (prepare once, layout per frame); we do
// the routing. Core stays untouched: FLOW is presentation, the buffer
// already knows everything it needs to know.
//
// Regime split (ratified in M3-BRIEF, from Jon's answers):
//   chars/physical → grid-faithful: keep GRID's hard line breaks,
//     re-render them proportionally ({whiteSpace: 'pre-wrap'}).
//     "Faithful to the text" (§6), literally.
//   vw → the stream: hard breaks dropped, whitespace collapsing left ON
//     (that collapse IS the web's violence — vw is "the web one," so it
//     behaves like the web), Pretext free-wraps the whole field as
//     prose it was never meant to be. Re-wrap as deliberate misreading.

import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from "@chenglou/pretext";

export type FlowRegime = "vw" | "chars" | "physical";

export interface FlowCursor {
  /** canvas-space px */
  x: number;
  y: number;
  /** exclusion radius, px */
  r: number;
}

export interface FlowRenderOptions {
  regime: FlowRegime;
  widthPx: number;
  heightPx: number;
  fontPx: number;
  /** CSS font-family stack, already quoted where needed */
  fontStack: string;
  /** ink color for the page (dominant corner's swatch) */
  color: string;
  cursor: FlowCursor | null;
}

// prepare() is the expensive one-time pass; layout is the cheap hot
// path. One-slot cache keyed by everything prepare() depends on — the
// page re-prepares only when the text, font, or regime actually moves.
let cacheKey = "";
let cached: PreparedTextWithSegments | null = null;

function preparedFor(text: string, font: string, regime: FlowRegime): PreparedTextWithSegments {
  const key = `${regime}‖${font}‖${text}`;
  if (key !== cacheKey || !cached) {
    cacheKey = key;
    cached =
      regime === "vw"
        ? prepareWithSegments(text.replace(/\n/g, " "), font) // the stream: breaks dissolve, spaces collapse
        : prepareWithSegments(text, font, { whiteSpace: "pre-wrap" }); // the grid, spoken proportionally
  }
  return cached;
}

/**
 * Best-effort font gate (§5.2's caveat: fonts must be loaded before
 * prepare, or measurement happens against the fallback). System fonts
 * resolve immediately; web fonts get a real await; failures are
 * ignored — a missing Comic Sans falls back audibly, which is honest.
 */
export async function ensureFonts(fontPx: number, families: string[]): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.allSettled(families.map((f) => document.fonts.load(`${fontPx}px ${f}`)));
}

/**
 * Render the buffer's text as FLOW. Manual per-line routing so the
 * cursor can displace: rows inside the cursor's band split into a left
 * and right segment, each routed at its own width — text flows AROUND
 * the pointer in realtime (the §5.2 obstacle, first tenant). The
 * cursor is ephemeral performance surface: never logged, never in the
 * ops, gone when you leave.
 */
export function renderFlow(ctx: CanvasRenderingContext2D, text: string, opts: FlowRenderOptions): void {
  const { widthPx, heightPx, fontPx, cursor } = opts;
  const lineHeight = Math.round(fontPx * 1.35);
  const font = `${fontPx}px ${opts.fontStack}`;
  const prepared = preparedFor(text, font, opts.regime);

  ctx.fillStyle = "#0e0e11";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.fillStyle = opts.color;

  const MIN_SEGMENT = 24; // a shelf narrower than this isn't a shelf, it's a crack
  let routePos: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

  for (let y = 0; y + lineHeight <= heightPx; y += lineHeight) {
    const blocked =
      cursor !== null && y < cursor.y + cursor.r && y + lineHeight > cursor.y - cursor.r;

    if (!blocked) {
      const line = layoutNextLine(prepared, routePos, widthPx);
      if (line === null) return; // text exhausted — the rest of the page is honest air
      ctx.fillText(line.text, 0, y);
      routePos = line.end;
      continue;
    }

    // The displaced row: left shelf, obstacle, right shelf.
    const leftW = Math.max(0, cursor!.x - cursor!.r);
    const rightStart = Math.min(widthPx, cursor!.x + cursor!.r);
    const rightW = Math.max(0, widthPx - rightStart);

    if (leftW >= MIN_SEGMENT) {
      const line = layoutNextLine(prepared, routePos, leftW);
      if (line === null) return;
      ctx.fillText(line.text, 0, y);
      routePos = line.end;
    }
    if (rightW >= MIN_SEGMENT) {
      const line = layoutNextLine(prepared, routePos, rightW);
      if (line === null) return;
      ctx.fillText(line.text, rightStart, y);
      routePos = line.end;
    }
    // Both shelves too narrow → the row belongs to the obstacle. Text
    // waits below. (No text is harmed; it all lands somewhere.)
  }
}
