"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";
import type { QualityWarning, WarningSeverity } from "@/lib/poster/quality";

const ICONS: Record<WarningSeverity, typeof XCircle> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONES: Record<WarningSeverity, string> = {
  error: "text-destructive",
  warning: "text-amber-500",
  info: "text-muted-foreground",
};

/**
 * Print-readiness report shown over the preview.
 *
 * Deliberately prominent: every warning here represents ink and paper you'd
 * otherwise waste discovering the problem on the sheet.
 */
export function QualityPanel({ warnings }: { warnings: QualityWarning[] }) {
  const [open, setOpen] = useState(false);

  const errors = warnings.filter((w) => w.severity === "error").length;
  const others = warnings.length - errors;

  if (warnings.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 rounded-md border bg-background/90 px-2.5 py-1.5 text-[11px] backdrop-blur">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        Print checks passed
      </div>
    );
  }

  return (
    <div className="w-[22rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-md border bg-background/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px]"
      >
        {errors > 0 ? (
          <XCircle className="text-destructive size-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
        )}
        <span className="flex-1">
          {errors > 0 && (
            <span className="font-medium">
              {errors} print {errors === 1 ? "problem" : "problems"}
            </span>
          )}
          {errors > 0 && others > 0 && <span className="text-muted-foreground">, </span>}
          {others > 0 && <span className="text-muted-foreground">{others} to review</span>}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="max-h-72 divide-y overflow-y-auto border-t">
          {warnings.map((w) => {
            const Icon = ICONS[w.severity];
            return (
              <li key={w.id} className="flex gap-2 px-2.5 py-2">
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${TONES[w.severity]}`} />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-medium leading-snug">{w.title}</p>
                  <p className="text-muted-foreground text-[10px] leading-relaxed">
                    {w.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
