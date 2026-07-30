import type { CSSProperties } from "react";
import type {
  Asset,
  Block,
  ImageBlock,
  PosterProject,
  ShapeBlock,
  TextBlock,
} from "./types";
import { CSS_PX_PER_INCH, ptToCssPx } from "./dimensions";

const FONT_FAMILY_VARS: Record<TextBlock["fontFamily"], string> = {
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
};

interface PosterCanvasProps {
  project: PosterProject;
  /** Preview-only overlays. Never enabled for the PDF pass. */
  showGuides?: boolean;
}

/**
 * The single renderer for both the on-screen preview and the PDF export.
 *
 * Keeping one component for both is what prevents preview-vs-print drift, so
 * resist adding a print-only branch here. Anything print-specific belongs
 * behind `showGuides` (preview-only chrome), not behind a media query.
 *
 * Block coordinates are fractions of the FULL page. There is no inner trim box
 * any more: the printer's 5 mm border is a hardware limit we draw as a guide,
 * not a region we lay out inside of.
 */
export function PosterCanvas({ project, showGuides = false }: PosterCanvasProps) {
  const { canvas, layout, assets } = project;
  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));

  const pageStyle: CSSProperties = {
    width: `${canvas.widthIn * CSS_PX_PER_INCH}px`,
    height: `${canvas.heightIn * CSS_PX_PER_INCH}px`,
    background: canvas.background.color,
    position: "relative",
    overflow: "hidden",
  };

  const sortedBlocks = [...layout.blocks].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  return (
    <div className="poster-page" style={pageStyle} data-poster-id={project.id}>
      {sortedBlocks.map((block) => (
        <BlockRenderer key={block.id} block={block} assetById={assetById} />
      ))}
      {showGuides && (
        <Guides
          printableInsetIn={canvas.printableInsetIn}
          marginIn={canvas.marginIn}
        />
      )}
    </div>
  );
}

function BlockRenderer({
  block,
  assetById,
}: {
  block: Block;
  assetById: Map<string, Asset>;
}) {
  const positionStyle: CSSProperties = {
    position: "absolute",
    left: `${block.x * 100}%`,
    top: `${block.y * 100}%`,
    width: `${block.w * 100}%`,
    height: `${block.h * 100}%`,
    transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
  };

  if (block.kind === "text") return <TextBlockView block={block} style={positionStyle} />;
  if (block.kind === "shape") return <ShapeBlockView block={block} style={positionStyle} />;
  return <ImageBlockView block={block} assetById={assetById} style={positionStyle} />;
}

function TextBlockView({ block, style }: { block: TextBlock; style: CSSProperties }) {
  const textStyle: CSSProperties = {
    ...style,
    color: block.color,
    fontFamily: FONT_FAMILY_VARS[block.fontFamily],
    fontSize: `${block.fontSizePt}pt`,
    fontWeight: block.weight,
    textAlign: block.align,
    lineHeight: block.lineHeight,
    whiteSpace: "pre-wrap",
    // Visible, not hidden, on purpose: silently clipping text means discovering
    // the truncation after the ink is spent. The preview's overflow detector
    // flags these instead of the browser hiding them.
    overflow: "visible",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  };
  return (
    <div style={textStyle} data-block-id={block.id} data-block-kind="text">
      {block.text}
    </div>
  );
}

function ShapeBlockView({ block, style }: { block: ShapeBlock; style: CSSProperties }) {
  if (block.shape === "divider") {
    const thicknessPx = ptToCssPx(block.strokeWidthPt ?? 1);
    const isHorizontal = block.w >= block.h;
    return (
      <div
        data-block-id={block.id}
        data-block-kind="divider"
        style={{
          ...style,
          backgroundColor: block.stroke ?? block.fill ?? "currentColor",
          ...(isHorizontal
            ? { height: `${thicknessPx}px` }
            : { width: `${thicknessPx}px` }),
        }}
      />
    );
  }
  return (
    <div
      data-block-id={block.id}
      data-block-kind="rect"
      style={{
        ...style,
        backgroundColor: block.fill ?? "transparent",
        border: block.stroke
          ? `${ptToCssPx(block.strokeWidthPt ?? 1)}px solid ${block.stroke}`
          : undefined,
      }}
    />
  );
}

function ImageBlockView({
  block,
  assetById,
  style,
}: {
  block: ImageBlock;
  assetById: Map<string, Asset>;
  style: CSSProperties;
}) {
  const asset = assetById.get(block.assetId);
  const wrapperStyle: CSSProperties = { ...style, overflow: "hidden" };
  if (!asset) {
    return <div style={{ ...wrapperStyle, background: "rgba(127,127,127,0.08)" }} />;
  }
  return (
    <div style={wrapperStyle} data-block-id={block.id} data-block-kind="image">
      {/* A plain img tag, not next/image: this component has to render identically
          from RSC and from inside Puppeteer, and blob URLs would need loader config. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.blobUrl}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: block.fit, display: "block" }}
        crossOrigin="anonymous"
      />
    </div>
  );
}

/**
 * Preview-only overlays showing where the printer physically stops (5 mm) and
 * where content is supposed to stay (the design margin).
 *
 * These are absolutely-positioned boxes with inch-derived pixel insets. The
 * previous implementation used `outline-offset` with a percentage, which is
 * invalid CSS — it only accepts a length — so the browser dropped the
 * declaration and the guide never marked the real inset.
 */
function Guides({
  printableInsetIn,
  marginIn,
}: {
  printableInsetIn: number;
  marginIn: number;
}) {
  const printablePx = printableInsetIn * CSS_PX_PER_INCH;
  const marginPx = (printableInsetIn + marginIn) * CSS_PX_PER_INCH;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Hardware limit: nothing outside this line will print at all. */}
      <div
        style={{
          position: "absolute",
          inset: `${printablePx}px`,
          border: "1px dashed rgba(220, 38, 38, 0.65)",
        }}
      />
      {/* Design margin. */}
      <div
        style={{
          position: "absolute",
          inset: `${marginPx}px`,
          border: "1px dashed rgba(56, 132, 255, 0.45)",
        }}
      />
    </div>
  );
}
