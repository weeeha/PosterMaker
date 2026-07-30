"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PosterUIMessage, PosterDataParts } from "@/lib/ai/messages";
import type { PosterIntent } from "@/lib/poster/types";
import type { ProjectUpdater } from "./workspace-shell";

interface ChatPanelProps {
  projectId: string;
  intent: PosterIntent;
  onUpdate: ProjectUpdater;
}

const PHASE_LABELS: Record<PosterDataParts["status"]["phase"], string> = {
  planning: "Planning",
  "generating-assets": "Generating imagery",
  composing: "Composing layout",
  saving: "Saving project",
  done: "Done",
};

export function ChatPanel({ projectId, intent, onUpdate }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<PosterDataParts["status"]["phase"] | null>(null);
  const [phaseNote, setPhaseNote] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, stop } = useChat<PosterUIMessage>({
    transport: new DefaultChatTransport<PosterUIMessage>({
      api: "/api/orchestrate",
      body: { projectId },
    }),
    onData: (part) => {
      if (part.type === "data-status") {
        setPhase(part.data.phase);
        setPhaseNote(part.data.note);
        if (part.data.phase === "done") setProgress(null);
      } else if (part.type === "data-progress") {
        setProgress({ current: part.data.current, total: part.data.total });
      } else if (part.type === "data-asset") {
        const incoming = part.data.asset;
        onUpdate((p) =>
          p.assets.some((a) => a.id === incoming.id)
            ? p
            : { ...p, assets: [...p.assets, incoming] },
        );
      } else if (part.type === "data-layout") {
        const { layout, canvas, title } = part.data;
        onUpdate((p) => ({
          ...p,
          title: title || p.title,
          layout,
          canvas,
        }));
      } else if (part.type === "data-error") {
        setErrorBanner(part.data.message);
      }
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, phase, phaseNote, progress]);

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setErrorBanner(null);
    setProgress(null);
    sendMessage({ text: trimmed });
    setInput("");
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <aside className="border-border flex min-h-0 flex-col border-r">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-4 px-4 py-4">
          {messages.length === 0 ? (
            <Empty intent={intent} />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {isBusy && (
            <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
              <div className="flex-1 space-y-1">
                <div>{phase ? PHASE_LABELS[phase] : "Working"}</div>
                {phaseNote && <div className="text-[11px] opacity-80">{phaseNote}</div>}
                {progress && progress.total > 0 && (
                  <div className="space-y-0.5">
                    <div className="bg-border h-1 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-foreground h-full transition-all"
                        style={{
                          width: `${(progress.current / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] tabular-nums opacity-80">
                      {progress.current} / {progress.total}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {(errorBanner || error) && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                {errorBanner ?? (error instanceof Error ? error.message : String(error))}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </ScrollArea>
      <form
        className="border-border flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            intent === "art"
              ? "Describe the artwork you want…"
              : "Describe the document you want…"
          }
          rows={3}
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-[10px]">⌘/Ctrl + Enter to send</p>
          {isBusy ? (
            <Button type="button" variant="outline" size="sm" onClick={() => stop()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()}>
              <Send className="size-3.5" />
              Send
            </Button>
          )}
        </div>
      </form>
    </aside>
  );
}

const EXAMPLES: Record<PosterIntent, { lead: string; items: string[]; note: string }> = {
  document: {
    lead: "Describe the document to lay out.",
    items: [
      "“Reference card for Vim shortcuts, organized by category, light background.”",
      "“Macronutrients in 30 common foods as a dense table.”",
      "“One-page onboarding overview for a design system: tokens, components, dos and don'ts.”",
    ],
    note: "Type and tables print as sharp vector at any size — resolution is never the limit here.",
  },
  art: {
    lead: "Describe the artwork.",
    items: [
      "“Bauhaus geometric composition, rust and cream, bold diagonals.”",
      "“Risograph-style mountain range at dusk, three ink colors, heavy grain.”",
      "“Botanical study of monstera leaves, muted sage, fine line work.”",
    ],
    note: "One image is generated at the sheet's exact aspect. Check the print-resolution panel before printing large.",
  },
};

function Empty({ intent }: { intent: PosterIntent }) {
  const { lead, items, note } = EXAMPLES[intent];
  return (
    <div className="text-muted-foreground space-y-3 text-sm">
      <p className="text-foreground font-medium">{lead}</p>
      <p>Examples:</p>
      <ul className="ml-4 list-disc space-y-1 text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed">{note}</p>
    </div>
  );
}

function MessageBubble({ message }: { message: PosterUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") return <span key={i}>{part.text}</span>;
          if (part.type === "data-plan") {
            const { title, palette, imagePrompt, blockCount } = part.data.plan;
            return (
              <div key={i} className="text-muted-foreground mt-1 space-y-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Designed “{title}”</span>
                  {/* Keyed by index, not hex: a palette can legitimately repeat
                      a color (e.g. the same cream as both background and accent). */}
                  {palette.slice(0, 5).map((hex, swatch) => (
                    <span
                      key={swatch}
                      title={hex}
                      className="border-border inline-block size-3 rounded-sm border"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  {blockCount !== undefined && <span>· {blockCount} blocks</span>}
                </div>
                {imagePrompt && (
                  <p className="border-border/60 border-l-2 pl-2 italic leading-relaxed">
                    {imagePrompt}
                  </p>
                )}
              </div>
            );
          }
          if (part.type === "data-asset") {
            return (
              <div key={i} className="mt-2 inline-flex flex-col">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={part.data.asset.blobUrl}
                  alt={part.data.role}
                  className="border-border h-20 w-20 rounded border object-cover"
                />
                <span className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                  {part.data.asset.widthPx}×{part.data.asset.heightPx}
                </span>
              </div>
            );
          }
          if (part.type === "data-layout") {
            return (
              <div key={i} className="text-muted-foreground mt-1 text-[11px]">
                Layout updated · {part.data.layout.blocks.length} blocks
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
