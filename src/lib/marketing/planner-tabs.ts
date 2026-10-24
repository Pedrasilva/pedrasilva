/** Planner status tabs. Client- and server-safe. */
export const PLANNER_TABS = ["review", "approved", "scheduled", "published", "rejected", "all"] as const;
export type PlannerTab = (typeof PLANNER_TABS)[number];

export const asPlannerTab = (v: unknown): PlannerTab =>
  (PLANNER_TABS as readonly string[]).includes(v as string) ? (v as PlannerTab) : "review";

/** Which tab a single post belongs to ("all" is never returned). */
export function tabOf(d: { status: string; scheduled_at?: string | null }): Exclude<PlannerTab, "all"> {
  switch (d.status) {
    case "suggested": case "pending_approval": case "failed": return "review";
    case "approved": return d.scheduled_at ? "scheduled" : "approved";
    case "scheduled": case "publishing": return "scheduled";
    case "published": return "published";
    default: return "rejected";
  }
}

export const inTab = (d: { status: string; scheduled_at?: string | null }, tab: PlannerTab) => tab === "all" || tabOf(d) === tab;

/** Post counts per tab. */
export function tabCounts(drafts: { status: string; scheduled_at?: string | null }[]): Record<PlannerTab, number> {
  const c = Object.fromEntries(PLANNER_TABS.map((t) => [t, 0])) as Record<PlannerTab, number>;
  for (const d of drafts) { c[tabOf(d)]++; c.all++; }
  return c;
}
