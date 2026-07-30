"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PosterCanvas } from "@/lib/poster/render";
import type { PosterProject } from "@/lib/poster/types";
import { CSS_PX_PER_INCH } from "@/lib/poster/dimensions";
import { analyzeProject } from "@/lib/poster/quality";
import { QualityPanel } from "./quality-panel";
import { useOverflowWarnings } from "./use-overflow-warnings";

interface CanvasPreviewProps {
  project: PosterProject;
}

const PREVIEW_PADDING_PX = 48;

export function CanvasPreview({ project }: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const pageWidthPx = project.canvas.widthIn * CSS_PX_PER_INCH;
  const pageHeightPx = project.canvas.heightIn * CSS_PX_PER_INCH;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - PREVIEW_PADDING_PX * 2;
      const h = el.clientHeight - PREVIEW_PADDING_PX * 2;
      if (w <= 0 || h <= 0) return;
      setScale(Math.max(0.02, Math.min(w / pageWidthPx, h / pageHeightPx)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx, pageHeightPx]);

  const staticWarnings = useMemo(() => analyzeProject(project), [project]);
  const overflowWarnings = useOverflowWarnings(sheetRef, project);

  // Errors first, so the expensive problems are what you see.
  const warnings = useMemo(() => {
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return [...staticWarnings, ...overflowWarnings].sort(
      (a, b) => rank[a.severity] - rank[b.severity],
    );
  }, [staticWarnings, overflowWarnings]);

  return (
    <div
      ref={containerRef}
      className="bg-muted/30 relative flex min-h-0 items-center justify-center overflow-hidden p-12"
    >
      <div
        style={{
          width: pageWidthPx * scale,
          height: pageHeightPx * scale,
          position: "relative",
        }}
      >
        <div
          ref={sheetRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: pageWidthPx,
            height: pageHeightPx,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)",
          }}
        >
          <PosterCanvas project={project} showGuides />
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-10">
        <QualityPanel warnings={warnings} />
      </div>
      <div className="text-muted-foreground absolute bottom-3 right-3 z-10 rounded-md border bg-background/90 px-2 py-1 font-mono text-[10px] backdrop-blur">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
