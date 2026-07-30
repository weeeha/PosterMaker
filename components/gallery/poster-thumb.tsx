"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PosterCanvas } from "@/lib/poster/render";
import { CSS_PX_PER_INCH } from "@/lib/poster/dimensions";
import type { PosterProject } from "@/lib/poster/types";

/**
 * A real poster rendered small, at its true aspect ratio.
 *
 * Reuses PosterCanvas rather than a stored thumbnail image, so a tile can never
 * go stale relative to the project — and there is no thumbnail pipeline to keep
 * warm. The trade is that the browser lays out every block at gallery scale,
 * which is cheap for the sizes involved here.
 *
 * The `aspect-ratio` box establishes the height, and the scale factor is
 * measured from the box's own width — the same pattern as the workspace
 * preview, because neither the server nor CSS can know the column width that
 * masonry ends up giving us.
 */
export function PosterThumb({ project }: { project: PosterProject }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const pageWidthPx = project.canvas.widthIn * CSS_PX_PER_INCH;
  const pageHeightPx = project.canvas.heightIn * CSS_PX_PER_INCH;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setScale(el.clientWidth / pageWidthPx);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx]);

  const isBlank = project.layout.blocks.length === 0;

  return (
    <div
      ref={boxRef}
      className="bg-muted/40 relative w-full overflow-hidden"
      style={{ aspectRatio: `${project.canvas.widthIn} / ${project.canvas.heightIn}` }}
    >
      {/* Hidden until measured, so there is no first-paint flash at the wrong size. */}
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: pageWidthPx,
          height: pageHeightPx,
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        <PosterCanvas project={project} />
      </div>
      {isBlank && (
        <span className="text-muted-foreground absolute inset-0 flex items-center justify-center text-[11px]">
          Empty
        </span>
      )}
    </div>
  );
}
