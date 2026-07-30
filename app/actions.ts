"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import {
  canvasForMedia,
  emptyProject,
  type Canvas,
  type PosterIntent,
} from "@/lib/poster/types";
import { readProject, writeProject } from "@/lib/poster/storage";
import type { Orientation } from "@/lib/poster/media";

export async function createProjectAction(formData?: FormData) {
  const titleInput = formData?.get("title");
  const intentInput = formData?.get("intent");
  const title =
    typeof titleInput === "string" && titleInput.trim().length > 0
      ? titleInput.trim()
      : "Untitled poster";
  const intent: PosterIntent = intentInput === "art" ? "art" : "document";
  const id = nanoid(10);
  await writeProject(emptyProject(id, title, intent));
  revalidatePath("/");
  redirect(`/p/${id}`);
}

/**
 * Change the sheet a project targets.
 *
 * Only the canvas moves. Block coordinates are fractions of the page, so an
 * existing layout reflows onto the new sheet automatically — that is the whole
 * point of storing positions fractionally rather than in inches.
 */
export async function setCanvasMediaAction({
  projectId,
  mediaId,
  orientation,
}: {
  projectId: string;
  mediaId: string;
  orientation: Orientation;
}): Promise<Canvas> {
  const project = await readProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const canvas = canvasForMedia(mediaId, orientation, project.canvas);
  await writeProject({ ...project, canvas });
  revalidatePath(`/p/${projectId}`);
  return canvas;
}
