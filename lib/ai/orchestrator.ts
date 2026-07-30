import { createUIMessageStream, type UIMessageStreamWriter } from "ai";
import { nanoid } from "nanoid";
import { planArt, planDocument, type ArtPlan, type DocumentPlan, type StyleGuide } from "./planner";
import { generateAssets } from "./asset-gen";
import { imageSizeForAspect } from "./gateway";
import { readProject, writeProject } from "../poster/storage";
import { mediaAspectValue, mediaOrDefault } from "../poster/media";
import type { PlanSummary, PosterUIMessage } from "./messages";
import type { Asset, Block, Canvas, PosterProject, TextBlock } from "../poster/types";

export function createOrchestrationStream(args: {
  projectId: string;
  userMessage: string;
  signal?: AbortSignal;
}) {
  return createUIMessageStream<PosterUIMessage>({
    execute: async ({ writer }) => {
      try {
        await runOrchestration({ ...args, writer });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("orchestrator error:", err);
        writer.write({ type: "data-error", data: { message }, transient: true });
      }
    },
  });
}

interface Ctx {
  project: PosterProject;
  userMessage: string;
  writer: UIMessageStreamWriter<PosterUIMessage>;
  signal?: AbortSignal;
}

async function runOrchestration({
  projectId,
  userMessage,
  writer,
  signal,
}: {
  projectId: string;
  userMessage: string;
  writer: UIMessageStreamWriter<PosterUIMessage>;
  signal?: AbortSignal;
}) {
  const project = await readProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  project.brief.prompt = userMessage;
  project.brief.history.push({
    role: "user",
    content: userMessage,
    ts: new Date().toISOString(),
  });

  const ctx: Ctx = { project, userMessage, writer, signal };

  // The two intents are genuinely different pipelines, not one pipeline with a
  // different prompt: art mode generates a single sheet-filling image and
  // synthesises its own layout, document mode lays out type and may skip images.
  const updated =
    project.brief.intent === "art" ? await runArt(ctx) : await runDocument(ctx);

  status(writer, "saving", "Saving project…");
  await writeProject(updated);

  writer.write({
    type: "data-layout",
    id: "layout",
    data: { layout: updated.layout, canvas: updated.canvas, title: updated.title },
  });
  status(writer, "done");
}

/* ------------------------------------------------------------------ art ---- */

async function runArt({ project, userMessage, writer, signal }: Ctx): Promise<PosterProject> {
  status(writer, "planning", "Art-directing the piece…");

  const plan = await planArt({
    canvas: project.canvas,
    brief: userMessage,
    history: historyBefore(project),
  });

  writer.write({
    type: "data-plan",
    id: "plan",
    data: { plan: summarizeArt(plan) },
  });

  // Ask for the sheet's exact aspect at the largest size the model allows, so
  // the artwork fills the page without cropping.
  const media = mediaOrDefault(project.canvas.mediaId);
  const aspect = mediaAspectValue(media, project.canvas.orientation);
  const size = imageSizeForAspect(aspect);

  status(
    writer,
    "generating-assets",
    `Generating artwork at ${size.width}×${size.height}…`,
  );
  writer.write({
    type: "data-progress",
    id: "progress",
    data: { current: 0, total: 1, label: "Artwork" },
  });

  const generated = await generateAssets({
    projectId: project.id,
    specs: [{ role: "artwork", prompt: plan.imagePrompt, size }],
    signal,
    onAsset: ({ asset, role }) => {
      writer.write({ type: "data-asset", id: `asset-${asset.id}`, data: { role, asset } });
      writer.write({
        type: "data-progress",
        id: "progress",
        data: { current: 1, total: 1, label: "Artwork" },
      });
    },
  });

  status(writer, "composing", "Composing sheet…");

  const artwork = generated[0]?.asset;
  const blocks: Block[] = [];

  if (artwork) {
    // The artwork covers the whole sheet. `cover` rather than `contain` because
    // the requested aspect already matches the page; cover only bites if the
    // provider quantised the dimensions slightly.
    blocks.push({
      id: nanoid(8),
      kind: "image",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      z: 0,
      assetId: artwork.id,
      fit: "cover",
    });
  }

  blocks.push(...plan.overlay.map((b, i) => toTextBlock(b, i + 1)));

  return {
    ...project,
    title: plan.title || project.title,
    canvas: applyStyleGuide(project.canvas, plan.styleGuide),
    assets: [...project.assets, ...(artwork ? [artwork] : [])],
    layout: { blocks, layoutVersion: new Date().toISOString() },
    brief: withAssistantTurn(
      project,
      plan.styleGuide.mood,
      artwork
        ? `Generated "${plan.title}" as a single ${artwork.widthPx}×${artwork.heightPx} artwork filling the sheet.`
        : `Planned "${plan.title}", but artwork generation failed. Try again or adjust the brief.`,
    ),
  };
}

