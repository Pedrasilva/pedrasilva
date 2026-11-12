export interface OutlineRow { id: string; parent_stage_id?: string | null; sort_order?: number | null }
export interface OutlinePatch { id: string; parent_stage_id: string | null; sort_order: number }
/** Hierarchy moves use persisted sibling positions, never displayed WBS or dates. */
export function outlineMove(rows: OutlineRow[], id: string, action: 'up' | 'down' | 'indent' | 'outdent' | 'position', position = 1): OutlinePatch[] {
  const target = rows.find(r => r.id === id);
  if (!target) return [];
  const parent = target.parent_stage_id ?? null;
  const siblings = (pid: string | null) => rows.filter(r => (r.parent_stage_id ?? null) === pid).sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
  const current = siblings(parent);
  const index = current.findIndex(r => r.id === id);
  const place = (pid: string | null, at: number) => {
    const list = siblings(pid).filter(r => r.id !== id);
    list.splice(Math.max(0, Math.min(at, list.length)), 0, target);
    return list.map((r,i) => ({id:r.id,parent_stage_id:pid,sort_order:(i+1)*10})).filter(p => {
      const old = rows.find(r => r.id === p.id);
      return old?.sort_order !== p.sort_order || (old.parent_stage_id ?? null) !== p.parent_stage_id;
    });
  };
  if (action === 'position') return place(parent, position - 1);
  if (action === 'indent') {
    const previous = current[index - 1];
    return previous ? place(previous.id, siblings(previous.id).length) : [];
  }
  const parentRow = rows.find(r => r.id === parent);
  if (action === 'outdent') return parentRow ? place(parentRow.parent_stage_id ?? null, siblings(parentRow.parent_stage_id ?? null).findIndex(r => r.id === parentRow.id) + 1) : [];
  const delta = action === 'up' ? -1 : 1;
  const adjacent = current[index + delta];
  if (adjacent) {
    const children = siblings(adjacent.id);
    if (children.length) return place(adjacent.id, delta < 0 ? children.length : 0);
    return place(parent, index + delta);
  }
  if (!parentRow) return [];
  const grandparent = parentRow.parent_stage_id ?? null;
  const parentIndex = siblings(grandparent).findIndex(r => r.id === parentRow.id);
  return place(grandparent, parentIndex + (delta > 0 ? 1 : 0));
}