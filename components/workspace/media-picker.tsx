"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MEDIA_GROUPS,
  PHOTO_MODE_NOTE,
  mediaAspect,
  mediaDimensions,
  mediaOrDefault,
  type Media,
  type Orientation,
} from "@/lib/poster/media";
import type { Canvas } from "@/lib/poster/types";
import { setCanvasMediaAction } from "@/app/actions";

interface MediaPickerProps {
  projectId: string;
  canvas: Canvas;
  onCanvasChange: (canvas: Canvas) => void;
}

export function MediaPicker({ projectId, canvas, onCanvasChange }: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = mediaOrDefault(canvas.mediaId);

  function choose(mediaId: string, orientation: Orientation) {
    startTransition(async () => {
      const next = await setCanvasMediaAction({ projectId, mediaId, orientation });
      onCanvasChange(next);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 font-mono text-[11px]">
          <Printer className="size-3.5" />
          {canvas.widthIn}×{canvas.heightIn}in
          <span className="text-muted-foreground">
            {mediaAspect(current, canvas.orientation)}
          </span>
          <ChevronDown className="size-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paper size</DialogTitle>
          <DialogDescription>
            Sizes your imagePROGRAF TC-21 can actually feed. The label under each one is
            what to pick in the macOS print dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="text-sm">
            <span className="font-medium">Orientation</span>
            <span className="text-muted-foreground ml-2 capitalize">
              {canvas.orientation}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() =>
              choose(
                canvas.mediaId,
                canvas.orientation === "portrait" ? "landscape" : "portrait",
              )
            }
          >
            <RotateCcw className="size-3.5" />
            Rotate
          </Button>
        </div>

        <div className="space-y-5">
          {MEDIA_GROUPS.map((group) => (
            <section key={group.label}>
              <h3 className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
                {group.label}
              </h3>
              <ul className="space-y-1">
                {group.media.map((media) => (
                  <li key={media.id}>
                    <MediaRow
                      media={media}
                      orientation={canvas.orientation}
                      selected={media.id === canvas.mediaId}
                      disabled={pending}
                      onSelect={() => choose(media.id, canvas.orientation)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
          The printer cannot print within{" "}
          <span className="font-mono">{(canvas.printableInsetIn * 25.4).toFixed(0)}mm</span> of
          any edge — there is no borderless mode. {PHOTO_MODE_NOTE}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function MediaRow({
  media,
  orientation,
  selected,
  disabled,
  onSelect,
}: {
  media: Media;
  orientation: Orientation;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { widthIn, heightIn } = mediaDimensions(media, orientation);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
        selected ? "border-foreground/50 bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <SheetThumb widthIn={widthIn} heightIn={heightIn} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">
            {widthIn} × {heightIn} in
          </span>
          <span className="text-muted-foreground font-mono text-[10px]">
            {mediaAspect(media, orientation)}
          </span>
        </span>
        <span className="text-muted-foreground block truncate font-mono text-[10px]">
          {media.driverPreset}
        </span>
      </span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

/** Scale thumbnails against the largest sheet so relative size reads at a glance. */
const THUMB_MAX_IN = 42.67;
const THUMB_BOX_PX = 28;

function SheetThumb({ widthIn, heightIn }: { widthIn: number; heightIn: number }) {
  const scale = THUMB_BOX_PX / THUMB_MAX_IN;
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: THUMB_BOX_PX, height: THUMB_BOX_PX }}
    >
      <span
        className="border-foreground/40 block border bg-background"
        style={{
          width: Math.max(3, widthIn * scale),
          height: Math.max(3, heightIn * scale),
        }}
      />
    </span>
  );
}
