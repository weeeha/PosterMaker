import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { uploadAsset } from "@/lib/poster/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const projectId = form.get("projectId");
  if (!(file instanceof File) || typeof projectId !== "string") {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const assetId = nanoid(10);
  const { url } = await uploadAsset(projectId, assetId, bytes, file.type || "image/png");
  return NextResponse.json({ url, assetId });
}
