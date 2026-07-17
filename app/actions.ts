"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { emptyProject } from "@/lib/poster/types";
import { writeProject } from "@/lib/poster/storage";

export async function createProjectAction(formData?: FormData) {
  const titleInput = formData?.get("title");
  const title = typeof titleInput === "string" && titleInput.trim().length > 0 ? titleInput.trim() : "Untitled poster";
  const id = nanoid(10);
  await writeProject(emptyProject(id, title));
  revalidatePath("/");
  redirect(`/p/${id}`);
}
