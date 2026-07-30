import { put, head, list, BlobNotFoundError } from "@vercel/blob";
import type { PosterProject, ProjectIndexEntry, ProjectId } from "./types";
import { normalizeProject } from "./migrate";

const PROJECT_KEY = (id: ProjectId) => `projects/${id}/project.json`;
const ASSETS_PREFIX = (id: ProjectId) => `projects/${id}/assets/`;
const EXPORTS_PREFIX = (id: ProjectId) => `projects/${id}/exports/`;
const INDEX_KEY = "projects/_index.json";

const PUT_OPTS = {
  access: "public" as const,
  addRandomSuffix: false,
  allowOverwrite: true,
};

/**
 * Defeat the CDN cache on mutable JSON reads.
 *
 * Blob clamps `cacheControlMaxAge: 0` up to `max-age=60`, so a blob URL can
 * serve content up to a minute old. That was observed in practice: the gallery
 * displayed a title that had already been overwritten. A unique query string
 * makes each read a distinct cache key, so we always reach the origin.
 *
 * This applies to project state only, never to assets or exports — those are
 * immutable once written and should stay cacheable.
 */
function fresh(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
}

export async function readProject(id: ProjectId): Promise<PosterProject | null> {
  try {
    const meta = await head(PROJECT_KEY(id));
    const res = await fetch(fresh(meta.url), { cache: "no-store" });
    if (!res.ok) return null;
    return normalizeProject(await res.json());
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

export async function writeProject(project: PosterProject): Promise<void> {
  const body = JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2);
  await put(PROJECT_KEY(project.id), body, {
    ...PUT_OPTS,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
  await upsertIndexEntry({
    id: project.id,
    title: project.title,
    updatedAt: new Date().toISOString(),
  });
}

type BinaryBody = Uint8Array | ArrayBuffer | Buffer | Blob;

function toBuffer(body: BinaryBody): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  // Blob path: caller should arrayBuffer() it themselves; cast for the rare case.
  return body as unknown as Buffer;
}

export async function uploadAsset(
  id: ProjectId,
  assetId: string,
  body: BinaryBody,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const ext = contentType.split("/")[1]?.split(";")[0] ?? "bin";
  const pathname = `${ASSETS_PREFIX(id)}${assetId}.${ext}`;
  const blob = await put(pathname, toBuffer(body), { ...PUT_OPTS, contentType });
  return { url: blob.url, pathname };
}

export async function uploadExport(
  id: ProjectId,
  body: BinaryBody,
  contentType = "application/pdf",
): Promise<{ url: string; pathname: string }> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const pathname = `${EXPORTS_PREFIX(id)}${ts}.pdf`;
  const blob = await put(pathname, toBuffer(body), { ...PUT_OPTS, contentType });
  return { url: blob.url, pathname };
}

export async function readIndex(): Promise<ProjectIndexEntry[]> {
  try {
    const meta = await head(INDEX_KEY);
    const res = await fetch(fresh(meta.url), { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as ProjectIndexEntry[];
  } catch (err) {
    if (err instanceof BlobNotFoundError) return [];
    throw err;
  }
}

async function writeIndex(entries: ProjectIndexEntry[]): Promise<void> {
  await put(INDEX_KEY, JSON.stringify(entries, null, 2), {
    ...PUT_OPTS,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function upsertIndexEntry(entry: ProjectIndexEntry): Promise<void> {
  const entries = await readIndex();
  const filtered = entries.filter((e) => e.id !== entry.id);
  filtered.unshift(entry);
  await writeIndex(filtered);
}

export async function listProjectAssets(id: ProjectId) {
  const result = await list({ prefix: ASSETS_PREFIX(id) });
  return result.blobs;
}

/** Cap parallel blob reads so a big library doesn't open dozens of sockets. */
const LIST_CONCURRENCY = 8;

/**
 * Load every project in full, newest first.
 *
 * The gallery renders real posters at their true aspect ratios, which needs
 * layout and assets — not just the title in `_index.json`. Reading each
 * project.json directly also means titles are always current, since it does not
 * depend on the mutable index blob staying in sync.
 *
 * A project whose blob is missing or unparseable is skipped rather than taking
 * the whole gallery down with it.
 */
export async function listProjects(): Promise<PosterProject[]> {
  const { blobs } = await list({ prefix: "projects/" });
  const targets = blobs.filter((b) => b.pathname.endsWith("/project.json"));

  const loaded: PosterProject[] = [];
  const queue = [...targets];

  async function worker() {
    while (queue.length > 0) {
      const blob = queue.shift();
      if (!blob) return;
      try {
        const res = await fetch(fresh(blob.url), { cache: "no-store" });
        if (!res.ok) continue;
        loaded.push(normalizeProject(await res.json()));
      } catch (err) {
        console.error(`Skipping unreadable project ${blob.pathname}:`, err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(LIST_CONCURRENCY, targets.length) }, worker),
  );

  return loaded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
