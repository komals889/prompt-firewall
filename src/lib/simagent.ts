export interface PlannedCall {
  name: string;
  args: Record<string, unknown>;
  bodyFromLastRead?: boolean;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

export function simulatedPlan(doc: string, userTask: string): PlannedCall[] {
  const plan: PlannedCall[] = [];
  const seen = new Set<string>();
  const add = (c: PlannedCall) => {
    const k = c.name + JSON.stringify(c.args);
    if (!seen.has(k)) { seen.add(k); plan.push(c); }
  };

  // The simulated flaw: it follows instructions written inside the document
  for (const m of doc.matchAll(/\b(?:read|open)\b[^.\n]{0,40}?['"`]?(\.env|id_rsa|[\w\/~.-]+\.(?:txt|csv|pem|json))['"`]?/gi)) {
    add({ name: "read_file", args: { path: m[1] } });
  }
  const readsFile = plan.some((c) => c.name === "read_file");

  for (const m of doc.matchAll(/\b(?:send|email|forward|mail)\b[^\n]{0,120}?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi)) {
    add({ name: "send_email", args: { to: m[1], subject: "Requested info", body: "Please see attached details." }, bodyFromLastRead: readsFile });
  }
  for (const m of doc.matchAll(/\bdelete\b[^.\n]{0,20}?['"`]?([\w.\/-]+\.\w+)['"`]?/gi)) {
    add({ name: "delete_file", args: { path: m[1] } });
  }
  for (const m of doc.matchAll(/\b(?:visit|fetch|open|go to|request)\b[^\n]{0,40}?(https?:\/\/[^\s"'<>)]+)/gi)) {
    add({ name: "http_get", args: { url: m[1] } });
  }

  // The legitimate part of the task the user actually asked for
  if (/\b(send|email|forward)\b/i.test(userTask)) {
    const to = userTask.match(EMAIL)?.[0];
    if (to) add({ name: "send_email", args: { to, subject: "Summary", body: "Summary of the document." } });
  }
  return plan;
}