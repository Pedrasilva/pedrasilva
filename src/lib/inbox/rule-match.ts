/**
 * Sender-rule matching, shared by the poller (auto-execute) and the
 * retroactive bulk-apply that runs when a rule is created.
 *
 * `reply` is structurally impossible here: a rule action is only ever
 * archive | label_only | trash.
 */
export const RULE_ACTIONS = ["archive", "label_only", "trash"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_MATCH_TYPES = ["exact_address", "domain"] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export type SenderRule = {
  match_type: RuleMatchType;
  sender_pattern: string;
  category: string;
  action: RuleAction;
};

/** Bare address out of a `Name <a@b.com>` From header. */
export function addressOf(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase() || null;
}

export function normalizePattern(pattern: string): string {
  return pattern.trim().toLowerCase().replace(/^@/, "");
}

/** Exact address wins over domain. Returns the matching rule, or null. */
export function matchRule<T extends SenderRule>(
  rules: T[],
  from: string | null | undefined,
): T | null {
  const address = addressOf(from);
  if (!address) return null;
  const domain = address.split("@")[1] ?? "";
  const exact = rules.find(
    (r) =>
      r.match_type === "exact_address" &&
      normalizePattern(r.sender_pattern) === address,
  );
  if (exact) return exact;
  return (
    rules.find(
      (r) =>
        r.match_type === "domain" && normalizePattern(r.sender_pattern) === domain,
    ) ?? null
  );
}

/** Terminal `email_events.status` for a rule action. */
export function statusForAction(action: RuleAction): string {
  if (action === "archive") return "archived";
  if (action === "trash") return "trashed";
  return "labeled";
}
