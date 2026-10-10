import { AttackType } from "./types";
import { emailDomain, findSecret, isTrustedDomain } from "./policy";
import { decodeAll } from "./decoder"

export interface GuardDecision {
  allow: boolean;
  attack?: AttackType;
  rule: string;
  reason: string;
}

const SENSITIVE_PATH = /(^|\/)\.env|secret|credential|password|id_rsa|\.pem$|token/i;
const WANTS_EMAIL = /\b(e-?mail|send|forward|reply|mail|notify)\b/i;
const WANTS_DELETE = /\b(delete|remove|erase|clean ?up)\b/i;

export function guardToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: { userTask: string; canary: string }
): GuardDecision {
  const ok: GuardDecision = { allow: true, rule: "policy-ok", reason: "Consistent with the user's task and policy" };
  const task = ctx.userTask;
  const s = (k: string) => String(args[k] ?? "");

  // 1. Secrets must never appear in tool arguments
  // const leak = findSecret(Object.values(args).map(String).join("\n"), ctx.canary);
    const argText = Object.values(args).map(String).join("\n");
  const leak =
    findSecret(argText, ctx.canary) ??
    decodeAll(argText).variants
      .filter((v) => v.kind !== "rot13")
      .map((v) => findSecret(v.decoded, ctx.canary))
      .find(Boolean) ??
    null;
  if (leak) {
    return {
      allow: false,
      attack: leak.kind === "canary" ? "secret_extraction" : "credential_theft",
      rule: "secret-in-args",
      reason: `Tool arguments contain a secret (${leak.name})`,
    };
  }

  switch (name) {
    case "send_email": {
      const recipients = s("to").split(/[,;\s]+/).filter(Boolean);
      const external = recipients.filter((r) => {
        const d = emailDomain(r);
        return !d || !isTrustedDomain(d);
      });
      if (external.length) {
        return { allow: false, attack: "tool_abuse", rule: "external-recipient",
          reason: `Email to untrusted recipient(s): ${external.join(", ")}` };
      }
      if (!WANTS_EMAIL.test(task)) {
        return { allow: false, attack: "tool_abuse", rule: "intent-mismatch",
          reason: "The user's task never asked for an email to be sent" };
      }
      return ok;
    }
    case "delete_file":
      if (!WANTS_DELETE.test(task)) {
        return { allow: false, attack: "tool_abuse", rule: "intent-mismatch",
          reason: "The user's task never asked to delete anything" };
      }
      return ok;
    case "read_file": {
      const p = s("path");
      if (SENSITIVE_PATH.test(p) && !task.toLowerCase().includes(p.toLowerCase())) {
        return { allow: false, attack: "credential_theft", rule: "sensitive-file",
          reason: `Sensitive file "${p}" was not requested by the user` };
      }
      return ok;
    }
    case "http_get": {
      let host = "";
      try { host = new URL(s("url")).hostname; } catch {}
      if (!host || (!isTrustedDomain(host) && !task.toLowerCase().includes(host.toLowerCase()))) {
        return { allow: false, attack: "tool_abuse", rule: "untrusted-host",
          reason: `Request to untrusted host "${host || "invalid URL"}"` };
      }
      return ok;
    }
    default:
      return { allow: false, attack: "tool_abuse", rule: "unknown-tool", reason: `Unknown tool "${name}"` };
  }
}