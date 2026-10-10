import { readFileSync } from "fs";
import { parseDocx, parseHtml, scanParsed } from "../src/lib/document";

(async () => {
  const cases = [
    ["samples/hidden-injection.html", "html"], ["samples/clean.html", "html"],
    ["samples/hidden-injection.docx", "docx"], ["samples/clean.docx", "docx"],
  ] as const;
  for (const [path, src] of cases) {
    const buf = readFileSync(path);
    const parsed = src === "docx" ? await parseDocx(buf) : parseHtml(buf.toString("utf8"));
    const r = await scanParsed(parsed, src, { useLLM: false });
    console.log(`\n${path} -> ${r.verdict.toUpperCase()} (risk ${r.riskScore}), hidden: ${r.hiddenKinds.join(", ") || "none"}`);
    for (const f of r.findings.filter((f) => f.rule.startsWith("hidden-"))) console.log("  ", f.rule, "|", f.attack);
  }
})();