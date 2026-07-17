import { notFound } from "next/navigation";
import { readProject } from "@/lib/poster/storage";
import { PosterCanvas } from "@/lib/poster/render";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const printMode = sp.print === "1";
  const project = await readProject(id);
  if (!project) notFound();

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: printMode ? "transparent" : "#111",
      }}
    >
      <PosterCanvas project={project} showGuides={false} />
    </div>
  );
}
