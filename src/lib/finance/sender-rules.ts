/** Finance intake sender rules + Gmail query (shared by the hook and the Regras tab). */
export type SenderRule = { pattern: string; action: "ignore" | "process" };

/** "Name <a@b.com>" → "a@b.com" (lower-case). */
export function senderEmail(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const e = (m ? m[1] : from).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function senderDomain(from: string | null | undefined): string | null {
  const e = senderEmail(from);
  return e ? e.split("@")[1] : null;
}

/** Pattern is a full address or a domain (subdomains match). Ignore wins. */
export function matchSenderRule(from: string | null | undefined, rules: SenderRule[]): "ignore" | "process" | null {
  const email = senderEmail(from);
  if (!email) return null;
  const domain = email.split("@")[1];
  const hits = rules.filter((r) =>
    r.pattern.includes("@") ? r.pattern === email : domain === r.pattern || domain.endsWith(`.${r.pattern}`),
  );
  if (hits.some((r) => r.action === "ignore")) return "ignore";
  if (hits.some((r) => r.action === "process")) return "process";
  return null;
}

export function financeGmailQuery(address: string) {
  const a = address.trim().toLowerCase();
  return `has:attachment newer_than:14d (to:${a} OR deliveredto:${a} OR cc:${a})`;
}
