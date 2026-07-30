import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileImage, ImageIcon, LayoutTemplate } from "lucide-react";
import { listProjects } from "@/lib/poster/storage";
import { mediaAspect, mediaOrDefault } from "@/lib/poster/media";
import type { PosterProject } from "@/lib/poster/types";
import { PosterThumb } from "@/components/gallery/poster-thumb";
import { createProjectAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Mode is chosen at creation rather than switched later, because the two intents
 * run different pipelines — an art project's layout is a single full-page image
 * block, a document's is dozens of type blocks. Converting between them would
 * throw the work away, so make it an explicit choice up front.
 */
function NewProjectCard({
  intent,
  title,
  blurb,
  icon,
}: {
  intent: "document" | "art";
  title: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  return (
    <form action={createProjectAction}>
      <input type="hidden" name="intent" value={intent} />
      <button
        type="submit"
        className="hover:border-foreground/40 hover:bg-muted/40 flex h-full w-full flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          New {title.toLowerCase()}
        </span>
        <span className="text-muted-foreground text-xs leading-relaxed">{blurb}</span>
      </button>
    </form>
  );
}

function PosterTile({ project }: { project: PosterProject }) {
  const media = mediaOrDefault(project.canvas.mediaId);
  const isArt = project.brief.intent === "art";

  return (
    <Link
      href={`/p/${project.id}`}
      className="group hover:border-foreground/40 mb-4 block break-inside-avoid overflow-hidden rounded-lg border transition-colors"
    >
      <PosterThumb project={project} />
      <div className="space-y-1 px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{project.title}</h2>
          {isArt ? (
            <ImageIcon className="text-muted-foreground size-3 shrink-0" />
          ) : (
            <LayoutTemplate className="text-muted-foreground size-3 shrink-0" />
          )}
        </div>
        <p className="text-muted-foreground font-mono text-[10px]">
          {project.canvas.widthIn}×{project.canvas.heightIn}in ·{" "}
          {mediaAspect(media, project.canvas.orientation)}
        </p>
        <p className="text-muted-foreground text-[10px]">
          {new Date(project.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  let projects: PosterProject[] = [];
  let blobError: string | null = null;
  try {
    projects = await listProjects();
  } catch (err) {
    blobError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Posters</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Print-ready output for the imagePROGRAF TC-21 — 24-inch roll and cut sheets.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NewProjectCard
            intent="document"
            title="Document"
            blurb="Reference cards, tables, diagrams. Type-first, prints as sharp vector at any size."
            icon={<LayoutTemplate className="size-4" />}
          />
          <NewProjectCard
            intent="art"
            title="Art"
            blurb="One generated image filling the sheet, at the paper's exact aspect ratio."
            icon={<ImageIcon className="size-4" />}
          />
        </div>
      </header>

      {blobError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Blob storage not configured</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>
              Run <code className="font-mono">vercel link</code>, enable Blob in the project
              dashboard, then <code className="font-mono">vercel env pull .env.local</code>.
            </p>
            <pre className="bg-muted text-muted-foreground rounded-md p-3 text-xs">
              {blobError}
            </pre>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileImage className="text-muted-foreground size-10" />
            <div>
              <p className="font-medium">No posters yet</p>
              <p className="text-muted-foreground text-sm">
                Create your first one to start designing.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* CSS multi-column masonry: tiles keep their natural height, so a 9:16
           sheet and a 16:9 sheet sit side by side without either being cropped
           or letterboxed. Columns fill top-to-bottom, which reorders items
           relative to a row grid — acceptable for a gallery, and the reason a
           real grid isn't used here. */
        <section className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {projects.map((project) => (
            <PosterTile key={project.id} project={project} />
          ))}
        </section>
      )}
    </div>
  );
}