/* ------------------------------------------------------------- document ---- */

async function runDocument({
  project,
  userMessage,
  writer,
  signal,
}: Ctx): Promise<PosterProject> {
  status(writer, "planning", "Designing layout…");

  const plan = await planDocument({
    canvas: project.canvas,
    brief: userMessage,
    history: historyBefore(project),
  });

  writer.write({ type: "data-plan", id: "plan", data: { plan: summarizeDocument(plan) } });

  const total = plan.assetsToGenerate.length;
  status(
    writer,
    "generating-assets",
    total === 0
      ? "No illustrations needed."
      : `Generating ${total} illustration${total === 1 ? "" : "s"}…`,
  );
  if (total > 0) {
    writer.write({
      type: "data-progress",
      id: "progress",
      data: { current: 0, total, label: "Illustrations" },
    });
  }

  const assetsByRole = new Map<string, Asset>();
  let completed = 0;

  await generateAssets({
    projectId: project.id,
    specs: plan.assetsToGenerate.map((a) => ({
      role: a.role,
      prompt: a.prompt,
      aspectRatio: a.aspectRatio,
    })),
    signal,
    onAsset: ({ asset, role }) => {
      assetsByRole.set(role, asset);
      completed += 1;
      writer.write({ type: "data-asset", id: `asset-${asset.id}`, data: { role, asset } });
      writer.write({
        type: "data-progress",
        id: "progress",
        data: { current: completed, total, label: "Illustrations" },
      });
    },
  });

  status(writer, "composing", "Composing layout…");

  const blocks = documentBlocks(plan, assetsByRole);

  return {
    ...project,
    title: plan.title || project.title,
    canvas: applyStyleGuide(project.canvas, plan.styleGuide),
    assets: [...project.assets, ...assetsByRole.values()],
    layout: { blocks, layoutVersion: new Date().toISOString() },
    brief: withAssistantTurn(
      project,
      plan.styleGuide.mood,
      `Composed "${plan.title}" with ${blocks.length} block${blocks.length === 1 ? "" : "s"}` +
        (total > 0 ? ` and ${total} illustration${total === 1 ? "" : "s"}.` : "."),
    ),
  };
}

function documentBlocks(plan: DocumentPlan, assetsByRole: Map<string, Asset>): Block[] {
  return plan.blocks
    .map((b, idx): Block | null => {
      if (b.kind === "text") return toTextBlock(b, idx);
      if (b.kind === "shape") {
        return {
          id: nanoid(8),
          kind: "shape",
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          z: idx,
          shape: b.shape,
          fill: b.fill,
          stroke: b.stroke,
          strokeWidthPt: b.strokeWidthPt,
        };
      }
      const asset = assetsByRole.get(b.assetRole);
      if (!asset) return null;
      return {
        id: nanoid(8),
        kind: "image",
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        z: idx,
        assetId: asset.id,
        fit: b.fit,
      };
    })
    .filter((b): b is Block => b !== null);
}

/* ---------------------------------------------------------------- shared --- */

type PlannedText = Omit<TextBlock, "id" | "kind" | "z"> & { role?: string };

function toTextBlock(b: PlannedText, z: number): TextBlock {
  return {
    id: nanoid(8),
    kind: "text",
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    z,
    text: b.text,
    fontFamily: b.fontFamily,
    fontSizePt: b.fontSizePt,
    weight: b.weight,
    color: b.color,
    align: b.align,
    lineHeight: b.lineHeight,
  };
}

/** Style guide affects colors only — never the media size the user chose. */
function applyStyleGuide(canvas: Canvas, style: StyleGuide): Canvas {
  return {
    ...canvas,
    background: { kind: "solid", color: style.background },
    palette: style.palette,
  };
}

function historyBefore(project: PosterProject) {
  return project.brief.history
    .slice(0, -1)
    .map((t) => ({ role: t.role, content: t.content }));
}

function withAssistantTurn(project: PosterProject, mood: string, content: string) {
  return {
    ...project.brief,
    styleNotes: mood,
    history: [
      ...project.brief.history,
      { role: "assistant" as const, content, ts: new Date().toISOString() },
    ],
  };
}

function summarizeArt(plan: ArtPlan): PlanSummary {
  return {
    kind: "art",
    title: plan.title,
    palette: plan.styleGuide.palette,
    mood: plan.styleGuide.mood,
    imagePrompt: plan.imagePrompt,
  };
}

function summarizeDocument(plan: DocumentPlan): PlanSummary {
  return {
    kind: "document",
    title: plan.title,
    palette: plan.styleGuide.palette,
    mood: plan.styleGuide.mood,
    blockCount: plan.blocks.length,
  };
}

function status(
  writer: UIMessageStreamWriter<PosterUIMessage>,
  phase: "planning" | "generating-assets" | "composing" | "saving" | "done",
  note?: string,
) {
  writer.write({ type: "data-status", id: "status", data: { phase, note } });
}
