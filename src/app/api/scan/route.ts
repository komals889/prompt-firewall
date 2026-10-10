import { NextResponse } from "next/server";
import { scanInput } from "@/lib/document";
import { SourceType } from "@/lib/types";

export async function POST(req: Request) {
  const { content, sourceType, userTask, useLLM } = (await req.json()) as {
    content?: string; sourceType?: SourceType; userTask?: string; useLLM?: boolean;
  };
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  return NextResponse.json(await scanInput(content, sourceType ?? "user", { userTask, useLLM }));
}