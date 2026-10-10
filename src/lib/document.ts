import * as cheerio from "cheerio";
import JSZip from "jszip";
import { scan, computeRisk, dedupe, verdictFor, ScanOptions } from "./scan";
import { Finding, JudgeInfo, ScanResult, SourceType } from "./types";

export interface HiddenSegment { kind: string; text: string }
export interface ParsedDoc { visibleText: string; hidden: HiddenSegment[] }
export interface DocScanResult extends ScanResult {
  hiddenSegments: number;
  hiddenKinds: string[];
  sanitizedText: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/* ---------------- HTML / Markdown ---------------- */

const HIDDEN_STYLE =
  /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*(?:0|1)(?:px|pt)?\s*(?:;|$)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)|(?:left|top|text-indent)\s*:\s*-\d{3,}|color\s*:\s*(?:#fff(?:fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*(?:;|$)/i;

export function parseHtml(html: string): ParsedDoc {
  const $ = cheerio.load(html);
  const hidden: HiddenSegment[] = [];
  const seen = new Set<string>();
  const push = (kind: string, text: string) => {
    const t = clean(text);
    if (t.length < 3 || seen.has(kind + t)) return;
    seen.add(kind + t);
    hidden.push({ kind, text: t });
  };

  // 1. HTML comments
  const comments: any[] = [];
  $.root().find("*").addBack().contents().each((_, n: any) => {
    if (n.type === "comment") comments.push(n);
  });
  for (const c of comments) { push("html-comment", c.data ?? ""); $(c).remove(); }

  // 2. JSON-LD / data scripts, then noscript
  $("script").each((_, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase();
    if (type.includes("json")) push("script-data", $(el).text().slice(0, 2000));
  });
  $("noscript").each((_, el) => { push("noscript", $(el).text()); });

  // 3. Elements hidden from humans
  $("body *").each((_, el) => {
    if (!$(el).closest("html").length) return; // already removed with a hidden parent
    const style = $(el).attr("style") ?? "";
    const isHidden =
      $(el).is("[hidden]") || $(el).attr("aria-hidden") === "true" || HIDDEN_STYLE.test(style);
    if (isHidden) { push("hidden-element", $(el).text()); $(el).remove(); }
  });

  // 4. Attributes and metadata that an AI reads but a human rarely sees
  $("[alt],[title],[aria-label]").each((_, el) => {
    for (const a of ["alt", "title", "aria-label"]) {
      const v = $(el).attr(a);
      if (v) push("attribute", v);
    }
  });
  $("meta[name],meta[property]").each((_, el) => {
    const v = $(el).attr("content");
    if (v) push("meta", v);
  });

  // 5. What a human would actually see
  $("script,style,noscript,template").remove();
  const visibleText = clean($("body").text());
  return { visibleText, hidden };
}

/* ---------------- DOCX ---------------- */

const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
   .replace(/&amp;/g, "&");

const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unxml(m[1])).join("");

export async function parseDocx(buf: Buffer): Promise<ParsedDoc> {
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string) => {
    const f = zip.file(p);
    return f ? await f.async("string") : "";
  };

  const hidden: HiddenSegment[] = [];
  const push = (kind: string, text: string) => {
    const t = clean(text);
    if (t.length >= 3) hidden.push({ kind, text: t });
  };

  const docXml = await read("word/document.xml");
  const visibleParas: string[] = [];

  for (const para of docXml.split("</w:p>")) {
    let visible = "";
    for (const m of para.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)) {
      const run = m[0];
      const text = textOf(run);
      if (!text) continue;
      const rpr = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
      const vanish = /<w:vanish\b(?![^>]*w:val="(?:0|false)")[^>]*\/?>/.test(rpr);
      const white = /<w:color\s+w:val="ffffff"/i.test(rpr);
      const sz = rpr.match(/<w:sz\s+w:val="(\d+)"/);
      const tiny = !!sz && Number(sz[1]) <= 4; // half-points: 4 = 2pt
      if (vanish) push("docx-hidden-text", text);
      else if (white) push("docx-white-text", text);
      else if (tiny) push("docx-tiny-text", text);
      else visible += text;
    }
    if (visible.trim()) visibleParas.push(visible.trim());
  }

  for (const part of ["comments", "footnotes", "endnotes"]) {
    const xml = await read(`word/${part}.xml`);
    for (const para of xml.split("</w:p>")) push(`docx-${part.slice(0, -1)}`, textOf(para));
  }

  const meta = (await read("docProps/core.xml")) + (await read("docProps/custom.xml"));
  const values = [...meta.matchAll(/<([\w:.-]+)[^>]*>([^<]+)<\/\1>/g)]
    .map((m) => unxml(m[2]).trim())
    .filter((v) => /[a-zA-Z]{4,}/.test(v));
  if (values.length) push("docx-metadata", values.join(" | "));

  return { visibleText: visibleParas.join("\n"), hidden };
}

