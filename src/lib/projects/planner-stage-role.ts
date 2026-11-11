/** Operational evidence only: never consult a mutable source proposal. */
export function plannerStageRole(stage: { stage_role?: string | null; is_self?: boolean | null; supplier_id?: string | null; supplier_placeholder?: string | null }): 'architecture' | 'client' | 'supplier_group' | 'supplier_phase' {
  if (stage.stage_role === 'client') return 'client';
  if (stage.is_self === true) return 'architecture';
  if (stage.stage_role === 'supplier_group' || stage.stage_role === 'supplier_phase') return stage.stage_role;
  if (stage.is_self === false || stage.supplier_id || stage.supplier_placeholder) return 'supplier_phase';
  return 'architecture';
}
