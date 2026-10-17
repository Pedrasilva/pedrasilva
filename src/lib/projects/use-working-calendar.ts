import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setWorkingCalendarHolidays } from "./gantt-utils";

/**
 * Loads the shared working-day calendar (holidays + office closures) into
 * gantt-utils. Returns true once loaded (or failed — never blocks the app).
 */
export function useWorkingCalendar(enabled = true): boolean {
  const q = useQuery({
    queryKey: ["working-calendar-holidays"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("data");
      if (error) throw error;
      const dates = ((data ?? []) as Array<{ data: string }>).map((h) => h.data);
      setWorkingCalendarHolidays(dates);
      return dates.length;
    },
  });
  return q.isSuccess || q.isError;
}
