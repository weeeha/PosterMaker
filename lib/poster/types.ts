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

export type PosterIntent = "knowledge";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

export interface Canvas {
  widthIn: Inches;
  heightIn: Inches;
  dpi: 300;
  bleedIn: number;
  safeAreaIn: number;
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

export const DEFAULT_CANVAS: Canvas = {
  widthIn: 18,
  heightIn: 24,
  dpi: 300,
  bleedIn: 0.125,
  safeAreaIn: 0.25,
  background: { kind: "solid", color: "#000000" },
  palette: ["#000000", "#ffffff"],
};

export function emptyProject(id: ProjectId, title: string): PosterProject {
  const now = new Date().toISOString();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    brief: { prompt: "", intent: "knowledge", referenceUrls: [], history: [] },
    canvas: { ...DEFAULT_CANVAS },
    assets: [],
    layout: { blocks: [], layoutVersion: now },
  };
}
