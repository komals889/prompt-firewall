This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
 # Prompt Injection Firewall

A layered firewall that scans everything before it reaches an AI agent (user messages, web pages, emails, documents, API responses, code) and neutralizes prompt injection. Built for the ET AI Hackathon, Agentic Edition, Problem 2.

**Claimed position in the 3x3 grid: F3 + D2.**

## What it does

Content is scanned in layers. Each layer is cheap and fast first, and the LLM judge runs last, only when the earlier layers have not already blocked the content.

1. **Parse and normalize.** HTML, Markdown and DOCX are parsed to separate what a human sees from what only an AI reads: comments, `display:none` and tiny or white text, alt text and meta tags, DOCX hidden text, comments, footnotes and metadata. Unicode is normalized (zero-width characters, homoglyphs).
2. **Rules.** Pattern matching for known attack phrasings, with awareness of quoting, negation and trusted email domains.
3. **Decoder.** Base64, hex, URL, HTML entities and ROT13 payloads are decoded (nested, depth-limited) and re-scanned.
4. **LLM judge.** Gemini Flash-Lite classifies meaning and intent against the user's task, with schema-constrained JSON output, untrusted content in a random boundary, caching, retry, and a safe fallback if the API fails.
5. **Risk score and verdict.** Findings combine with a noisy-OR. A source-trust multiplier raises risk for web, email and HTML. Thresholds: sanitize at 0.4, block at 0.75. The sanitizer returns only what a human reader would see.
6. **Agent runtime guards.** A tool-call guard checks every proposed action (recipient and host trust, sensitive files, task intent, secrets and canary tokens, including base64-encoded secrets). An output scan redacts leaked secrets.

## Attack types covered (8 of 9)

Instruction override, role change, secret extraction, tool abuse, credential theft, context poisoning, encoded instructions, indirect injection.

**Not covered:** multi-step jailbreaks (no cross-turn session tracking).

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Playground: paste text or upload a file, see highlighted spans, findings by layer, hidden content, and the sanitized output |
| `/agent` | Firewall OFF vs ON, same attack, same tools, same agent |
| `/dashboard` | Evaluation results: ablation, per-attack recall, test split |

API routes: `POST /api/scan`, `POST /api/scan-file`, `POST /api/agent`.

## Setup

```bash
npm install
```

Create `.env.local` in the project root (no quotes, no trailing semicolons):

```
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Optional: `AGENT_MODEL` (model for the live demo agent), `GEMINI_MIN_INTERVAL_MS` (pause between judge calls, default 0 in the app and 4500 in the eval scripts).

```bash
npm run dev
```

The rules, decoder and parsers work without an API key. Without one, the LLM judge is skipped.

## Reproducing the evaluation

```bash
npx tsx eval/build-dataset.ts                              # builds eval/dataset-gen.json
npx tsx eval/run.ts                                        # rules + decoder, no API needed
npx tsx --env-file=.env.local eval/run.ts --llm            # adds the LLM judge
npx tsx --env-file=.env.local eval/blind.ts eval/blind.txt # blind set
npx tsx eval/guard-test.ts                                 # deterministic tool-guard test
npx tsx eval/make-samples.ts && npx tsx eval/doc-test.ts   # HTML and DOCX hidden-content samples
npx tsx --env-file=.env.local eval/agent-trials.ts         # simulated-agent trials
```

Copy `eval/results.json` to `src/data/results.json` to refresh the dashboard.

## Results

All numbers come from small datasets written by the team or an AI tool, so confidence intervals are wide (for example, 20/20 recall means the true recall is probably above about 84%, not that it is 100%).

**Ablation on the self-generated set** (dev = 32 samples used while tuning, test = 100 generated samples):

| Configuration | Recall | Precision | Notes |
| --- | --- | --- | --- |
| Rules only | 0.21 | 1.00 | Misses paraphrased and encoded attacks |
| + Decoder | 0.40 | 1.00 | Encoded attacks: 0 of 12 to 12 of 12 |
| + LLM judge | 1.00 | 1.00 | 75/75 attacks flagged, 0 false positives on 57 benign |

TODO before submitting: these rows came from runs at slightly different dataset sizes (129 and 132 samples). Re-run `eval/run.ts --llm` once on the final dataset and paste the three overall blocks here.

**Attack type named correctly** (the specific type matched the label, not just "flagged"): 51 of 57 labeled attacks. The other 6 were reported under a neighboring, arguably valid type.

**Blind set 1** (n=40, 20 attacks and 20 benign, written independently of the rules):

- First run, before any fixes: 20/20 attacks caught, 2 false positives out of 20 benign (a quoted attack string in documentation, and a UI `aria-label`).
- Both causes were fixed. Re-running the same set gave 20/20 and 0 false positives, but that set is no longer blind.

**Blind set 2:** TODO. Fresh samples written after the fixes, run once. Report the result here exactly as it comes out.

**Tool guard** (deterministic, scripted cases, no model calls): 13/13 malicious tool calls blocked, 7/7 legitimate calls allowed, 0 false blocks.

**Agent demo.** The "firewall off" side uses a **simulated vulnerable agent** that deliberately obeys instructions found in documents, so results are reproducible. A live Gemini agent resisted our simple injections on its own in 3 of 3 trials, so it could not demonstrate the difference. Against the simulated agent, the unprotected run was hijacked in 3 of 3 attacks, the tool guard alone stopped all 3, and the full firewall stopped all 3 without blocking the legitimate task. All tools run in a sandbox: no real email is sent and no real file is touched.

## Known limitations

- Datasets are small and not independent of the authors. Blind-set numbers are the most credible figures here, and they are still small.
- The LLM judge depends on a free-tier API. If it fails, rules and decoder still apply (fail open on that layer only). In production, a high-risk source should fail closed or go to human review.
- A high-confidence rule hit skips the judge, so the judge cannot rescue a rule false positive.
- Hiding through CSS classes or external stylesheets is not detected, only inline styles. DOCX text colored "white" through a theme color is not detected.
- No PDF or image/OCR input path, so multimodal input (D3) is not claimed.
- The tool guard's intent check is keyword-based, its trusted-domain list is hard-coded, and very short encoded secrets can slip through the decoder's length threshold.
- Multi-step jailbreaks are not covered.
- Quoted or discussed attack text is down-weighted, so an attacker could imitate quoting. Quoted matches are capped at a low risk so the judge still gets to decide.

## Responsible AI notes

- Untrusted content is passed to the judge inside a random boundary and treated as data, with schema-constrained output, so the security tool itself resists injection.
- Free-tier Gemini inputs may be used by Google to improve its models. Use only synthetic or non-sensitive data, or a paid or self-hosted model in production.
- Verdicts include explanations (layer, rule, reason, flagged span) for human oversight.

## Project layout

```
src/lib/        types, heuristics, decoder, judge, scan, document parsers, policy, tool guard, agents
src/app/        playground, /agent, /dashboard, and the API routes
eval/           dataset builder, eval runner, blind-set runner, guard and agent tests
samples/        generated HTML and DOCX samples
```
