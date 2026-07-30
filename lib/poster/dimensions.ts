import type { Canvas } from "./types";

/**
 * CSS defines an inch as exactly 96px. That identity is load-bearing: render.tsx
 * sizes the page as `widthIn * 96` px and the PDF export asks Puppeteer for
 * `${widthIn}in`, so the two agree by definition with no scaling fudge factor.
 */
export const CSS_PX_PER_INCH = 96;

export const PT_PER_INCH = 72;

export interface RegionIn {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

/** Fractional rect in 0..1 canvas units, the coordinate space blocks live in. */
export interface RegionFraction {
  x: number;
  y: number;
  w: number;
  h: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * The physical sheet. Equal to the media size — there is no bleed, because the
 * TC-21 has no borderless mode and we never trim.
 */
export function pageDimensionsIn(canvas: Canvas) {
  return { widthIn: canvas.widthIn, heightIn: canvas.heightIn };
}

/** The region the printer can actually put ink in (inset by the 5 mm border). */
export function printableRegionIn(canvas: Canvas): RegionIn {
  const i = canvas.printableInsetIn;
  return {
    xIn: i,
    yIn: i,
    widthIn: Math.max(0, canvas.widthIn - 2 * i),
    heightIn: Math.max(0, canvas.heightIn - 2 * i),
  };
}

/** Printable area minus the design margin. Where content is supposed to live. */
export function designRegionIn(canvas: Canvas): RegionIn {
  const i = canvas.printableInsetIn + canvas.marginIn;
  return {
    xIn: i,
    yIn: i,
    widthIn: Math.max(0, canvas.widthIn - 2 * i),
    heightIn: Math.max(0, canvas.heightIn - 2 * i),
  };
}

function toFraction(canvas: Canvas, r: RegionIn): RegionFraction {
  const x = r.xIn / canvas.widthIn;
  const y = r.yIn / canvas.heightIn;
  const w = r.widthIn / canvas.widthIn;
  const h = r.heightIn / canvas.heightIn;
  return { x, y, w, h, xMin: x, yMin: y, xMax: x + w, yMax: y + h };
}

export function printableRegion(canvas: Canvas): RegionFraction {
  return toFraction(canvas, printableRegionIn(canvas));
}

/**
 * The region the planner is told to keep content inside, in 0..1 units.
 * Replaces the old safeRegion(), which was measured from a trim box that no
 * longer exists.
 */
export function designRegion(canvas: Canvas): RegionFraction {
  return toFraction(canvas, designRegionIn(canvas));
}

/** Viewport for the headless-Chrome PDF pass. */
export function exportViewport(canvas: Canvas) {
  const { widthIn, heightIn } = pageDimensionsIn(canvas);
  return {
    width: Math.round(widthIn * CSS_PX_PER_INCH),
    height: Math.round(heightIn * CSS_PX_PER_INCH),
    deviceScaleFactor: canvas.dpi / CSS_PX_PER_INCH,
  };
}

export function ptToCssPx(pt: number) {
  return (pt * CSS_PX_PER_INCH) / PT_PER_INCH;
}

/**
 * Real print resolution of an image once it is scaled to its block.
 *
 * This is the number that decides whether art looks crisp or mushy, and it was
 * dead code until now.
 */
export function effectiveDpi(assetPxOnLongerEdge: number, blockInchesOnLongerEdge: number) {
  if (blockInchesOnLongerEdge <= 0) return Infinity;
  return assetPxOnLongerEdge / blockInchesOnLongerEdge;
}

/**
 * Thresholds for the resolution warning. Posters are viewed from a metre away,
 * so these sit far below the 300 DPI you'd demand of a held page — but under
 * ~100 DPI softness is visible even at poster distance.
 */
export const DPI_GOOD = 150;
export const DPI_ACCEPTABLE = 100;

export type DpiVerdict = "good" | "acceptable" | "low";

export function dpiVerdict(dpi: number): DpiVerdict {
  if (dpi >= DPI_GOOD) return "good";
  if (dpi >= DPI_ACCEPTABLE) return "acceptable";
  return "low";
}

/** Effective DPI of an image block, given the asset's true pixel dimensions. */
export function blockEffectiveDpi(args: {
  canvas: Canvas;
  assetWidthPx: number;
  assetHeightPx: number;
  blockW: number;
  blockH: number;
}) {
  const { canvas, assetWidthPx, assetHeightPx, blockW, blockH } = args;
  const blockWIn = blockW * canvas.widthIn;
  const blockHIn = blockH * canvas.heightIn;
  // Report the worse of the two axes — that's the one you'll notice.
  return Math.min(
    effectiveDpi(assetWidthPx, blockWIn),
    effectiveDpi(assetHeightPx, blockHIn),
  );
}
