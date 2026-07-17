import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { createOrchestrationStream } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

interface OrchestrateBody {
  id?: string;
  projectId: string;
  messages: UIMessage[];
}

export async function POST(req: Request) {
  const body = (await req.json()) as OrchestrateBody;
  if (!body.projectId || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.parts.find((p) => p.type === "text")?.text;
  if (!text) {
    return new Response(JSON.stringify({ error: "no_user_text" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const stream = createOrchestrationStream({
    projectId: body.projectId,
    userMessage: text,
    signal: req.signal,
  });
  return createUIMessageStreamResponse({ stream });
}
