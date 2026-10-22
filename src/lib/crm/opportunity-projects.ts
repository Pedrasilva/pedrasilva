export type OpportunityProject = {
  id: string;
  name: string;
  status: string;
  opportunity_id: string | null;
  quote_id: string | null;
};
export type ProjectQuoteLink = { id: string; opportunity_id: string | null; pm_project_id: string | null };

/** Retain every project, but deduplicate direct and quote links to the same one. */
export function opportunityProjects(projects: OpportunityProject[], quotes: ProjectQuoteLink[]) {
  const result = new Map<string, OpportunityProject[]>();
  const byId = new Map(projects.map(p => [p.id, p]));
  const quoteOpp = new Map(quotes.map(q => [q.id, q.opportunity_id]));
  const add = (opp: string | null | undefined, project: OpportunityProject | undefined) => {
    if (!opp || !project) return;
    const linked = result.get(opp) ?? [];
    if (!linked.some(p => p.id === project.id)) linked.push(project);
    result.set(opp, linked);
  };
  for (const p of projects) {
    add(p.opportunity_id, p);
    if (p.quote_id) add(quoteOpp.get(p.quote_id), p);
  }
  for (const q of quotes) if (q.pm_project_id) add(q.opportunity_id, byId.get(q.pm_project_id));
  return result;
}

export function activeProjectOpportunities<T extends { id: string; stage: string }>(
  opportunities: T[], links: ReadonlyMap<string, OpportunityProject[]>,
) {
  return opportunities.filter(o => {
    const projects = links.get(o.id) ?? [];
    return projects.some(p => p.status === "active" || p.status === "paused") || (o.stage === "won" && projects.length === 0);
  });
}

export function canConvertOpportunity(o: { id: string; stage: string; quotes?: unknown[] | null }, converted: ReadonlySet<string>) {
  return !converted.has(o.id) && ["proposal", "negotiation", "won"].includes(o.stage) && (o.quotes?.length ?? 0) > 0;
}