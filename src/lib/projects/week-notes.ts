import type { BoardData, DraftSlot } from './week-board';
export type NoteKind = 'project' | 'opportunity' | 'week';
export type WeekNote = {
  id: string; week_start: string; kind: NoteKind; project_id: string | null; opportunity_id: string | null; subject_name?: string;
  status: string | null; notes: string; target_text: string; flag: string;
  week_topics: Record<string, string>; added_manually: boolean; carried_from_week: string | null;
  revision: number; updated_by: string; updated_at: string;
};
export const noteKey = (n: Pick<WeekNote,'kind'|'project_id'|'opportunity_id'>) => `${n.kind}:${n.project_id ?? n.opportunity_id ?? ''}`;
export function latestNotes(rows: WeekNote[], week: string): WeekNote[] {
  const byKey = new Map<string,WeekNote>();
  for (const row of rows) if (row.week_start <= week && (!byKey.has(noteKey(row)) || (byKey.get(noteKey(row))?.week_start ?? '') < row.week_start)) byKey.set(noteKey(row), row);
  return [...byKey.values()];
}
export function noteParticipants(data: BoardData, slots: DraftSlot[], project: string) {
  const ids = new Set(slots.filter(s => s.project_id === project).map(s => s.resource_id));
  return data.resources.filter(r => ids.has(r.id)).map(r => r.name);
}
export function noteSeed(row: WeekNote | undefined, week: string) {
  return { status: row?.status ?? null, notes: row?.notes ?? '', target_text: row?.target_text ?? '', flag: row?.flag ?? '',
    week_topics: row?.week_topics ?? {}, added_manually: row?.added_manually ?? false,
    carried_from_week: row && row.week_start < week ? row.week_start : row?.carried_from_week ?? null };
}