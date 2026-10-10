 import { AttackType, Finding } from "./types";

interface Rule {
  id: string;
  attack: AttackType;
  severity: number;
  pattern: RegExp;
  reason: string;
}

const rules: Rule[] = [
  // ---------- Day 1 rules ----------
  {
    id: "override-ignore-prev",
    attack: "instruction_override",
    severity: 0.9,
    pattern: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|system)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?)\b/gi,
    reason: "Attempts to cancel the agent's existing instructions",
  },
  {
    id: "override-new-instructions",
    attack: "instruction_override",
    severity: 0.7,
    pattern: /\b(new|updated|real|actual)\s+instructions?\s*(:|are|follow)/gi,
    reason: "Tries to introduce replacement instructions",
  },
    {
    id: "role-you-are-now",
    attack: "role_change",
    severity: 0.8,
    pattern: /\byou\s+are\s+now\s+(?:a|an|the|my|in\s+\w+\s+mode|acting|playing|going\s+to|free|unrestricted|no\s+longer|called|named|DAN)\b[^.\n]{0,60}/gi,
    reason: "Tries to reassign the agent's role",
  },
  {
    id: "role-dan",
    attack: "role_change",
    severity: 0.85,
    pattern: /\b(act as|pretend (to be|you are)|roleplay as)\b[^.\n]{0,60}\b(DAN|unrestricted|no restrictions|jailbroken|developer mode)\b/gi,
    reason: "Jailbreak persona request",
  },
  {
    id: "secret-system-prompt",
    attack: "secret_extraction",
    severity: 0.85,
    pattern: /\b(reveal|show|print|repeat|output|leak|tell me)\b[^.\n]{0,40}\b(system prompt|hidden prompt|initial instructions|your instructions|your prompt)\b/gi,
    reason: "Asks the agent to expose its system prompt",
  },
  {
    id: "cred-request",
    attack: "credential_theft",
    severity: 0.85,
    pattern: /\b(send|share|reveal|exfiltrate|forward|post)\b[^.\n]{0,50}\b(api[_ -]?keys?|passwords?|tokens?|credentials?|secrets?|private keys?|\.env)\b/gi,
    reason: "Asks for credentials or secrets to be disclosed",
  },
  {
    id: "cred-pattern",
    attack: "credential_theft",
    severity: 0.6,
    pattern: /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36})\b/g,
    reason: "Contains something that looks like a live credential",
  },
  {
    id: "tool-send-external",
    attack: "tool_abuse",
    severity: 0.8,
    pattern: /\b(send|forward|email|post|upload)\b[^.\n]{0,60}\b(to|at)\b[^.\n]{0,20}[\w.+-]+@[\w-]+\.[\w.]+/gi,
    reason: "Instructs the agent to send data to an external address",
  },
   {
    id: "tool-destructive-hard",
    attack: "tool_abuse",
    severity: 0.8,
    pattern: /\b(rm\s+-rf|drop\s+(table|database)|wipe\s+(the\s+)?(disk|database|server|drive)|format\s+(the\s+)?(disk|drive)|(delete|erase)\s+(all|every)\s+(the\s+)?(users?\s+)?(database|tables?|backups?|records))\b/gi,
    reason: "Requests a clearly destructive tool action",
  },
  {
    id: "tool-destructive-soft",
    attack: "tool_abuse",
    severity: 0.3,
    pattern: /\b(delete|remove|erase)\s+(all|every)\b[^.\n]{0,40}/gi,
    reason: "Bulk delete wording (weak signal alone; stronger with other signals)",
  },
  {
    id: "context-remember",
    attack: "context_poisoning",
    severity: 0.7,
      pattern: /\b(from now on|in all future|for the rest of (the|this) (session|conversation)|going forward)\b(?:[^.\n]|\.(?=\S)){0,80}\b(respon(d|ses?)|repl(y|ies)|answers?|assistant|chatbot|AI|model|the user|users?|ignore|obey)\b/gi,
    reason: "Tries to plant persistent instructions in memory/context",
  },
  {
    id: "indirect-ai-addressed",
    attack: "indirect_injection",
    severity: 0.75,
    pattern: /\b(note to (the )?(ai|assistant|llm|agent|model)|attention (ai|assistant|llm|agent)|if you are an? (ai|llm|assistant))\b/gi,
    reason: "Content addresses the AI directly, a hallmark of indirect injection",
  },

  // ---------- Day 2 rules ----------
  {
    id: "delimiter-injection",
    attack: "instruction_override",
    severity: 0.85,
    pattern: /(<\|im_start\|>|<\|im_end\|>|\[\/?INST\]|<\/?system>|###\s*(system|instruction)s?\b)/gi,
    reason: "Fake chat/system delimiters used to break out of the content",
  },
  {
    id: "fake-role-header",
    attack: "role_change",
    severity: 0.7,
    pattern: /^\s*(system|assistant|developer)\s*:\s*\S.{10,}/gim,
    reason: "Fake role header inside content",
  },
  {
    id: "conceal-from-user",
    attack: "indirect_injection",
    severity: 0.8,
    pattern: /\b(do not|don't|never)\b[^.\n]{0,30}\b(tell|inform|mention|notify|alert)\b[^.\n]{0,20}\b(the )?user\b/gi,
    reason: "Instructs the agent to hide actions from the user",
  },
  {
    id: "markdown-exfil",
    attack: "credential_theft",
    severity: 0.85,
    pattern: /!\[[^\]]*\]\(https?:\/\/[^)\s]+[?&][^)\s]*(\{|%7B|secret|token|key|data|q)=[^)\s]*\)/gi,
    reason: "Markdown image URL that could leak data via query string",
  },
  {
    id: "developer-mode",
    attack: "role_change",
    severity: 0.8,
    pattern: /\b(developer mode|god mode|jailbreak(ed)? mode|do anything now)\b/gi,
    reason: "Known jailbreak mode phrase",
  },
  {
    id: "dan-persona",
    attack: "role_change",
    severity: 0.8,
    pattern: /\b(you are|you're|be)\s+(now\s+)?DAN\b|\bno restrictions\b/gi,
    reason: "DAN-style unrestricted persona",
  },
  {
    id: "tool-call-force",
    attack: "tool_abuse",
    severity: 0.7,
    pattern: /\b(call|invoke|execute|run|use)\b[^.\n]{0,20}\b(the )?(send_email|delete_file|read_file|shell|exec|transfer_funds|tool)\b[^.\n]{0,40}\b(now|immediately|without|silently)\b/gi,
    reason: "Forces a tool call with urgency or without confirmation",
  },
  {
    id: "multilingual-override",
    attack: "instruction_override",
    severity: 0.8,
    pattern: /(ignorez? (les |toutes les )?instructions|ignora (las |todas las )?instrucciones|ignoriere (alle )?anweisungen|игнорируй (все )?инструкции|忽略(之前|以上|所有)的?指令|पिछले निर्देशों को अनदेखा)/gi,
    reason: "Instruction override in another language",
  },
];

