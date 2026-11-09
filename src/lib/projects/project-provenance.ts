/** A reverse-generated quote is a snapshot of a project, not its source. */
export function isGeneratedProjectQuote(quote: { notas?: string | null } | null | undefined) {
  return quote?.notas?.trim() === "Auto-generated from project Gantt";
}

/** Optional stage roles are not identity mappings. Only ambiguous live IDs block edits. */
export function liveStageIdentityIssues(stages: Array<{ id: string; name: string; source_quote_stage_id?: string | null }>) {
  const counts = new Map<string, number>();
  for (const stage of stages) {
    if (stage.source_quote_stage_id) counts.set(stage.source_quote_stage_id, (counts.get(stage.source_quote_stage_id) ?? 0) + 1);
  }
  return stages.filter(stage => stage.source_quote_stage_id && (counts.get(stage.source_quote_stage_id) ?? 0) > 1).map(stage => stage.name);
}