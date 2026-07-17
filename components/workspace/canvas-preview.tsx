"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PosterCanvas } from "@/lib/poster/render";
import type { PosterProject } from "@/lib/poster/types";
import { pageDimensionsIn } from "@/lib/poster/dimensions";
import { CSS_PX_PER_INCH } from "@/lib/poster/dimensions";

interface CanvasPreviewProps {
  project: PosterProject;
}

export function CanvasPreview({ project }: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const page = pageDimensionsIn(project.canvas);
  const pageWidthPx = page.widthIn * CSS_PX_PER_INCH;
  const pageHeightPx = page.heightIn * CSS_PX_PER_INCH;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const padX = 48;
      const padY = 48;
      const w = el.clientWidth - padX * 2;
      const h = el.clientHeight - padY * 2;
      if (w <= 0 || h <= 0) return;
      const s = Math.min(w / pageWidthPx, h / pageHeightPx);
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx, pageHeightPx]);

  return (
    <div
      ref={containerRef}
      className="bg-muted/30 flex min-h-0 items-center justify-center overflow-hidden p-12"
    >
      <div
        style={{
          width: pageWidthPx * scale,
          height: pageHeightPx * scale,
          position: "relative",
        }}
      >
        <div
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
    </div>
  );
}
