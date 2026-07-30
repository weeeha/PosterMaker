export const PLANNER_MODEL = "anthropic/claude-sonnet-4.6";

/**
 * Art mode: one big image that fills the sheet. GPT Image 2 is the pick here
 * because it takes an explicit `size`, so we can ask for the sheet's exact
 * aspect instead of generating a square and cropping it.
 */
export const ART_IMAGE_MODEL = "openai/gpt-image-2";

/**
 * Document mode: small supporting illustrations, where throughput matters more
 * than resolution and nothing is being blown up to 24 inches.
 */
export const ILLUSTRATION_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/**
 * Limits measured against the live gateway, not taken from docs.
 *
 * - `aspectRatio` is silently IGNORED by gpt-image-2 (the SDK warns and you get
 *   a 1254×1254 square regardless). Always pass `size`.
 * - Longest edge must be ≤ 3840: "The longest edge must be less than or equal
 *   to 3840."
 * - There is a further limit that is NOT a clean pixel budget. Measured:
 *     accepted — 1024×1024, 1536×1024, 1024×1536, 1792×1024, 2048×2048,
 *                1792×2400 (4.3 MP), 2160×3840 (8.29 MP)
 *     rejected — 2880×3840 (11.1 MP, "exceeds the current pixel budget"),
 *                4096×4096 (edge cap), 2488×3320 (8.26 MP)
 *   Note 2160×3840 is accepted at 8.29 MP while 2488×3320 is rejected at
 *   8.26 MP — nearly identical pixel counts. So the real rule is probably a
 *   discrete set of supported dimensions rather than an area cap, and the
 *   accepted values are all conventional display resolutions.
 *
 * Rather than guess that set, we request an ambitious size and let the retry in
 * asset-gen step down. Rejections are validation errors and return fast, so a
 * couple of them costs far less than permanently capping resolution low.
 * Pinning the exact rule down is worthwhile follow-up work.
 */
export const IMAGE_MAX_EDGE = 3840;
export const IMAGE_PIXEL_BUDGET = 3840 * 2160;

/**
 * Snap to multiples of 64. Every size observed to be accepted is a multiple of
 * 64, and the two rejected non-standard ones (2488, 3320) are not — so this
 * meaningfully improves the odds of succeeding on the first attempt.
 */
const SIZE_QUANTUM = 64;

export interface ImageSizeRequest {
  width: number;
  height: number;
}

/**
 * Largest generatable size at a given width/height ratio, respecting both the
 * long-edge cap and the pixel budget.
 *
 * `scale` shrinks the request for retry-after-rejection, so a budget we've
 * guessed slightly too high degrades to a smaller image instead of failing.
 */
export function imageSizeForAspect(aspectValue: number, scale = 1): ImageSizeRequest {
  const budget = IMAGE_PIXEL_BUDGET * scale * scale;

  // Start at the budget boundary for this ratio: w * h = budget, w / h = aspect.
  let width = Math.sqrt(budget * aspectValue);
  let height = width / aspectValue;

  // Then pull back if either edge blew the cap.
  const maxEdge = IMAGE_MAX_EDGE * scale;
  const longest = Math.max(width, height);
  if (longest > maxEdge) {
    const k = maxEdge / longest;
    width *= k;
    height *= k;
  }

  return { width: quantize(width), height: quantize(height) };
}

function quantize(v: number) {
  // Round DOWN so quantizing can never push us back over a limit.
  return Math.max(SIZE_QUANTUM, Math.floor(v / SIZE_QUANTUM) * SIZE_QUANTUM);
}

export function formatSize(s: ImageSizeRequest): `${number}x${number}` {
  return `${s.width}x${s.height}`;
}

/** True when the provider rejected the request for being too large. */
export function isSizeRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pixel budget|longest edge|invalid size/i.test(msg);
}
