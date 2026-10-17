import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

/** UI mirrors the existing database decision; it never grants access. */
export function useInventoryEditAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inventory", "edit-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("can_manage_inventory", { _user_id: user.id });
      if (error) throw error;
      return data === true;
    },
  });
}