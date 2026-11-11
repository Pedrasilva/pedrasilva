/** A financial stage owns its value; structural containers only roll up. Legacy values are not rewritten. */
export interface CommercialStage {
  id: string; budget: number | null; parent_stage_id?: string | null; stage_kind?: string;
  stage_role?: string | null; commercial_value_owned?: boolean;
}
export function stageOwnsValue(s: CommercialStage) {
  return s.commercial_value_owned === true && s.stage_role !== 'client' && s.stage_role !== 'supplier_group';
}
export function commercialStageValue(s: CommercialStage, stages: CommercialStage[]): number {
  const kids = stages.filter(c => c.parent_stage_id === s.id && c.stage_kind !== 'retainer_month');
  if (stageOwnsValue(s) || !kids.length) return s.budget == null ? NaN : Number(s.budget);
  return kids.reduce((sum,c) => sum + commercialStageValue(c,stages),0);
}
export function commercialProjectValue(stages: CommercialStage[]) {
  const ids=new Set(stages.map(s=>s.id));
  return stages.filter(s=>s.stage_kind!=='retainer_month' && (!s.parent_stage_id || !ids.has(s.parent_stage_id)))
    .reduce((sum,s)=>sum+commercialStageValue(s,stages),0);
}
export function splitBalance(value: number, children: number[]) {
  const allocated=children.reduce((sum,n)=>sum+n,0);
  return {allocated,remaining:value-allocated,valid:allocated<=value};
}