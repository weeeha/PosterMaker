import { generateObject } from "ai";
import { z } from "zod";
import { PLANNER_MODEL } from "./gateway";
import type { Canvas } from "../poster/types";
import { designRegion } from "../poster/dimensions";
import { mediaAspect, mediaOrDefault } from "../poster/media";

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const StyleGuideSchema = z.object({
  palette: z
    .array(HEX)
    .min(2)
    .max(6)
    .describe(
      "Hex color codes. First color is the dominant background. Last color is the highest-contrast text/accent.",
    ),
  background: HEX.describe("Hex color for the canvas background. Pick from palette."),
  foreground: HEX.describe(
    "Hex color for the primary body text. Must contrast strongly with background.",
  ),
  accent: HEX.describe(
    "Hex color used for headings, dividers, and key callouts. Distinct from foreground.",
  ),
  mood: z.string().describe("One short sentence describing the visual mood."),
  typography: z.object({
    headingFamily: z.enum(["sans", "mono", "serif"]).describe("Font family for headings."),
    bodyFamily: z.enum(["sans", "mono", "serif"]).describe("Font family for body text."),
  }),
});

export type StyleGuide = z.infer<typeof StyleGuideSchema>;

const TextBlockSchema = z.object({
  kind: z.literal("text"),
  role: z
    .string()
    .describe(
      "Short semantic role: 'title', 'subtitle', 'category-heading', 'body', 'caption'.",
    ),
  text: z
    .string()
    .describe("Plain text content. Use \\n for line breaks within a single block."),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  fontSizePt: z
    .number()
    .min(6)
    .max(300)
    .describe("Font size in points. Title ~48-96, headings ~24-40, body ~10-16."),
  weight: z.number().int().min(100).max(900).describe("Font weight. 400=regular, 700=bold."),
  align: z.enum(["left", "center", "right"]),
  color: HEX.describe("Hex text color. Pick from palette."),
  fontFamily: z.enum(["sans", "mono", "serif"]),
  lineHeight: z.number().min(0.8).max(2),
});

const ImageBlockSchema = z.object({
  kind: z.literal("image"),
  assetRole: z.string().describe("Must match the 'role' of one entry in assetsToGenerate."),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  fit: z.enum(["cover", "contain"]),
});

const ShapeBlockSchema = z.object({
  kind: z.literal("shape"),
  shape: z.enum(["rect", "divider"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  fill: HEX.optional(),
  stroke: HEX.optional(),
  strokeWidthPt: z.number().min(0.25).max(20).optional(),
});

/** Layout-first: type, tables, diagrams. Illustrations are optional garnish. */
export const DocumentPlanSchema = z.object({
  title: z
    .string()
    .describe("Short title for this poster, 1-6 words. Used as the project name."),
  styleGuide: StyleGuideSchema,
  assetsToGenerate: z
    .array(
      z.object({
        role: z.string().describe("Short label for this asset, e.g. 'hero', 'icon-keyboard'."),
        prompt: z
          .string()
          .describe(
            "Full image generation prompt. Include style descriptors so the asset matches the poster.",
          ),
        aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]),
      }),
    )
    .describe("Supporting illustrations. An empty array is correct for pure-text posters."),
  blocks: z
    .array(
      z.discriminatedUnion("kind", [TextBlockSchema, ImageBlockSchema, ShapeBlockSchema]),
    )
    .min(1)
    .describe(
      "All layout blocks, in z-order back to front. Positions in 0..1 canvas-relative units.",
    ),
});

export type DocumentPlan = z.infer<typeof DocumentPlanSchema>;

/**
 * Image-first: one generated image fills the sheet.
 *
 * Deliberately has no `blocks` array for the artwork itself — the orchestrator
 * synthesises the full-page image block. The model only decides what the image
 * IS, plus any type laid over it.
 */
export const ArtPlanSchema = z.object({
  title: z
    .string()
    .describe("Short title for this poster, 1-6 words. Used as the project name."),
  styleGuide: StyleGuideSchema,
  imagePrompt: z
    .string()
    .describe(
      "The complete image-generation prompt for the artwork. Self-contained and highly specific: subject, composition, palette, medium, lighting, line quality, mood. This is the whole poster, so describe a composition that works at the given aspect ratio.",
    ),
  overlay: z
    .array(TextBlockSchema)
    .describe(
      "Type laid OVER the artwork. Usually empty — most art posters need no text. Only add type if the brief explicitly asks for it.",
    ),
});

export type ArtPlan = z.infer<typeof ArtPlanSchema>;

/**
 * Shared print-hardware constraints.
 *
 * The light-background bias is a hardware fact, not taste: the TC-21 is a 4-ink
 * CMYK pigment printer with no photo black, so a full-sheet dark flood is slow,
 * ink-hungry, and prone to bronzing and banding.
 */
