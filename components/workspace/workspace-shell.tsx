"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImageIcon, LayoutTemplate } from "lucide-react";
import type { Canvas, PosterProject } from "@/lib/poster/types";
import { ChatPanel } from "./chat-panel";
import { CanvasPreview } from "./canvas-preview";
import { ExportButton } from "./export-button";
import { MediaPicker } from "./media-picker";
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

  const updateProject: ProjectUpdater = (update) => setProject((prev) => update(prev));

  const setCanvas = (canvas: Canvas) => setProject((prev) => ({ ...prev, canvas }));

  const isArt = project.brief.intent === "art";

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background">
      <header className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/">
              <ChevronLeft className="size-4" />
              Posters
            </Link>
          </Button>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {project.title}
          </h1>
          <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
            {isArt ? <ImageIcon className="size-3" /> : <LayoutTemplate className="size-3" />}
            {isArt ? "Art" : "Document"}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MediaPicker
            projectId={project.id}
            canvas={project.canvas}
            onCanvasChange={setCanvas}
          />
          <ExportButton projectId={project.id} />
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[380px_1fr]">
        <ChatPanel
          projectId={project.id}
          intent={project.brief.intent}
          onUpdate={updateProject}
        />
        <CanvasPreview project={project} />
      </div>
    </div>
  );
}
