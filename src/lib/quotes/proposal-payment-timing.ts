/** Display-only proposal timing. Stored anchors are never calendar promises. */
export interface TimingStage { id: string; name: string; start_date: string; end_date: string; stage_kind?: string | null }
export interface TimingItem { id?: string; stage_id?: string | null; trigger_type: string; sort_order?: number | null; expected_invoice_date?: string | null }
export function proposalPaymentTiming(item: TimingItem, stages: TimingStage[], items: TimingItem[], language: string): string {
  const pt = language === "pt-PT";
  if (item.trigger_type === "project_start") return pt ? "Adjudicação" : "Appointment";
  const stage = stages.find(s => s.id === item.stage_id);
  if (item.trigger_type === "monthly") {
    const siblings = items.filter(i => i.stage_id === item.stage_id && i.trigger_type === "monthly").slice().sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const index = Math.max(0, siblings.findIndex(i => i === item || (i.id && i.id === item.id))) + 1;
    return pt ? `Mês ${index} de obra` : `Construction month ${index}`;
  }
  if (stage && (item.trigger_type === "stage_start" || item.trigger_type === "stage_end")) {
    const date = item.trigger_type === "stage_start" ? stage.start_date : stage.end_date;
    const regular = stages.filter(s => s.stage_kind !== "retainer_monthly");
    const origin = regular.reduce((min,s) => s.start_date < min ? s.start_date : min, regular[0]?.start_date ?? date);
    const days = Math.floor((Date.parse(date) - Date.parse(origin)) / 86400000);
    if (Number.isFinite(days) && days >= 0) return pt ? `Semana ${Math.floor(days / 7) + 1}` : `Week ${Math.floor(days / 7) + 1}`;
    return pt ? `${item.trigger_type === "stage_end" ? "Conclusão" : "Início"} de ${stage.name}` : `${item.trigger_type === "stage_end" ? "Completion" : "Start"} of ${stage.name}`;
  }
  return pt ? "Marco por definir" : "Milestone to be defined";
}
export function proposalTimingToken(label: string): string { return `relative:${label}`; }
export function decodeProposalTiming(value: string | null | undefined): string | null { return value?.startsWith("relative:") ? value.slice(9) : null; }