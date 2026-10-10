import { readFileSync, writeFileSync, existsSync } from "fs";
import { scanInput } from "../src/lib/document";
import { SourceType } from "../src/lib/types";

interface Sample { text: string; source: SourceType; label: "attack" | "benign"; attack?: string; split: string }
interface Row { s: Sample; flagged: boolean; types: string[]; error: boolean,errMsg?: string }

const withLLM = process.argv.includes("--llm");
process.env.GEMINI_MIN_INTERVAL_MS ??= "4500";

function load(path: string, split: string): Sample[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).map((s: any) => ({ split, ...s }));
}
const data = [...load("eval/dataset.json", "dev"), ...load("eval/dataset-gen.json", "test")];

const configs = [
  { name: "Heuristics only", useDecoder: false, useLLM: false },
  { name: "+ Decoder", useDecoder: true, useLLM: false },
  ...(withLLM ? [{ name: "+ LLM judge", useDecoder: true, useLLM: true }] : []),
];

const r3 = (x: number) => Number(x.toFixed(3));

function stats(rows: Row[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const { s, flagged } of rows) {
    if (s.label === "attack") flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  return { n: rows.length, tp, fp, tn, fn, precision: r3(precision), recall: r3(recall), f1: r3(f1), fpr: r3(fp / (fp + tn || 1)) };
}

(async () => {
  console.log(`Samples: ${data.length} (${data.filter((d) => d.label === "attack").length} attacks)`);
  const report: any[] = [];

  for (const cfg of configs) {
    console.log(`\n==================== ${cfg.name} ====================`);
    const rows: Row[] = [];
    for (const s of data) {
      // const r = await scanInput(s.text, s.source, { useLLM: cfg.useLLM, useDecoder: cfg.useDecoder });
      // rows.push({ s, flagged: r.verdict !== "allow", types: r.findings.map((f) => f.attack), error: !!r.judge?.error });
      let r = await scanInput(s.text, s.source, { useLLM: cfg.useLLM, useDecoder: cfg.useDecoder });
      if (cfg.useLLM && r.judge?.error) {
        await new Promise((res) => setTimeout(res, 10000)); // back off, then retry once
        r = await scanInput(s.text, s.source, { useLLM: cfg.useLLM, useDecoder: cfg.useDecoder });
      }
      rows.push({ s, flagged: r.verdict !== "allow", types: r.findings.map((f) => f.attack), error: !!r.judge?.error, errMsg: r.judge?.error });
    }

    const overall = stats(rows);
    const bySplit: Record<string, any> = {};
    for (const sp of new Set(data.map((d) => d.split))) bySplit[sp] = stats(rows.filter((r) => r.s.split === sp));

    const byAttack: Record<string, any> = {};
    for (const t of new Set(data.filter((d) => d.attack).map((d) => d.attack!))) {
      const rs = rows.filter((r) => r.s.label === "attack" && r.s.attack === t);
      const detected = rs.filter((r) => r.flagged).length;
      byAttack[t] = {
        samples: rs.length,
        detected,
        recall: r3(detected / rs.length),
        typeNamedCorrectly: rs.filter((r) => r.flagged && r.types.includes(t)).length,
      };
    }

    const bySource: Record<string, any> = {};
    for (const src of new Set(data.map((d) => d.source))) {
      const st = stats(rows.filter((r) => r.s.source === src));
      bySource[src] = { n: st.n, recall: st.recall, fpr: st.fpr };
    }

    const llmErrors = rows.filter((r) => r.error).length;
    console.log("Overall:", overall, cfg.useLLM ? `| llmErrors: ${llmErrors}` : "");
    console.log("\nBy split (dev = tuned on, test = generated):"); console.table(bySplit);
    console.log("By attack type:"); console.table(byAttack);
    console.log("By source:"); console.table(bySource);

    const misses = rows.filter((r) => r.s.label === "attack" && !r.flagged);
    const fps = rows.filter((r) => r.s.label === "benign" && r.flagged);
    if (misses.length) { console.log("MISSED:"); misses.slice(0, 40).forEach((r) => console.log(`  [${r.s.attack ?? "?"}|${r.s.source}] ${r.s.text.slice(0, 90).replace(/\n/g, " ")}`));};
    const unnamed = rows.filter((r) => r.s.label === "attack" && r.flagged && r.s.attack && !r.types.includes(r.s.attack));
    if (unnamed.length) {
      console.log("DETECTED, BUT TYPE NOT NAMED:");
      unnamed.forEach((r) => console.log(`  expected ${r.s.attack} | got ${[...new Set(r.types)].join(",")} | ${r.s.text.slice(0, 70).replace(/\n/g, " ")}`));
    }
    if (fps.length) { console.log("FALSE POSITIVES:"); fps.slice(0, 40).forEach((r) => console.log(`  [${r.s.source}] ${r.s.text.slice(0, 90).replace(/\n/g, " ")}`));}

    rows.filter((r) => r.error).forEach((r) => console.log(`LLM ERROR on "${r.s.text.slice(0, 50)}": ${r.errMsg?.slice(0, 120)}`));
    report.push({ config: cfg.name, overall, bySplit, byAttack, bySource, llmErrors });
  }

  writeFileSync("eval/results.json", JSON.stringify(report, null, 2));
  console.log("\nSaved eval/results.json");
})();