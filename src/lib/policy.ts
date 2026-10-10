export const TRUSTED_DOMAINS = ["company.com"]; // demo organization

export function isTrustedDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.+$/, "");
  return TRUSTED_DOMAINS.some((t) => d === t || d.endsWith("." + t));
}

export function emailDomain(addr: string): string | null {
  const m = addr.trim().match(/@([\w-]+(?:\.[\w-]+)+)\s*>?$/);
  return m ? m[1] : null;
}

export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "API key (sk-...)", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Env-style secret", re: /\b(API_KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)\s*=\s*\S{6,}/ },
];

export function findSecret(
  text: string,
  canary: string
): { kind: "canary" | "pattern"; name: string } | null {
  if (canary && text.includes(canary)) return { kind: "canary", name: "canary token" };
  for (const p of SECRET_PATTERNS) if (p.re.test(text)) return { kind: "pattern", name: p.name };
  return null;
}

export function redactSecrets(text: string, canary: string): string {
  let out = canary ? text.split(canary).join("[REDACTED]") : text;
  for (const p of SECRET_PATTERNS) out = out.replace(new RegExp(p.re.source, "g"), "[REDACTED]");
  return out;
}