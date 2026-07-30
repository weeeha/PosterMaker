"use client";

import { useEffect, useState, type RefObject } from "react";
import type { PosterProject } from "@/lib/poster/types";
import type { QualityWarning } from "@/lib/poster/quality";

/** Ignore sub-pixel and rounding noise; only flag a real extra line or more. */
const OVERFLOW_TOLERANCE_PX = 4;

/**
 * Detect text blocks whose content is taller than the box the planner gave them.
 *
 * This can't live in lib/poster/quality.ts with the other checks: it depends on
 * actual font metrics and line wrapping, which only the browser knows. The
 * planner is guessing at text height, so this is the backstop that catches it
 * before ink is spent.
 *
 * Measurement is layout-based (scrollHeight vs clientHeight), so the preview's
 * CSS transform scaling does not affect the result.
 */
export function useOverflowWarnings(
  containerRef: RefObject<HTMLElement | null>,
  project: PosterProject,
): QualityWarning[] {
  const [warnings, setWarnings] = useState<QualityWarning[]>([]);

  // Re-measure whenever the layout version changes or the sheet is resized,
  // since both change how text wraps.
  const layoutVersion = project.layout.layoutVersion;
  const { widthIn, heightIn } = project.canvas;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let frame = 0;

    const measure = () => {
      const found: QualityWarning[] = [];
      const nodes = root.querySelectorAll<HTMLElement>('[data-block-kind="text"]');
      for (const el of nodes) {
        const overflowBy = el.scrollHeight - el.clientHeight;
        if (overflowBy <= OVERFLOW_TOLERANCE_PX) continue;
        const blockId = el.dataset.blockId;
        const block = project.layout.blocks.find((b) => b.id === blockId);
        const boxHeightIn = block ? block.h * heightIn : 0;
        const overflowIn = (overflowBy / el.clientHeight) * boxHeightIn;
        found.push({
          id: `overflow-${blockId}`,
          severity: "error",
          blockId,
          title: "Text overflows its box",
          detail:
            `Content runs about ${overflowIn.toFixed(2)}in past the ${boxHeightIn.toFixed(2)}in ` +
            `block height. It will collide with whatever sits below it. Ask for a shorter ` +
            `text, a smaller size, or a taller block.`,
        });
      }
      setWarnings(found);
    };

    // Fonts change metrics, so measure again once they've loaded.
    frame = requestAnimationFrame(measure);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => {});

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(root);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, layoutVersion, widthIn, heightIn]);

  return warnings;
}
