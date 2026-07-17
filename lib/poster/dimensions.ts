import type { Canvas } from "./types";

export const CSS_PX_PER_INCH = 96;

export function pageDimensionsIn(canvas: Canvas) {
  return {
    widthIn: canvas.widthIn + 2 * canvas.bleedIn,
    heightIn: canvas.heightIn + 2 * canvas.bleedIn,
  };
}

export function pagePixelsAtPrintScale(canvas: Canvas) {
  const { widthIn, heightIn } = pageDimensionsIn(canvas);
  return {
    widthPx: Math.round(widthIn * canvas.dpi),
    heightPx: Math.round(heightIn * canvas.dpi),
  };
}

export function exportViewport(canvas: Canvas) {
  const { widthIn, heightIn } = pageDimensionsIn(canvas);
  return {
    width: Math.round(widthIn * CSS_PX_PER_INCH),
    height: Math.round(heightIn * CSS_PX_PER_INCH),
    deviceScaleFactor: canvas.dpi / CSS_PX_PER_INCH,
  };
}

export function ptToCssPx(pt: number) {
  return (pt * CSS_PX_PER_INCH) / 72;
}

export function effectiveDpi(assetPxOnLongerEdge: number, blockInchesOnLongerEdge: number) {
  if (blockInchesOnLongerEdge <= 0) return Infinity;
  return assetPxOnLongerEdge / blockInchesOnLongerEdge;
}

export function safeRegion(canvas: Canvas) {
  return {
    xMin: canvas.safeAreaIn / canvas.widthIn,
    yMin: canvas.safeAreaIn / canvas.heightIn,
    xMax: 1 - canvas.safeAreaIn / canvas.widthIn,
    yMax: 1 - canvas.safeAreaIn / canvas.heightIn,
  };
}
