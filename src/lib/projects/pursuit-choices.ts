/** Directory eligibility is computed by the database; never substitute is_open. */
export function pursuitChoices<T extends { can_log_hours: boolean; stage: string }>(leads: T[]): T[] {
  return leads.filter((lead) => lead.can_log_hours)
    .sort((a, b) => Number(b.stage === "won") - Number(a.stage === "won"));
}

/** Lost rows retain their history but cannot accept new hours. */
export function canEditPursuit(lead: { can_log_hours: boolean; stage: string }): boolean {
  return lead.can_log_hours && lead.stage !== "lost";
}