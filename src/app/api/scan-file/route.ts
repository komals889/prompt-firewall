import { NextResponse } from "next/server";
import { parseDocx, parseHtml, scanParsed, ParsedDoc } from "@/lib/document";
import { SourceType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "file too large (5MB max)" }, { status: 413 });

  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  let parsed: ParsedDoc;
  let sourceType: SourceType;

  try {
    if (name.endsWith(".docx")) { parsed = await parseDocx(buf); sourceType = "docx"; }
    else if (/\.(html?|xhtml)$/.test(name)) { parsed = parseHtml(buf.toString("utf8")); sourceType = "html"; }
    else if (/\.(md|markdown)$/.test(name)) { parsed = parseHtml(buf.toString("utf8")); sourceType = "markdown"; }
    else if (name.endsWith(".txt")) { parsed = { visibleText: buf.toString("utf8"), hidden: [] }; sourceType = "markdown"; }
    else if (name.endsWith(".json")) { parsed = { visibleText: buf.toString("utf8"), hidden: [] }; sourceType = "api"; }
    else return NextResponse.json({ error: "Unsupported type (docx, html, md, txt, json for now)" }, { status: 415 });
  } catch {
    return NextResponse.json({ error: "Could not parse file" }, { status: 422 });
  }

  const result = await scanParsed(parsed, sourceType);
  return NextResponse.json({ fileName: file.name, sourceType, ...result });
}