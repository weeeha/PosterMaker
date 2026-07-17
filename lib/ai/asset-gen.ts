import { generateImage, NoImageGeneratedError } from "ai";
import { nanoid } from "nanoid";
import { IMAGE_MODEL } from "./gateway";
import { uploadAsset } from "../poster/storage";
import type { Asset, ProjectId } from "../poster/types";

export interface AssetSpec {
  role: string;
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  styleKey?: string;
}

export interface GeneratedAsset {
  asset: Asset;
  role: string;
}

export async function generateAssets({
  projectId,
  specs,
  onAsset,
  concurrency = 4,
  signal,
}: {
  projectId: ProjectId;
  specs: AssetSpec[];
  onAsset?: (a: GeneratedAsset) => void | Promise<void>;
  concurrency?: number;
  signal?: AbortSignal;
}): Promise<GeneratedAsset[]> {
  if (specs.length === 0) return [];

  const results: GeneratedAsset[] = [];
  const queue = [...specs];

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const spec = queue.shift();
      if (!spec) return;
      try {
        const generated = await generateOneAsset({ projectId, spec, signal });
        results.push(generated);
        if (onAsset) await onAsset(generated);
      } catch (err) {
        if (NoImageGeneratedError.isInstance(err)) {
          console.error(`Image generation failed for role=${spec.role}:`, err.cause);
        } else {
          console.error(`Asset generation error for role=${spec.role}:`, err);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, specs.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function generateOneAsset({
  projectId,
  spec,
  signal,
}: {
  projectId: ProjectId;
  spec: AssetSpec;
  signal?: AbortSignal;
}): Promise<GeneratedAsset> {
  const { image } = await generateImage({
    model: IMAGE_MODEL,
    prompt: spec.prompt,
    aspectRatio: spec.aspectRatio,
    abortSignal: signal,
  });

  const bytes = image.uint8Array;
  const mediaType = image.mediaType ?? "image/png";
  const assetId = nanoid(10);
  const { url } = await uploadAsset(projectId, assetId, bytes, mediaType);

  const { width, height } = aspectToPixels(spec.aspectRatio);

  const asset: Asset = {
    id: assetId,
    blobUrl: url,
    kind: "generated",
    widthPx: width,
    heightPx: height,
    provenance: {
      model: IMAGE_MODEL,
      prompt: spec.prompt,
      styleKey: spec.styleKey,
    },
    createdAt: new Date().toISOString(),
  };

  return { asset, role: spec.role };
}

function aspectToPixels(aspect: AssetSpec["aspectRatio"]): { width: number; height: number } {
  const [a, b] = aspect.split(":").map(Number);
  if (a === b) return { width: 1024, height: 1024 };
  const long = 1280;
  const short = Math.round((long * Math.min(a, b)) / Math.max(a, b));
  return a > b
    ? { width: long, height: short }
    : { width: short, height: long };
}
