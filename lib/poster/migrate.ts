import {
  ALL_MEDIA,
  DEFAULT_MARGIN_IN,
  PRINTABLE_INSET_IN,
  mediaOrDefault,
  type Orientation,
} from "./media";
import { defaultCanvas, type Canvas, type PosterProject } from "./types";

/**
 * Upgrade a project blob written by an older version of the app.
 *
 * Two shape changes so far:
 * 1. Canvas lost `bleedIn`/`safeAreaIn` (a commercial-press model we don't use)
 *    and gained `mediaId`/`orientation`/`printableInsetIn`/`marginIn`.
 * 2. `brief.intent` was the single value "knowledge", now "art" | "document".
 *
 * Unknown/garbage input degrades to defaults rather than throwing — a bad blob
 * should never make a project unopenable.
 */
export function normalizeProject(raw: unknown): PosterProject {
  const p = raw as PosterProject & { canvas?: LegacyCanvas };
  return {
    ...p,
    brief: {
      ...p.brief,
      intent:
        p.brief?.intent === "art" || p.brief?.intent === "document"
          ? p.brief.intent
          : "document",
      referenceUrls: p.brief?.referenceUrls ?? [],
      history: p.brief?.history ?? [],
    },
    canvas: normalizeCanvas(p.canvas),
    assets: p.assets ?? [],
    layout: p.layout ?? { blocks: [], layoutVersion: new Date().toISOString() },
  };
}

type LegacyCanvas = Partial<Canvas> & {
  bleedIn?: number;
  safeAreaIn?: number;
};

export function normalizeCanvas(raw: LegacyCanvas | undefined): Canvas {
  const base = defaultCanvas();
  if (!raw) return base;

  const widthIn = numOr(raw.widthIn, base.widthIn);
  const heightIn = numOr(raw.heightIn, base.heightIn);

  // Recover the media entry from the stored dimensions when mediaId is absent.
  const resolved = raw.mediaId
    ? { media: mediaOrDefault(raw.mediaId), orientation: orientationOf(raw, widthIn, heightIn) }
    : matchMediaByDimensions(widthIn, heightIn);

  return {
    mediaId: resolved.media.id,
    orientation: resolved.orientation,
    widthIn,
    heightIn,
    dpi: numOr(raw.dpi, base.dpi),
    printableInsetIn: numOr(raw.printableInsetIn, PRINTABLE_INSET_IN),
    marginIn: numOr(raw.marginIn, DEFAULT_MARGIN_IN),
    background: raw.background ?? base.background,
    palette: raw.palette?.length ? raw.palette : base.palette,
  };
}

function orientationOf(
  raw: LegacyCanvas,
  widthIn: number,
  heightIn: number,
): Orientation {
  if (raw.orientation === "portrait" || raw.orientation === "landscape") {
    return raw.orientation;
  }
  return widthIn <= heightIn ? "portrait" : "landscape";
}

/**
 * Find the catalog entry whose edges match, in either orientation. An 18×24
 * legacy canvas becomes roll-18x24 portrait; anything unrecognised falls back
 * to the default media while keeping the stored pixel dimensions intact.
 */
function matchMediaByDimensions(widthIn: number, heightIn: number) {
  const shortIn = Math.min(widthIn, heightIn);
  const longIn = Math.max(widthIn, heightIn);
  const hit = ALL_MEDIA.find(
    (m) => close(m.shortIn, shortIn) && close(m.longIn, longIn),
  );
  const orientation: Orientation = widthIn <= heightIn ? "portrait" : "landscape";
  return { media: hit ?? mediaOrDefault(undefined), orientation };
}

function close(a: number, b: number) {
  return Math.abs(a - b) < 0.02;
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
