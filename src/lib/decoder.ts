export interface DecodedVariant {
  kind: "base64" | "hex" | "url" | "html-entity" | "rot13";
  encoded: string;
  decoded: string;
  start: number;
  end: number;
}

export interface DecodeResult {
  normalized: string;
  obfuscation: string[];
  variants: DecodedVariant[];
}

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const CONFUSABLES = /[\u0400-\u04FF\u0370-\u03FF]/g;
const HOMOGLYPHS: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ј: "j", ѕ: "s", һ: "h",
  А: "A", Е: "E", О: "O", Р: "P", С: "C", Х: "X", Т: "T", В: "B", М: "M", Н: "H", К: "K",
  α: "a", ο: "o", ν: "v", ρ: "p", ε: "e", ι: "i",
};

export function normalize(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  let t = text;
  if (ZERO_WIDTH.test(t)) { notes.push("Zero-width / invisible characters"); }
  t = t.replace(ZERO_WIDTH, "");
  const nfkc = t.normalize("NFKC");
  if (nfkc !== t) notes.push("Unicode compatibility characters (fullwidth/stylized)");
  t = nfkc;
  const hasHomoglyph = new RegExp(CONFUSABLES.source).test(t) && /[a-zA-Z]/.test(t);
  if (hasHomoglyph) {
    const mapped = t.replace(CONFUSABLES, (c) => HOMOGLYPHS[c] ?? c);
    if (mapped !== t) notes.push("Cyrillic/Greek homoglyphs mixed with Latin");
    t = mapped;
  }
  return { text: t, notes };
}

function printableRatio(s: string): number {
  if (!s.length) return 0;
  let ok = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 160) ok++;
  }
  return ok / [...s].length;
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function findVariants(text: string, offset = 0): DecodedVariant[] {
  const out: DecodedVariant[] = [];

  for (const m of text.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) {
    try {
      const d = Buffer.from(m[0], "base64").toString("utf8");
      if (d.length >= 8 && printableRatio(d) > 0.9) {
        const start = (m.index ?? 0) + offset;
        out.push({ kind: "base64", encoded: m[0], decoded: d, start, end: start + m[0].length });
      }
    } catch {}
  }

  for (const m of text.matchAll(/(?:\\x[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{2}[\s:,-]?)){12,}/g)) {
    const hex = m[0].replace(/\\x|[\s:,-]/g, "");
    if (hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      const d = Buffer.from(hex, "hex").toString("utf8");
      if (printableRatio(d) > 0.9) {
        const start = (m.index ?? 0) + offset;
        out.push({ kind: "hex", encoded: m[0], decoded: d, start, end: start + m[0].length });
      }
    }
  }

  for (const m of text.matchAll(/(?:%[0-9a-fA-F]{2}){4,}/g)) {
    try {
      const d = decodeURIComponent(m[0]);
      const start = (m.index ?? 0) + offset;
      out.push({ kind: "url", encoded: m[0], decoded: d, start, end: start + m[0].length });
    } catch {}
  }

  for (const m of text.matchAll(/(?:&#x?[0-9a-fA-F]+;){4,}/g)) {
    const d = m[0].replace(/&#(x?)([0-9a-fA-F]+);/g, (_, x, n) =>
      String.fromCodePoint(parseInt(n, x ? 16 : 10)));
    const start = (m.index ?? 0) + offset;
    out.push({ kind: "html-entity", encoded: m[0], decoded: d, start, end: start + m[0].length });
  }

  return out;
}

export function decodeAll(text: string, maxDepth = 3): DecodeResult {
  const { text: normalized, notes } = normalize(text);
  const variants: DecodedVariant[] = [];

  let frontier = findVariants(normalized);
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    variants.push(...frontier);
    // look for nested encodings inside each decoded payload
    const next: DecodedVariant[] = [];
    for (const v of frontier) {
      for (const inner of findVariants(v.decoded)) {
        next.push({ ...inner, start: v.start, end: v.end }); // map back to outer span
      }
    }
    frontier = next;
    depth++;
  }

  // ROT13 of the whole text (checked later: only counts if it reveals an attack)
  variants.push({ kind: "rot13", encoded: normalized, decoded: rot13(normalized), start: 0, end: normalized.length });

  return { normalized, obfuscation: notes, variants };
}