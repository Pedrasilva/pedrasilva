import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WeekNote } from './week-notes';
export const weekNotesQuery = (week: string) => queryOptions({
  queryKey: ['week-project-notes', week],
  queryFn: async () => {
    const [notes, names] = await Promise.all([
      supabase.rpc('pm_week_notes_read', { _week: week }),
      supabase.rpc('pm_week_note_editor_names'),
    ]);
    if (notes.error) throw notes.error;
    if (names.error) throw names.error;
    return { notes: notes.data as unknown as WeekNote[], names: names.data as Record<string,string> };
  },
});