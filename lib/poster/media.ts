/**
 * Media catalog for the Canon imagePROGRAF TC-21.
 *
 * Hardware facts this file encodes (from Canon's TC-21 spec sheet):
 * - Roll feed accepts 12"–24" wide rolls. We target the 24" (609.6 mm) roll.
 * - Cut sheets are 8.3"–12" wide. Anything wider must come off the roll.
 * - Printable margin is 5 mm on ALL sides. There is no borderless mode, so a
 *   "full bleed" design is physically impossible — that 5 mm is unreachable.
 * - Some photo modes want 30 mm top/bottom instead; see PHOTO_MODE_NOTE.
 *
 * The nine 24" roll presets in the print driver form an aspect-ratio ladder
 * that is symmetric around the 24×24 square: every shape appears twice, once
 * with the short edge under 24" and once with it at 24". So 3:4 is available
 * both as 18×24 and as 24×32. Media choice and image-generation aspect are
 * therefore the same decision, which is why each entry carries an `aspect`.
 *
 * `aspect` is always expressed short:long — i.e. the PORTRAIT aspect. Use
 * mediaAspect() to get the orientation-corrected value.
 */

export type MediaFeed = "roll" | "tray";

export interface Media {
  /** Stable key persisted on the project. Never renumber these. */
  id: string;
  label: string;
  /** Short edge, inches. */
  shortIn: number;
  /** Long edge, inches. */
  longIn: number;
  feed: MediaFeed;
  /** Portrait (short:long) aspect, e.g. "2:3". */
  aspect: string;
  /** Exactly what to pick in the macOS print dialog. */
  driverPreset: string;
}

/** 5 mm, in inches. The printer cannot put ink inside this border. */
export const PRINTABLE_INSET_IN = 5 / 25.4;

/** Default breathing room for content, inside the printable area. */
export const DEFAULT_MARGIN_IN = 0.5;

export const PHOTO_MODE_NOTE =
  "Some photo media modes require 30 mm top/bottom instead of 5 mm. Check the driver before printing edge-to-edge art.";

const ROLL_WIDTH_IN = 24;
const ROLL_WIDTH_MM = 609.6;

const MAX_RATIO_TERM = 40;

/**
 * Reduce two edge lengths to a tidy "w:h" label.
 *
 * A plain gcd is wrong here: the driver's lengths are rounded millimetre values,
 * so 1083.73 mm is 42.667" and gcd(2400, 4267) is 1, yielding garbage. Instead
 * find the best small rational approximation, preferring the smallest terms.
 * That recovers 9:16 for the 42.67" preset and keeps 17:22 for US Letter.
 */
function ratio(a: number, b: number): string {
  const target = a / b;
  let best = { w: 1, h: 1, err: Math.abs(target - 1) };
  for (let h = 1; h <= MAX_RATIO_TERM; h++) {
    const w = Math.round(target * h);
    if (w < 1 || w > MAX_RATIO_TERM) continue;
    const err = Math.abs(target - w / h);
    if (err < best.err - 1e-9) best = { w, h, err };
  }
  return `${best.w}:${best.h}`;
}

/**
 * A 24"-roll preset. `alongRollIn` is the driver's length value; the printed
 * artwork is 24" in the other dimension, so the short/long edges depend on
 * whether the length is under or over 24".
 */
function roll(alongRollIn: number, alongRollMm: number): Media {
  const shortIn = Math.min(ROLL_WIDTH_IN, alongRollIn);
  const longIn = Math.max(ROLL_WIDTH_IN, alongRollIn);
  const aspect = ratio(shortIn, longIn);
  return {
    id: `roll-${fmtId(shortIn)}x${fmtId(longIn)}`,
    label: `${fmtIn(shortIn)} × ${fmtIn(longIn)} in`,
    shortIn,
    longIn,
    feed: "roll",
    aspect,
    driverPreset: `${ROLL_WIDTH_MM.toFixed(2)} × ${alongRollMm.toFixed(2)} mm`,
  };
}

function fmtId(n: number) {
  return String(n).replace(/\./g, "_");
}

