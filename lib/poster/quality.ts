import { blockEffectiveDpi, designRegion, dpiVerdict, printableRegion } from "./dimensions";
import type { PosterProject } from "./types";

export type WarningSeverity = "error" | "warning" | "info";

export interface QualityWarning {
  id: string;
  severity: WarningSeverity;
  blockId?: string;
  title: string;
  detail: string;
}

/**
 * Static print-readiness checks, run on the stored project.
 *
 * Everything here is cheap and deterministic, so the preview can re-run it on
 * every change. Text overflow is NOT here — it needs real font metrics, so it
 * is measured in the browser (see useOverflowWarnings).
 */
export function analyzeProject(project: PosterProject): QualityWarning[] {
  const { canvas, layout, assets } = project;
  const warnings: QualityWarning[] = [];
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const printable = printableRegion(canvas);
  const design = designRegion(canvas);

  for (const block of layout.blocks) {
    const right = block.x + block.w;
    const bottom = block.y + block.h;

    // Ink outside the printable area will not appear on paper. But a block that
    // deliberately covers the whole sheet — an art poster's artwork, or a
    // background rect — is intentional bleed, not a mistake. Flagging those as
    // errors would mean every art poster opens with a red warning, so they get
    // an informational note about the crop instead.
    const isFullBleed = block.w > 0.95 && block.h > 0.95;

    if (isFullBleed) {
      const lostMm = (canvas.printableInsetIn * 25.4).toFixed(1);
      warnings.push({
        id: `bleed-${block.id}`,
        severity: "info",
        blockId: block.id,
        title: `Full bleed — outer ${lostMm}mm is cropped`,
        detail: `This ${describe(block.kind)} covers the whole sheet, so the printer trims roughly ${lostMm}mm from every edge. That is normal for edge-to-edge work; just keep anything essential inside the margin guide.`,
      });
    } else {
      const outsidePrintable =
        block.x < printable.xMin - EPS ||
        block.y < printable.yMin - EPS ||
        right > printable.xMax + EPS ||
        bottom > printable.yMax + EPS;

      if (outsidePrintable) {
        warnings.push({
          id: `unprintable-${block.id}`,
          severity: "error",
          blockId: block.id,
          title: "Extends past the printable area",
          detail: `This ${describe(block.kind)} reaches into the ${(canvas.printableInsetIn * 25.4).toFixed(1)}mm border the TC-21 cannot print. That part will be missing from the print.`,
        });
      } else if (
        block.x < design.xMin - EPS ||
        block.y < design.yMin - EPS ||
        right > design.xMax + EPS ||
        bottom > design.yMax + EPS
      ) {
        warnings.push({
          id: `margin-${block.id}`,
          severity: "warning",
          blockId: block.id,
          title: "Crowds the margin",
          detail: `This ${describe(block.kind)} sits inside the design margin. It will print, but close to the edge.`,
        });
      }
    }

    if (block.kind === "image") {
      const asset = assetById.get(block.assetId);
      if (!asset) {
        warnings.push({
          id: `missing-asset-${block.id}`,
          severity: "error",
          blockId: block.id,
          title: "Missing image",
          detail: "This image block references an asset that no longer exists.",
        });
        continue;
      }
      if (!asset.widthPx || !asset.heightPx) continue;

      const dpi = blockEffectiveDpi({
        canvas,
        assetWidthPx: asset.widthPx,
        assetHeightPx: asset.heightPx,
        blockW: block.w,
        blockH: block.h,
      });
      const verdict = dpiVerdict(dpi);
      if (verdict !== "good") {
        const blockWIn = (block.w * canvas.widthIn).toFixed(1);
        const blockHIn = (block.h * canvas.heightIn).toFixed(1);
        warnings.push({
          id: `dpi-${block.id}`,
          severity: verdict === "low" ? "error" : "warning",
          blockId: block.id,
          title: `${Math.round(dpi)} DPI at print size`,
          detail:
            `${asset.widthPx}×${asset.heightPx}px stretched across ${blockWIn}×${blockHIn}in. ` +
            (verdict === "low"
              ? "Visibly soft even at poster viewing distance. Upscale it, or print smaller."
              : "Acceptable at a metre away, but not crisp up close.") +
            (asset.provenance.dimensionsSource === "requested"
              ? " (Dimensions assumed from the request, not decoded — treat as approximate.)"
              : ""),
        });
      }
    }
  }

  return warnings;
}

const EPS = 1e-4;

function describe(kind: string) {
  if (kind === "text") return "text block";
  if (kind === "image") return "image";
  return "shape";
}
