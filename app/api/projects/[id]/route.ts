import { NextResponse } from "next/server";
import { readProject, writeProject } from "@/lib/poster/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const patch = await req.json();
  const updated = { ...project, ...patch, id: project.id };
  await writeProject(updated);
  return NextResponse.json(updated);
}
