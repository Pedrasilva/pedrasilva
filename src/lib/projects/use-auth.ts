import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectsProfile {
  full_name: string | null;
  resource_id: string | null;
}

/**
 * Adapter around the global useAuth() to provide the shape expected by the
 * Projects module (profile.full_name / profile.resource_id), resolving the
 * resource via the pm_get_my_resource_id() RPC.
 */
export function useProjectsAuth() {
  const auth = useAuth();
  const [profile, setProfile] = useState<ProjectsProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!auth.user) {
      setProfile(null);
      return;
    }
    (async () => {
      const { data: resourceId } = await supabase.rpc("pm_get_my_resource_id");
      if (cancelled) return;
      setProfile({
        full_name: (auth.user!.user_metadata as { full_name?: string })?.full_name ?? null,
        resource_id: (resourceId as string | null) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user?.id]);

  return {
    ...auth,
    profile,
  };
}