function fmtIn(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** The nine 24"-roll presets, in driver order. */
export const ROLL_MEDIA: Media[] = [
  roll(13.5, 342.9),
  roll(14.4, 365.76),
  roll(16, 406.4),
  roll(18, 457.2),
  roll(24, 609.6),
  roll(32, 812.8),
  roll(36, 914.4),
  roll(40, 1016),
  roll(42.67, 1083.73),
];

/** Cut sheets that fit the 8.3"–12" tray. */
export const TRAY_MEDIA: Media[] = [
  {
    id: "letter",
    label: "US Letter — 8.5 × 11 in",
    shortIn: 8.5,
    longIn: 11,
    feed: "tray",
    aspect: ratio(8.5, 11),
    driverPreset: "US Letter (216 × 279 mm)",
  },
  {
    id: "sheet-10x12",
    label: "10 × 12 in",
    shortIn: 10,
    longIn: 12,
    feed: "tray",
    aspect: ratio(10, 12),
    driverPreset: "10x12 (254 × 305 mm)",
  },
  {
    id: "sheet-10x15",
    label: "10 × 15 in",
    shortIn: 10,
    longIn: 15,
    feed: "tray",
    aspect: ratio(10, 15),
    driverPreset: "10x15 (254 × 381 mm)",
  },
  {
    id: "sheet-11x17",
    label: "Tabloid — 11 × 17 in",
    shortIn: 11,
    longIn: 17,
    feed: "tray",
    aspect: ratio(11, 17),
    driverPreset: "11x17 (279 × 432 mm)",
  },
  {
    id: "sheet-12x16",
    label: "12 × 16 in",
    shortIn: 12,
    longIn: 16,
    feed: "tray",
    aspect: ratio(12, 16),
    driverPreset: "12x16 (305 × 406 mm)",
  },
];

/**
 * Sizes the driver offers that exceed the 12" tray limit, so they must be cut
 * from the 24" roll rather than fed as sheets.
 */
export const ROLL_CUT_MEDIA: Media[] = [
  {
    id: "sheet-13x22",
    label: "13 × 22 in",
    shortIn: 13,
    longIn: 22,
    feed: "roll",
    aspect: ratio(13, 22),
    driverPreset: "13x22 (330 × 559 mm)",
  },
  {
    id: "sheet-14x17",
    label: "14 × 17 in",
    shortIn: 14,
    longIn: 17,
    feed: "roll",
    aspect: ratio(14, 17),
    driverPreset: "14x17 (356 × 432 mm)",
  },
  {
    id: "sheet-16x20",
    label: "16 × 20 in",
    shortIn: 16,
    longIn: 20,
    feed: "roll",
    aspect: ratio(16, 20),
    driverPreset: "16x20 (406 × 508 mm)",
  },
];

export const ALL_MEDIA: Media[] = [...ROLL_MEDIA, ...TRAY_MEDIA, ...ROLL_CUT_MEDIA];

export const MEDIA_GROUPS: { label: string; media: Media[] }[] = [
  { label: "24-inch roll", media: ROLL_MEDIA },
  { label: "Cut sheet (tray)", media: TRAY_MEDIA },
  { label: "Cut from roll", media: ROLL_CUT_MEDIA },
];

/** 18 × 24 on the roll: the classic poster shape, and a real driver preset. */
export const DEFAULT_MEDIA_ID = "roll-18x24";

const BY_ID = new Map(ALL_MEDIA.map((m) => [m.id, m]));

export function findMedia(id: string): Media | undefined {
  return BY_ID.get(id);
}

/** Falls back to the default rather than throwing, so a stale id can't brick a project. */
export function mediaOrDefault(id: string | undefined): Media {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_MEDIA_ID)!;
}

export type Orientation = "portrait" | "landscape";

/**
 * Resolve media + orientation into printed width/height.
 *
 * On roll media the physical roll is always 24" across and the driver rotates
 * artwork to fit, so this is purely about the artwork's shape, not the feed.
 */
export function mediaDimensions(media: Media, orientation: Orientation) {
  return orientation === "portrait"
    ? { widthIn: media.shortIn, heightIn: media.longIn }
    : { widthIn: media.longIn, heightIn: media.shortIn };
}

/** Orientation-corrected width:height aspect for the printed artwork. */
export function mediaAspect(media: Media, orientation: Orientation): string {
  return orientation === "portrait" ? media.aspect : invertAspect(media.aspect);
}

function invertAspect(aspect: string): string {
  const [a, b] = aspect.split(":");
  return `${b}:${a}`;
}

/** Numeric width/height ratio, orientation-corrected. */
export function mediaAspectValue(media: Media, orientation: Orientation): number {
  const { widthIn, heightIn } = mediaDimensions(media, orientation);
  return widthIn / heightIn;
}