function printerRules(canvas: Canvas) {
  const media = mediaOrDefault(canvas.mediaId);
  const region = designRegion(canvas);
  return `PRINTER AND PAGE
- Printed on a Canon imagePROGRAF TC-21 at ${canvas.widthIn}×${canvas.heightIn} inches (${media.label}, ${canvas.orientation}).
- The printer CANNOT print within ${(canvas.printableInsetIn * 25.4).toFixed(1)}mm of any edge. There is no borderless mode and nothing is trimmed afterwards.
- All positions are canvas-relative 0..1 units. (0,0) is top-left, (1,1) bottom-right.
- Keep ALL content inside x ∈ [${region.xMin.toFixed(3)}, ${region.xMax.toFixed(3)}], y ∈ [${region.yMin.toFixed(3)}, ${region.yMax.toFixed(3)}]. Outside that is margin or unprintable.
- This is a 4-ink CMYK pigment printer with no photo black. Prefer LIGHT backgrounds with dark type. Large dark floods are slow, drink ink, and band on plain paper — only use one if the brief explicitly asks for a dark poster.
- Ensure WCAG AA contrast between body text and its background.`;
}

export function buildDocumentPrompt(canvas: Canvas) {
  const oneLineAt12pt = ((12 * 1.4) / 72 / canvas.heightIn).toFixed(4);
  return `You are a senior information designer laying out a print reference poster.

Output a complete poster plan as a single JSON object matching the provided schema.

${printerRules(canvas)}

LAYOUT RULES
- Organize content into clearly labeled categories: a category heading, then dense bullet lists or definition rows.
- Title is the largest text on the canvas (60–120pt). Category headings 24–40pt. Body 10–18pt.
- Use dividers (kind:"shape", shape:"divider") between major sections, usually 1pt strokes in the accent color.
- Blocks may overlap; order them back-to-front (background first, foreground last).
- Background-colored rects may cover the full 0..1 region even though text may not.

SIZING TEXT BLOCKS — READ CAREFULLY
- Text is NOT auto-shrunk to fit. Too little height means the block overflows and collides with whatever is below it.
- Estimate honestly: a line of N-point text occupies about N × lineHeight points, and 1 inch = 72 points. On this ${canvas.heightIn}in tall canvas, one 12pt line at lineHeight 1.4 is about ${oneLineAt12pt} in 0..1 units.
- Count the lines your text will wrap to at the block's width, then allocate that height plus ~15% slack.
- Prefer fewer, larger blocks over many tiny ones. Leave generous whitespace between categories.

ILLUSTRATIONS
- Use them only when they genuinely aid comprehension. A pure-text reference card needs zero — return an empty array.
- Each prompt must be self-contained, including style descriptors so the asset harmonizes with the poster.

OUTPUT
- Use exact hex codes from your palette in every color field.
- "title" is the project's display name (1–6 words).
- Validate every block: x + w ≤ 1, y + h ≤ 1, all values ≥ 0.`;
}

export function buildArtPrompt(canvas: Canvas) {
  const media = mediaOrDefault(canvas.mediaId);
  const aspect = mediaAspect(media, canvas.orientation);
  const keepOutMm = ((canvas.printableInsetIn + canvas.marginIn) * 25.4).toFixed(0);
  return `You are an art director commissioning a single piece of poster art.

Output a plan as a single JSON object matching the provided schema.

${printerRules(canvas)}

THE ARTWORK
- The image is generated at ${aspect} to exactly fill the sheet, so compose for that shape. A tall ${aspect} canvas wants a different composition from a square one — say so in the prompt.
- Write ONE self-contained imagePrompt. Be specific about subject, composition and focal point, palette, medium and technique, lighting, line quality, and mood. Vague prompts produce generic results.
- Name the palette colors in the prompt so artwork and type agree.
- Do NOT ask for text, lettering, titles, or captions inside the image — image models render text badly. Type goes in "overlay", where it prints as crisp vector.
- Keep the focal subject away from the outer ${keepOutMm}mm: that band is margin or unprintable.

OVERLAY TYPE
- Usually empty. Most art posters are stronger with no type at all.
- Only add overlay blocks if the brief asks for a title, caption, or lettering.
- If you do, make sure it contrasts against the region of artwork it sits on.

OUTPUT
- "title" is the project's display name (1–6 words).
- styleGuide.background is shown behind the artwork; pick the artwork's dominant tone so any letterboxing is invisible.`;
}

type History = { role: "user" | "assistant"; content: string }[];

async function runPlanner<T>(args: {
  system: string;
  schema: z.ZodType<T>;
  brief: string;
  history: History;
}): Promise<T> {
  const { object } = await generateObject({
    model: PLANNER_MODEL,
    schema: args.schema,
    messages: [
      { role: "system" as const, content: args.system },
      ...args.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: args.brief },
    ],
  });
  return object;
}

export function planDocument(args: { canvas: Canvas; brief: string; history: History }) {
  return runPlanner({
    system: buildDocumentPrompt(args.canvas),
    schema: DocumentPlanSchema,
    brief: args.brief,
    history: args.history,
  });
}

export function planArt(args: { canvas: Canvas; brief: string; history: History }) {
  return runPlanner({
    system: buildArtPrompt(args.canvas),
    schema: ArtPlanSchema,
    brief: args.brief,
    history: args.history,
  });
}