// const QUOTE_CONTEXT = /(for example|e\.g\.|such as|the phrase|attackers? (often|may|might)|known as|is called|quote[sd]?|example of)[^.\n]{0,40}$/i;
const QUOTE_CONTEXT = /(for example|e\.g\.|such as|the phrase|attackers? (often|may|might)|known as|is called|quote[sd]?|example of|example (attack|string|prompt|payload)|attack string|for documentation|sample (attack|string))[^\n]{0,60}$/i;
const NOT_A_COMMAND_AFTER = /^[^\n]{0,20}?(do not|don't|never)\s+(execute|follow|obey|run|act on)\b/i;
const OPEN_QUOTES = new Set(['"', "'", "“", "`", "‘"]);
const CLOSE_QUOTES = new Set(['"', "'", "”", "`", "’"]);

function looksQuoted(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 80), start);
  const after = text.slice(end, end + 80);
  const prev = text[start - 1];
  // the closing quote may come after punctuation:  ...instructions."
  const tail = after.replace(/^[.,!?;:]+/, "");
  const wrapped = OPEN_QUOTES.has(prev) && CLOSE_QUOTES.has(tail[0]);
  return wrapped || QUOTE_CONTEXT.test(before) || NOT_A_COMMAND_AFTER.test(after);
}

// function looksQuoted(text: string, start: number, end: number): boolean {
//   const before = text.slice(Math.max(0, start - 60), start);
//   const prev = text[start - 1];
//   const next = text[end];
//   const wrapped =
//     (prev === '"' || prev === "'" || prev === "“" || prev === "`") &&
//     (next === '"' || next === "'" || next === "”" || next === "`");
//   return wrapped || QUOTE_CONTEXT.test(before);
// }
const NEGATION_BEFORE = /\b(never|do not|don't|must not|should not|shouldn't|mustn't|avoid|cannot|can't)\s+(?!forget\b)(?:\w+\s+){0,1}$/i;
const NEGATABLE = new Set([
  "cred-request", "tool-send-external", "tool-destructive-hard", "tool-destructive-soft",
]);
export function runHeuristics(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (rule.id === "tool-send-external" && isTrustedEmailMatch(m[0])) continue;

      const quoted = looksQuoted(text, start, end);
      const negated =
        NEGATABLE.has(rule.id) &&
        NEGATION_BEFORE.test(text.slice(Math.max(0, start - 30), start));
      const weak = quoted || negated;

      findings.push({
        attack: rule.attack,
        severity: weak ? rule.severity * 0.2 : rule.severity,
        start,
        end,
        text: m[0],
        rule: rule.id,
        reason: negated
          ? `${rule.reason} (negated, so quoted or discussed rather than commanded)`
          : quoted
          ? `${rule.reason} (appears to be quoted or discussed, not commanded)`
          : rule.reason,
        layer: "heuristic",
      });
    }
  }
  return findings;
}
const TRUSTED_DOMAINS = ["company.com"]; // your demo "organization" domain

function isTrustedEmailMatch(matchText: string): boolean {
  const emails = [...matchText.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)];
  if (emails.length === 0) return false;
  // every address in the match must be internal
  return emails.every((e) => {
    const domain = e[1].toLowerCase().replace(/\.+$/, ""); // strip trailing dots
    return TRUSTED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
  });
}