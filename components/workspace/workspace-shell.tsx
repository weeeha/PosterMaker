"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { PosterProject } from "@/lib/poster/types";
import { ChatPanel } from "./chat-panel";
import { CanvasPreview } from "./canvas-preview";
import { ExportButton } from "./export-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WorkspaceShellProps {
  initialProject: PosterProject;
}

export type ProjectUpdater = (
  update: (project: PosterProject) => PosterProject,
) => void;

export function WorkspaceShell({ initialProject }: WorkspaceShellProps) {
  const [project, setProject] = useState<PosterProject>(initialProject);

  const updateProject: ProjectUpdater = (update) =>
    setProject((prev) => update(prev));

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background">
      <header className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/">
              <ChevronLeft className="size-4" />
              Posters
            </Link>
          </Button>
          <h1 className="text-base font-semibold tracking-tight">
            {project.title}
          </h1>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {project.canvas.widthIn}×{project.canvas.heightIn}in · {project.canvas.dpi} DPI
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton projectId={project.id} />
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[380px_1fr]">
        <ChatPanel projectId={project.id} onUpdate={updateProject} />
        <CanvasPreview project={project} />
      </div>
    </div>
  );
}
