const k = process.env.GEMINI_API_KEY ?? "";
console.log({
  loaded: k.length > 0,
  length: k.length,            // AI Studio keys are normally 39 characters
  first4: k.slice(0, 4),       // normally "AIza"
  last2: k.slice(-2),
  hasQuotes: /["']/.test(k),
  hasWhitespaceOrCR: /\s/.test(k),
  model: process.env.GEMINI_MODEL,
});

(async () => {
  for (const mode of ["header", "query"] as const) {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1" +
      (mode === "query" ? `&key=${encodeURIComponent(k.trim())}` : "");
    const res = await fetch(url, mode === "header" ? { headers: { "x-goog-api-key": k.trim() } } : {});
    console.log(mode, "->", res.status);
  }
})();