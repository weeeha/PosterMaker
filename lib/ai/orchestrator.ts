import { createUIMessageStream, type UIMessageStreamWriter } from "ai";
import { nanoid } from "nanoid";
import { planPoster, type PosterPlan } from "./planner";
import { generateAssets } from "./asset-gen";
import { readProject, writeProject } from "../poster/storage";
import type { PosterUIMessage } from "./messages";
import type { Asset, Block, Layout, PosterProject } from "../poster/types";

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

  const ts = new Date().toISOString();
  project.brief.prompt = userMessage;
  project.brief.history.push({ role: "user", content: userMessage, ts });

  writer.write({
    type: "data-status",
    id: "status",
    data: { phase: "planning", note: "Designing layout…" },
  });

  const historyBeforeThisTurn = project.brief.history.slice(0, -1);

  const plan = await planPoster({
    canvas: project.canvas,
    brief: userMessage,
    history: historyBeforeThisTurn.map((t) => ({ role: t.role, content: t.content })),
  });

  writer.write({ type: "data-plan", id: "plan", data: { plan } });

  const totalAssets = plan.assetsToGenerate.length;
  writer.write({
    type: "data-status",
    id: "status",
    data: {
      phase: "generating-assets",
      note: totalAssets === 0 ? "No illustrations needed." : `Generating ${totalAssets} illustration${totalAssets === 1 ? "" : "s"}…`,
    },
  });
  if (totalAssets > 0) {
    writer.write({
      type: "data-progress",
      id: "progress",
      data: { current: 0, total: totalAssets, label: "Illustrations" },
    });
  }

  const assetsByRole = new Map<string, Asset>();
  let completed = 0;

  await generateAssets({
    projectId,
    specs: plan.assetsToGenerate.map((a) => ({
      role: a.role,
      prompt: a.prompt,
      aspectRatio: a.aspectRatio,
    })),
    signal,
    onAsset: ({ asset, role }) => {
      assetsByRole.set(role, asset);
      completed += 1;
      writer.write({
        type: "data-asset",
        id: `asset-${asset.id}`,
        data: { role, asset },
      });
      writer.write({
        type: "data-progress",
        id: "progress",
        data: { current: completed, total: totalAssets, label: "Illustrations" },
      });
    },
  });

  writer.write({
    type: "data-status",
    id: "status",
    data: { phase: "composing", note: "Composing layout…" },
  });

  const layout: Layout = {
    blocks: planBlocksToLayout(plan, assetsByRole),
    layoutVersion: new Date().toISOString(),
  };

  const updated: PosterProject = {
    ...project,
    title: plan.title || project.title,
    canvas: {
      ...project.canvas,
      background: { kind: "solid", color: plan.styleGuide.background },
      palette: plan.styleGuide.palette,
    },
    assets: [...project.assets, ...assetsByRole.values()],
    layout,
    brief: {
      ...project.brief,
      styleNotes: plan.styleGuide.mood,
      history: [
        ...project.brief.history,
        {
          role: "assistant",
          content: composeAssistantSummary(plan, totalAssets),
          ts: new Date().toISOString(),
        },
      ],
    },
  };

  writer.write({
    type: "data-status",
    id: "status",
    data: { phase: "saving", note: "Saving project…" },
  });

  await writeProject(updated);

  writer.write({
    type: "data-layout",
    id: "layout",
    data: {
      layout,
      palette: plan.styleGuide.palette,
      background: plan.styleGuide.background,
      title: updated.title,
    },
  });
  writer.write({
    type: "data-status",
    id: "status",
    data: { phase: "done" },
  });
}

function planBlocksToLayout(
  plan: PosterPlan,
  assetsByRole: Map<string, Asset>,
): Block[] {
  return plan.blocks
    .map((b, idx): Block | null => {
      if (b.kind === "text") {
        return {
          id: nanoid(8),
          kind: "text",
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          z: idx,
          text: b.text,
          fontFamily: b.fontFamily,
          fontSizePt: b.fontSizePt,
          weight: b.weight,
          color: b.color,
          align: b.align,
          lineHeight: b.lineHeight,
        };
      }
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

function composeAssistantSummary(plan: PosterPlan, totalAssets: number) {
  const blockCount = plan.blocks.length;
  const parts = [
    `Composed "${plan.title}" with ${blockCount} block${blockCount === 1 ? "" : "s"}`,
  ];
  if (totalAssets > 0) parts.push(`${totalAssets} illustration${totalAssets === 1 ? "" : "s"}`);
  parts.push(`palette ${plan.styleGuide.palette.join(", ")}`);
  return parts.join(". ") + ".";
}
