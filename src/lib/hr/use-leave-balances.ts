import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";

export type LeaveBalanceRow = Database["public"]["Functions"]["hr_leave_balances"]["Returns"][number];

export function useLeaveBalances(year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["leave-balances", user?.id, year],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_leave_balances", { _year: year });
      if (error) throw error;
      return data;
    },
  });
}