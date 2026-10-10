import { NextResponse } from "next/server";
import { runAgent, Mode } from "@/lib/agent";
import { SourceType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { document, sourceType, userTask, mode, agent } = (await req.json()) as {
    document?: string; sourceType?: SourceType; userTask?: string; mode?: Mode; agent?: "llm" | "simulated";
  };
  if (!document || !userTask) {
    return NextResponse.json({ error: "document and userTask are required" }, { status: 400 });
  }
  if ((agent ?? "simulated") === "llm" && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
  }
  const run = await runAgent({
    document, sourceType: sourceType ?? "web", userTask, mode: mode ?? "full", agent: agent ?? "simulated",
  });
  return NextResponse.json(run);
}