/* ---------------- Scanning parsed documents ---------------- */

function redact(text: string, fs: Finding[]): string {
  const spans = fs
    .filter((f) => f.end > f.start && f.severity >= 0.5 && f.end <= text.length)
    .map((f) => [f.start, f.end] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [s, e] of spans) {
    if (e <= pos) continue;
    out += text.slice(pos, Math.max(s, pos)) + "[REMOVED BY FIREWALL]";
    pos = e;
  }
  return out + text.slice(pos);
}

export async function scanParsed(
  parsed: ParsedDoc,
  sourceType: SourceType,
  opts: ScanOptions = {}
): Promise<DocScanResult> {
  const t0 = performance.now();
  const findings: Finding[] = [];
  let judge: JudgeInfo | undefined;
  const takeJudge = (j?: JudgeInfo) => {
    if (j && (!judge || (j.error && !judge.error))) judge = j;
  };

  const vis = parsed.visibleText.trim() ? await scan(parsed.visibleText, sourceType, opts) : null;
  if (vis) { findings.push(...vis.findings); takeJudge(vis.judge); }

  const groups = new Map<string, string[]>();
  for (const h of parsed.hidden) groups.set(h.kind, [...(groups.get(h.kind) ?? []), h.text]);

  for (const [kind, texts] of groups) {
    const joined = texts.join("\n").slice(0, 6000);
    const r = await scan(joined, sourceType, opts);
    takeJudge(r.judge);

    const real = r.findings.filter((f) => !f.reason.includes("quoted or discussed") && f.severity >= 0.3);
    if (r.verdict !== "allow" || real.some((f) => f.severity >= 0.5)) {
      const top = [...r.findings].sort((a, b) => b.severity - a.severity)[0];
      findings.push({
        attack: top?.attack ?? "indirect_injection",
        severity: 0.9,
        start: 0, end: 0,
        text: joined.slice(0, 120),
        rule: `hidden-${kind}`,
        layer: "heuristic",
        reason: `Instruction-like content hidden in ${kind}: invisible to a human reader but read by the AI (underlying signal: ${top?.rule ?? "judge"})`,
      });
      for (const f of r.findings) findings.push({ ...f, start: 0, end: 0, reason: `[hidden ${kind}] ${f.reason}` });
    } else if (joined.length >= 20) {
      findings.push({
        attack: "indirect_injection", severity: 0.15, start: 0, end: 0,
        text: joined.slice(0, 120), rule: `hidden-${kind}-present`, layer: "heuristic",
        reason: `Hidden content present in ${kind} (benign on inspection)`,
      });
    }
  }

  const unique = dedupe(findings);
  // const riskScore = computeRisk(unique, sourceType);
    // "-present" notes are informational: shown in the report, but they don't add risk
  const riskScore = computeRisk(
    unique.filter((f) => !f.rule.endsWith("-present")),
    sourceType
  );
  const verdict = verdictFor(riskScore);

  return {
    verdict,
    riskScore: Number(riskScore.toFixed(3)),
    findings: unique,
    latencyMs: Math.round(performance.now() - t0),
    judge,
    hiddenSegments: parsed.hidden.length,
    hiddenKinds: [...groups.keys()],
    sanitizedText: verdict === "block" ? "" : redact(parsed.visibleText, vis?.findings ?? []),
  };
}

/* ---------------- One entry point for pasted text ---------------- */

const LOOKS_HTML = /<(!--|html|body|div|span|p|a|img|meta)[\s>\/-]/i;

export async function scanInput(
  content: string,
  sourceType: SourceType,
  opts: ScanOptions = {}
): Promise<DocScanResult> {
  const isHtml =
    sourceType === "html" ||
    (["web", "email", "markdown"].includes(sourceType) && LOOKS_HTML.test(content));
  const parsed: ParsedDoc = isHtml ? parseHtml(content) : { visibleText: content, hidden: [] };
  return scanParsed(parsed, sourceType, opts);
}