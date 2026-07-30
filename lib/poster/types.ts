import {
  DEFAULT_MARGIN_IN,
  DEFAULT_MEDIA_ID,
  PRINTABLE_INSET_IN,
  mediaDimensions,
  mediaOrDefault,
  type Orientation,
} from "./media";

export type Inches = number;
export type CanvasFraction = number;
export type ProjectId = string;

export interface PosterProject {
  id: ProjectId;
  title: string;
  createdAt: string;
  updatedAt: string;
  brief: Brief;
  canvas: Canvas;
  assets: Asset[];
  layout: Layout;
}

export interface Brief {
  prompt: string;
  intent: PosterIntent;
  referenceUrls: string[];
  styleNotes?: string;
  history: ChatTurn[];
}

/**
 * The two things Nick actually makes:
 * - "art"      — image-first. One generated image fills the sheet.
 * - "document" — layout-first. Type, tables, diagrams. No image by default.
 *
 * These take different pipelines end to end, not just different prompts.
 */
export type PosterIntent = "art" | "document";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

/**
 * The printed page.
 *
 * There is deliberately NO bleed here. The TC-21 cannot print inside its own
 * 5 mm border and we do not trim afterwards, so the old bleed + crop-mark model
 * described a press we don't own. `printableInsetIn` is a hard hardware limit;
 * `marginIn` is the design margin we choose inside it.
 *
 * widthIn/heightIn are derived from mediaId + orientation and stored so that
 * renderers and the planner never have to resolve the catalog themselves.
 */
export interface Canvas {
  mediaId: string;
  orientation: Orientation;
  widthIn: Inches;
  heightIn: Inches;
  dpi: number;
  /** Hardware-unreachable border, inches. Content here will not print. */
  printableInsetIn: number;
  /** Design breathing room measured inward from the printable edge. */
  marginIn: number;
  background: { kind: "solid"; color: string };
  palette: string[];
}

export interface Asset {
  id: string;
  blobUrl: string;
  kind: "generated";
  widthPx: number;
  heightPx: number;
  provenance: {
    model?: string;
    prompt?: string;
    seed?: number;
    styleKey?: string;
    /** What we asked the provider for — a "WxH" size or an aspect string. */
    requestedSize?: string;
    /**
     * Whether widthPx/heightPx were decoded from the returned bytes or merely
     * assumed from the request. Only "decoded" values are trustworthy for
     * print-resolution warnings.
     */
    dimensionsSource?: "decoded" | "requested";
  };
  createdAt: string;
}

export interface Layout {
  blocks: Block[];
  layoutVersion: string;
}

export type Block = ImageBlock | TextBlock | ShapeBlock;

export interface BlockBase {
  id: string;
  x: CanvasFraction;
  y: CanvasFraction;
  w: CanvasFraction;
  h: CanvasFraction;
  rotation?: number;
  z?: number;
}

export interface ImageBlock extends BlockBase {
  kind: "image";
  assetId: string;
  fit: "cover" | "contain";
}

export interface TextBlock extends BlockBase {
  kind: "text";
  text: string;
  fontFamily: "sans" | "mono" | "serif";
  fontSizePt: number;
  weight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface ShapeBlock extends BlockBase {
  kind: "shape";
  shape: "rect" | "divider";
  fill?: string;
  stroke?: string;
  strokeWidthPt?: number;
}

export interface ProjectIndexEntry {
  id: ProjectId;
  title: string;
  updatedAt: string;
  thumbnailUrl?: string;
}

/**
 * Default canvas: 18×24 portrait on the 24" roll (driver preset 609.60 × 457.20).
 *
 * Background defaults to near-white on purpose. The TC-21 is a 4-ink CMYK
 * pigment machine with no photo black; a full-sheet solid black is slow, drinks
 * ink, and bronzes or bands on plain paper. Dark backgrounds are opt-in.
 */
export function defaultCanvas(): Canvas {
  const media = mediaOrDefault(DEFAULT_MEDIA_ID);
  const { widthIn, heightIn } = mediaDimensions(media, "portrait");
  return {
    mediaId: media.id,
    orientation: "portrait",
    widthIn,
    heightIn,
    dpi: 300,
    printableInsetIn: PRINTABLE_INSET_IN,
    marginIn: DEFAULT_MARGIN_IN,
    background: { kind: "solid", color: "#fbfaf7" },
    palette: ["#fbfaf7", "#141414"],
  };
}

export function canvasForMedia(
  mediaId: string,
  orientation: Orientation,
  base?: Canvas,
): Canvas {
  const media = mediaOrDefault(mediaId);
  const { widthIn, heightIn } = mediaDimensions(media, orientation);
  return {
    ...(base ?? defaultCanvas()),
    mediaId: media.id,
    orientation,
    widthIn,
    heightIn,
  };
}

export function emptyProject(
  id: ProjectId,
  title: string,
  intent: PosterIntent = "document",
): PosterProject {
  const now = new Date().toISOString();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    brief: { prompt: "", intent, referenceUrls: [], history: [] },
    canvas: defaultCanvas(),
    assets: [],
    layout: { blocks: [], layoutVersion: now },
  };
}
