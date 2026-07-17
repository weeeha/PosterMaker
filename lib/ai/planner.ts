import { generateObject } from "ai";
import { z } from "zod";
import { PLANNER_MODEL } from "./gateway";
import type { Canvas } from "../poster/types";
import { safeRegion } from "../poster/dimensions";

export const PosterPlanSchema = z.object({
  title: z
    .string()
    .describe("Short title for this poster, 1-6 words. Used as the project name."),
  styleGuide: z.object({
    palette: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .min(2)
      .max(6)
      .describe(
        "Hex color codes. First color is the dominant background. Last color is the highest-contrast text/accent.",
      ),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe("Hex color for the canvas background. Pick from palette."),
    foreground: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe(
        "Hex color for the primary body text. Must contrast strongly with background.",
      ),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe(
        "Hex color used for headings, dividers, and key callouts. Distinct from foreground.",
      ),
    mood: z.string().describe("One short sentence describing the visual mood."),
    typography: z.object({
      headingFamily: z
        .enum(["sans", "mono", "serif"])
        .describe("Font family for headings."),
      bodyFamily: z
        .enum(["sans", "mono", "serif"])
        .describe("Font family for body text."),
    }),
  }),
  assetsToGenerate: z
    .array(
      z.object({
        role: z
          .string()
          .describe("Short label for this asset, e.g. 'hero', 'icon-keyboard'."),
        prompt: z
          .string()
          .describe(
            "Full image generation prompt. Include style descriptors so the asset matches the rest of the poster.",
          ),
        aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      }),
    )
    .describe(
      "Generated illustrations. Empty array is fine for purely text-based knowledge posters.",
    ),
  blocks: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("text"),
          role: z
            .string()
            .describe(
              "Short semantic role: 'title', 'subtitle', 'category-heading', 'body', 'caption'.",
            ),
          text: z
            .string()
            .describe(
              "Plain text content. Use \\n for line breaks within a single block.",
            ),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          w: z.number().min(0).max(1),
          h: z.number().min(0).max(1),
          fontSizePt: z
            .number()
            .min(6)
            .max(200)
            .describe(
              "Font size in points. Title ~48-96, headings ~24-40, body ~10-16.",
            ),
          weight: z
            .number()
            .int()
            .min(100)
            .max(900)
            .describe("Font weight (100-900). 400=regular, 700=bold."),
          align: z.enum(["left", "center", "right"]),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .describe("Hex text color. Pick from palette."),
          fontFamily: z.enum(["sans", "mono", "serif"]),
          lineHeight: z.number().min(0.8).max(2),
        }),
        z.object({
          kind: z.literal("image"),
          assetRole: z
            .string()
            .describe("Must match the 'role' of one entry in assetsToGenerate."),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          w: z.number().min(0).max(1),
          h: z.number().min(0).max(1),
          fit: z.enum(["cover", "contain"]),
        }),
        z.object({
          kind: z.literal("shape"),
          shape: z.enum(["rect", "divider"]),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          w: z.number().min(0).max(1),
          h: z.number().min(0).max(1),
          fill: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          stroke: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          strokeWidthPt: z.number().min(0.25).max(20).optional(),
        }),
      ]),
    )
    .min(1)
    .describe(
      "All layout blocks for the poster, in z-order from back to front. Positions in 0..1 canvas-relative units.",
    ),
});

export type PosterPlan = z.infer<typeof PosterPlanSchema>;

export function buildPlannerSystemPrompt(canvas: Canvas) {
  const safe = safeRegion(canvas);
  return `You are a senior print poster designer. You design layouts for a ${canvas.widthIn}×${canvas.heightIn} inch poster printed at ${canvas.dpi} DPI on a large-format printer.

Output a complete poster plan as a single JSON object that matches the provided schema.

CANVAS RULES
- All block positions are in canvas-relative units, 0..1.
- (0, 0) is top-left, (1, 1) is bottom-right.
- The active "safe area" for ALL text is x ∈ [${safe.xMin.toFixed(3)}, ${safe.xMax.toFixed(3)}] and y ∈ [${safe.yMin.toFixed(3)}, ${safe.yMax.toFixed(3)}]. Never put text outside this region — it will be cut off by the printer trim.
- Background-colored shapes (full bleeds, headers, footers) MAY extend to the full 0..1 region.
- Blocks MAY overlap. Order them back-to-front (background first, foreground last).

DESIGN RULES
- Pick a cohesive palette of 2–6 colors. The first palette color must be the background; ensure WCAG AA contrast for body text.
- For knowledge / reference posters: organize content into clearly labeled categories with category headings, then dense bullet lists or definition tables. Use generous whitespace between categories.
- Title should be the largest text on the canvas (60–120pt). Category headings 24–40pt. Body 10–18pt.
- Use dividers (kind:"shape", shape:"divider") between major sections — usually 1pt strokes in the accent color.
- Use illustrations only when they meaningfully aid comprehension. A pure-text reference card needs zero illustrations.
- For each illustration, write a self-contained prompt that includes style descriptors so it harmonizes with the poster (palette, line weight, vibe).

OUTPUT
- Be specific. Use the exact hex codes from your palette in every color field.
- The "title" you return is the project's display name (1–6 words).
- Validate every block's coordinates: x + w ≤ 1, y + h ≤ 1, all values ≥ 0.`;
}

export async function planPoster({
  canvas,
  brief,
  history,
}: {
  canvas: Canvas;
  brief: string;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const messages: Array<
    | { role: "system"; content: string }
    | { role: "user" | "assistant"; content: string }
  > = [
    { role: "system", content: buildPlannerSystemPrompt(canvas) },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: brief },
  ];

  const { object } = await generateObject({
    model: PLANNER_MODEL,
    schema: PosterPlanSchema,
    messages,
  });

  return object;
}
