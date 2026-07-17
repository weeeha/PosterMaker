import type { CSSProperties, ReactNode } from "react";
import type {
  Asset,
  Block,
  ImageBlock,
  PosterProject,
  ShapeBlock,
  TextBlock,
} from "./types";
import { CSS_PX_PER_INCH, pageDimensionsIn } from "./dimensions";

const FONT_FAMILY_VARS: Record<TextBlock["fontFamily"], string> = {
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
};

interface PosterCanvasProps {
  project: PosterProject;
  showGuides?: boolean;
}

export function PosterCanvas({ project, showGuides = false }: PosterCanvasProps) {
  const { canvas, layout, assets } = project;
  const page = pageDimensionsIn(canvas);
  const trimInsetIn = canvas.bleedIn;
  const safeInsetIn = canvas.bleedIn + canvas.safeAreaIn;
  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));

  const pageStyle: CSSProperties = {
    width: `${page.widthIn * CSS_PX_PER_INCH}px`,
    height: `${page.heightIn * CSS_PX_PER_INCH}px`,
    background: canvas.background.color,
    position: "relative",
    overflow: "hidden",
  };

  const trimStyle: CSSProperties = {
    position: "absolute",
    top: `${trimInsetIn * CSS_PX_PER_INCH}px`,
    left: `${trimInsetIn * CSS_PX_PER_INCH}px`,
    width: `${canvas.widthIn * CSS_PX_PER_INCH}px`,
    height: `${canvas.heightIn * CSS_PX_PER_INCH}px`,
  };

  const sortedBlocks = [...layout.blocks].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  return (
    <div className="poster-page" style={pageStyle} data-poster-id={project.id}>
      <div className="poster-trim" style={trimStyle}>
        {sortedBlocks.map((block) => (
          <BlockRenderer key={block.id} block={block} assetById={assetById} />
        ))}
        {showGuides && (
          <Guides
            widthIn={canvas.widthIn}
            heightIn={canvas.heightIn}
            safeAreaIn={canvas.safeAreaIn}
          />
        )}
      </div>
      {showGuides && (
        <TrimMark
          widthIn={page.widthIn}
          heightIn={page.heightIn}
          trimInsetIn={trimInsetIn}
          safeInsetIn={safeInsetIn}
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
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  };
  return <div style={textStyle}>{block.text}</div>;
}

function ShapeBlockView({ block, style }: { block: ShapeBlock; style: CSSProperties }) {
  if (block.shape === "divider") {
    const isHorizontal = block.w >= block.h;
    const lineStyle: CSSProperties = {
      ...style,
      backgroundColor: block.stroke ?? block.fill ?? "currentColor",
    };
    if (isHorizontal) {
      lineStyle.height = `${(block.strokeWidthPt ?? 1) * (1 / 0.75)}px`;
      lineStyle.top = `${block.y * 100}%`;
    } else {
      lineStyle.width = `${(block.strokeWidthPt ?? 1) * (1 / 0.75)}px`;
      lineStyle.left = `${block.x * 100}%`;
    }
    return <div style={lineStyle} />;
  }
  const rectStyle: CSSProperties = {
    ...style,
    backgroundColor: block.fill ?? "transparent",
    border: block.stroke
      ? `${(block.strokeWidthPt ?? 1) * (1 / 0.75)}px solid ${block.stroke}`
      : undefined,
  };
  return <div style={rectStyle} />;
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
    return <div style={{ ...wrapperStyle, background: "rgba(255,255,255,0.04)" }} />;
  }
  const imgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: block.fit,
    display: "block",
  };
  return (
    <div style={wrapperStyle}>
      {/* Use a plain img tag because next/image cannot serve external blob URLs without remotePatterns config and we want to keep this component renderable from RSC and Puppeteer alike. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.blobUrl} alt="" style={imgStyle} crossOrigin="anonymous" />
    </div>
  );
}

function Guides({
  widthIn,
  heightIn,
  safeAreaIn,
}: {
  widthIn: number;
  heightIn: number;
  safeAreaIn: number;
}): ReactNode {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        outline: `1px dashed rgba(255, 255, 255, 0.25)`,
        outlineOffset: `-${(safeAreaIn / Math.min(widthIn, heightIn)) * 50}%`,
      }}
    />
  );
}

function TrimMark({
  widthIn,
  heightIn,
  trimInsetIn,
}: {
  widthIn: number;
  heightIn: number;
  trimInsetIn: number;
  safeInsetIn: number;
}) {
  const tickPx = 12;
  const positions: CSSProperties[] = [
    { top: 0, left: `${trimInsetIn * CSS_PX_PER_INCH}px`, width: `1px`, height: `${tickPx}px` },
    {
      top: 0,
      right: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `1px`,
      height: `${tickPx}px`,
    },
    {
      bottom: 0,
      left: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `1px`,
      height: `${tickPx}px`,
    },
    {
      bottom: 0,
      right: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `1px`,
      height: `${tickPx}px`,
    },
    {
      left: 0,
      top: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `${tickPx}px`,
      height: `1px`,
    },
    {
      right: 0,
      top: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `${tickPx}px`,
      height: `1px`,
    },
    {
      left: 0,
      bottom: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `${tickPx}px`,
      height: `1px`,
    },
    {
      right: 0,
      bottom: `${trimInsetIn * CSS_PX_PER_INCH}px`,
      width: `${tickPx}px`,
      height: `1px`,
    },
  ];
  void widthIn;
  void heightIn;
  return (
    <>
      {positions.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            background: "rgba(255,255,255,0.5)",
            ...p,
          }}
        />
      ))}
    </>
  );
}
