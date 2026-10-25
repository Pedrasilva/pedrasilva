import { safeProfileForAI } from './portfolio';
/** Shared safe AI identity; internal clients/names never leave this boundary when protected. */
export async function getProjectProfilesForMatching() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from("marketing_project_profiles")
    .select(
      "id, project_id, marketing_key, internal_name, internal_client, aliases, sector, location, client_ambition, central_idea, challenges, proud_of, key_facts, name_rule, public_description, pm_projects(name, client)",
    );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown> & { marketing_key: string; name_rule: string; internal_name: string | null; internal_client: string | null; pm_projects: { name: string; client: string | null } | null }>).map(
    ({ pm_projects, internal_name, internal_client, ...p }) => safeProfileForAI({
      ...p,
      project_id: p.marketing_key,
      project_name: pm_projects?.name ?? internal_name,
      client: pm_projects?.client ?? internal_client,
    }),
  );
}
