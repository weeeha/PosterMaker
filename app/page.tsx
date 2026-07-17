import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileImage } from "lucide-react";
import { readIndex } from "@/lib/poster/storage";
import { createProjectAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let entries: Awaited<ReturnType<typeof readIndex>> = [];
  let blobError: string | null = null;
  try {
    entries = await readIndex();
  } catch (err) {
    blobError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Posters</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Print-ready posters for a 24-inch large-format printer. v1: 18×24 portrait at 300 DPI.
          </p>
        </div>
        <form action={createProjectAction}>
          <Button type="submit" size="lg" className="gap-2">
            <Plus className="size-4" />
            New poster
          </Button>
        </form>
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
      ) : entries.length === 0 ? (
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
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link href={`/p/${entry.id}`} className="block">
                <Card className="hover:border-foreground/40 transition-colors">
                  <CardHeader>
                    <CardTitle className="truncate text-base">{entry.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-xs">
                      Updated {new Date(entry.updatedAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
