"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportButtonProps {
  projectId: string;
}

export function ExportButton({ projectId }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed: ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleExport} disabled={busy} size="sm" className="gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {busy ? "Exporting…" : "Export PDF"}
      </Button>
      {error && (
        <p className="text-destructive max-w-xs truncate text-[10px]" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
