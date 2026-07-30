import { generateImage, NoImageGeneratedError } from "ai";
import { nanoid } from "nanoid";
import {
  ART_IMAGE_MODEL,
  ILLUSTRATION_IMAGE_MODEL,
  formatSize,
  imageSizeForAspect,
  isSizeRejection,
  type ImageSizeRequest,
} from "./gateway";
import { uploadAsset } from "../poster/storage";
import { decodeImageSize } from "../poster/image-size";
import type { Asset, ProjectId } from "../poster/types";

export type IllustrationAspect = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export interface AssetSpec {
  role: string;
  prompt: string;
  /**
   * Explicit pixel size. Required for art mode: gpt-image-2 ignores
   * `aspectRatio` outright, so an aspect hint alone silently yields a square.
   */
  size?: ImageSizeRequest;
  /** Aspect hint for models that do honour it (the illustration model does). */
  aspectRatio?: IllustrationAspect;
  model?: string;
  styleKey?: string;
}

export interface GeneratedAsset {
  asset: Asset;
  role: string;
}

/** How many times to shrink and retry when the provider rejects the size. */
const MAX_SIZE_RETRIES = 3;
const SHRINK_FACTOR = 0.85;

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
  const model = spec.model ?? (spec.size ? ART_IMAGE_MODEL : ILLUSTRATION_IMAGE_MODEL);

  const { bytes, mediaType, requested } = await generateWithSizeRetry({
    model,
    spec,
    signal,
  });

  const assetId = nanoid(10);
  const { url } = await uploadAsset(projectId, assetId, bytes, mediaType);

  // Decode the REAL dimensions. Falling back to what we asked for is a last
  // resort and is recorded as such, because every print-resolution warning
  // downstream is only as honest as this number.
  const decoded = decodeImageSize(bytes);
  const dims = decoded ?? requested ?? { width: 0, height: 0 };

  const asset: Asset = {
    id: assetId,
    blobUrl: url,
    kind: "generated",
    widthPx: dims.width,
    heightPx: dims.height,
    provenance: {
      model,
      prompt: spec.prompt,
      styleKey: spec.styleKey,
      requestedSize: requested ? formatSize(requested) : spec.aspectRatio,
      dimensionsSource: decoded ? "decoded" : "requested",
    },
    createdAt: new Date().toISOString(),
  };

  return { asset, role: spec.role };
}

/**
 * Ask for the largest size the provider will accept, shrinking on rejection.
 *
 * The pixel budget isn't documented, so rather than pin a constant we treat a
 * size rejection as the signal to step down and try again.
 */
async function generateWithSizeRetry({
  model,
  spec,
  signal,
}: {
  model: string;
  spec: AssetSpec;
  signal?: AbortSignal;
}) {
  let requested = spec.size;

  for (let attempt = 0; ; attempt++) {
    try {
      const { image } = await generateImage({
        model,
        prompt: spec.prompt,
        abortSignal: signal,
        // Pass exactly one of size / aspectRatio — never both.
        ...(requested
          ? { size: formatSize(requested) }
          : spec.aspectRatio
            ? { aspectRatio: spec.aspectRatio }
            : {}),
      });
      return {
        bytes: image.uint8Array,
        mediaType: image.mediaType ?? "image/png",
        requested,
      };
    } catch (err) {
      const current = requested;
      if (!current || !isSizeRejection(err) || attempt >= MAX_SIZE_RETRIES) throw err;
      const scale = Math.pow(SHRINK_FACTOR, attempt + 1);
      requested = imageSizeForAspect(current.width / current.height, scale);
      console.warn(
        `Size rejected for role=${spec.role}; retrying at ${formatSize(requested)}`,
      );
    }
  }
}
