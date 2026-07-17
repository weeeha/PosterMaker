import { notFound } from "next/navigation";
import { readProject } from "@/lib/poster/storage";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) notFound();
  return <WorkspaceShell initialProject={project} />;
}
