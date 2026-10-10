export type AttackType =
  | "instruction_override"
  | "role_change"
  | "secret_extraction"
  | "tool_abuse"
  | "credential_theft"
  | "context_poisoning"
  | "multi_step_jailbreak"
  | "encoded_instructions"
  | "indirect_injection";

export type SourceType =
  | "user" | "web" | "email" | "pdf" | "docx"
  | "markdown" | "html" | "api" | "ocr" | "code";

export interface Finding {
  attack: AttackType;
  severity: number; // 0..1
  start: number;
  end: number;
  text: string;
  rule: string;
  reason: string;
  layer: "heuristic" | "decoder" | "llm";
}

export interface ScanResult {
  verdict: "allow" | "sanitize" | "block";
  riskScore: number;
  findings: Finding[];
  latencyMs: number;
  judge: JudgeInfo
}
export interface JudgeInfo {
  used: boolean;
  verdict?: "attack" | "benign";
  confidence?: number;
  reason?: string;
  cached?: boolean;
  error?: string;
}