/** Every project marketing profile with project name/client, for Pass 3 AI matching (service role). Not called yet. */
export async function getProjectProfilesForMatching() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from("marketing_project_profiles")
    .select(
      "id, project_id, aliases, sector, location, client_ambition, central_idea, challenges, proud_of, key_facts, name_rule, public_description, pm_projects(name, client)",
    );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown> & { pm_projects: { name: string; client: string | null } | null }>).map(
    ({ pm_projects, ...p }) => ({
      ...p,
      project_name: pm_projects?.name ?? null,
      client: pm_projects?.client ?? null,
    }),
  );
}
