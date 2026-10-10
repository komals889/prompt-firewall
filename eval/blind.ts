import { readFileSync, writeFileSync } from "fs";
import { scanInput } from "../src/lib/document";
import { SourceType } from "../src/lib/types";

process.env.GEMINI_MIN_INTERVAL_MS ??= "4500";

const SOURCES = ["user", "email", "web", "html", "markdown", "api", "code"];
const lines = readFileSync("eval/blind.txt", "utf8").split(/\r?\n/).filter((l) => l.trim());
const samples = lines.flatMap((l, i) => {
  const a = l.indexOf("|"), b = l.indexOf("|", a + 1);
  const label = l.slice(0, a).trim().toLowerCase();
  const source = l.slice(a + 1, b).trim().toLowerCase();
  const text = l.slice(b + 1).trim();
  if (a < 0 || b < 0 || !["attack", "benign"].includes(label) || !SOURCES.includes(source) || !text) {
    console.log(`Skipping line ${i + 1} (bad format): ${l.slice(0, 60)}`);
    return [];
  }
  return [{ label, source: source as SourceType, text }];
});

(async () => {
  let tp = 0, fp = 0, tn = 0, fn = 0, errors = 0;
  const missed: string[] = [], falsePos: string[] = [];

  for (const s of samples) {
    let r = await scanInput(s.text, s.source, { useLLM: true });
    if (r.judge?.error) {
      await new Promise((res) => setTimeout(res, 10000));
      r = await scanInput(s.text, s.source, { useLLM: true });
    }
    if (r.judge?.error) errors++;
    const flagged = r.verdict !== "allow";
    if (s.label === "attack") { flagged ? tp++ : (fn++, missed.push(`[${s.source}] ${s.text.slice(0, 100)}`)); }
    else { flagged ? (fp++, falsePos.push(`[${s.source}] ${s.text.slice(0, 100)} -> ${r.judge?.reason ?? r.findings[0]?.rule}`)) : tn++; }
  }

  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  const result = {
    n: samples.length, attacks: tp + fn, benign: tn + fp, tp, fp, tn, fn,
    precision: +precision.toFixed(3), recall: +recall.toFixed(3),
    f1: +((2 * precision * recall) / (precision + recall || 1)).toFixed(3),
    fpr: +(fp / (fp + tn || 1)).toFixed(3), llmErrors: errors,
  };
  console.log(result);
  if (missed.length) { console.log("\nMISSED:"); missed.forEach((m) => console.log("  " + m)); }
  if (falsePos.length) { console.log("\nFALSE POSITIVES:"); falsePos.forEach((m) => console.log("  " + m)); }
  writeFileSync("eval/blind-results.json", JSON.stringify({ result, missed, falsePos }, null, 2));
})();