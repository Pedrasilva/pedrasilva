import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoardData } from "./week-board";

export function weekBoardQuery(week: string) {
  return queryOptions({
    queryKey: ["pm-week-board", week],
    queryFn: async (): Promise<BoardData> => {
      const { data, error } = await supabase.rpc("pm_week_board", { _week_start: week });
      if (error) throw error;
      return data as unknown as BoardData;
    },
  });
}