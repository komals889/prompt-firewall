import { runHeuristics } from "./heuristics";
import { decodeAll } from "./decoder";
import { judge } from "./judge";
import { Finding, JudgeInfo, ScanResult, SourceType } from "./types";

export interface ScanOptions {
  useLLM?: boolean;
  useDecoder?: boolean;
  userTask?: string;
}

const trustMultiplier: Record<SourceType, number> = {
  user: 1.0, api: 1.1, markdown: 1.1, code: 1.1, docx: 1.2,
  pdf: 1.2, ocr: 1.2, email: 1.3, html: 1.3, web: 1.3,
};
export function verdictFor(risk: number): ScanResult["verdict"] {
  return risk >= 0.75 ? "block" : risk >= 0.4 ? "sanitize" : "allow";
}

export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.rule}|${f.text.toLowerCase()}|${f.layer}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function computeRisk(findings: Finding[], sourceType: SourceType): number {
  const weak = findings.filter((f) => f.reason.includes("quoted or discussed"));
  const strong = findings.filter((f) => !f.reason.includes("quoted or discussed"));
  const weakBase = Math.min(0.25, 1 - weak.reduce((a, f) => a * (1 - f.severity), 1));
  const base = 1 - (1 - weakBase) * strong.reduce((a, f) => a * (1 - f.severity), 1);
  // If only the LLM is suspicious (no rule or decoder agrees), don't apply the source-trust boost
  const llmOnly = findings.length > 0 && findings.every((f) => f.layer === "llm");
  const mult = llmOnly ? Math.min(trustMultiplier[sourceType], 1.0) : trustMultiplier[sourceType];
  return Math.min(1, base * mult);
}

export async function scan(
  content: string,
  sourceType: SourceType,
  opts: ScanOptions = {}
): Promise<ScanResult> {
  const t0 = performance.now();
  // const { normalized, obfuscation, variants } = decodeAll(content);
    const { normalized, obfuscation, variants } =
    opts.useDecoder === false
      ? { normalized: content, obfuscation: [] as string[], variants: [] as ReturnType<typeof decodeAll>["variants"] }
      : decodeAll(content);

  const findings: Finding[] = runHeuristics(content);
  if (normalized !== content) findings.push(...runHeuristics(normalized));

  if (obfuscation.length) {
    findings.push({
      attack: "encoded_instructions", severity: 0.3, start: 0, end: 0,
      text: obfuscation.join("; "), rule: "obfuscation-signal", layer: "decoder",
      reason: "Content uses obfuscation techniques that are rare in benign text",
    });
  }

  for (const v of variants) {
    const inner = runHeuristics(v.decoded);
    if (v.kind === "rot13" && inner.length === 0) continue;
    if (v.kind === "rot13" && runHeuristics(normalized).length > 0) continue;
    for (const f of inner) {
      findings.push({
        attack: "encoded_instructions",
        severity: Math.min(1, f.severity + 0.1),
        start: v.start, end: v.end,
        text: v.encoded.length > 80 ? v.encoded.slice(0, 80) + "…" : v.encoded,
        rule: `decoded-${v.kind}:${f.rule}`,
        layer: "decoder",
        reason: `Hidden ${v.kind} payload decodes to "${f.text}" (${f.attack})`,
      });
    }
  }

  let unique = dedupe(findings);
  let riskScore = computeRisk(unique, sourceType);
  let judgeInfo: JudgeInfo | undefined;

  // Only spend an LLM call when the cheap layers have not already blocked it
  const llmAllowed = (opts.useLLM ?? true) && !!process.env.GEMINI_API_KEY;
  if (llmAllowed && riskScore < 0.75) {
    const task =
      opts.userTask ??
      (sourceType === "user"
        ? "The user is chatting directly with the assistant; their own requests are legitimate."
        : "Summarize or process this content for the user.");
    const j = await judge(content, sourceType, task);
    judgeInfo = j.info;

    if (j.findings.length) {
      unique = dedupe([...unique, ...j.findings]);
      riskScore = computeRisk(unique, sourceType);
    } else if (
      j.info.verdict === "benign" &&
      (j.info.confidence ?? 0) >= 0.8 &&
      !unique.some((f) => f.layer === "decoder")
    ) {
      // Confident benign verdict overrules weak/ambiguous regex hits
      riskScore *= 0.4;
    }
  }

  const verdict = riskScore >= 0.75 ? "block" : riskScore >= 0.4 ? "sanitize" : "allow";

  return {
    verdict,
    riskScore: Number(riskScore.toFixed(3)),
    findings: unique,
    latencyMs: Math.round(performance.now() - t0),
    judge: judgeInfo,
  };
}