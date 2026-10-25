import { redactProtectedNames } from './portfolio';

/** Apply at the serialization boundary: free text can repeat an internal client too. */
export async function marketingAIInput(system: string, content: unknown[]) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('marketing_project_profiles')
    .select('name_rule,internal_name,internal_client,aliases,pm_projects(name,client)').neq('name_rule','name');
  if (error) throw error;
  const names = (data ?? []).flatMap(p => [p.internal_name,p.internal_client,p.pm_projects?.name,p.pm_projects?.client,...p.aliases]).filter((v): v is string => !!v?.trim());
  const scrub = (value: unknown): unknown => {
    if (typeof value === 'string') return redactProtectedNames(value,names);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      const row=value as Record<string,unknown>;
      // Signed storage URLs are opaque assets, not editorial prose.
      if (row.type === 'image') return row;
      return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,scrub(v)]));
    }
    return value;
  };
  return {system:redactProtectedNames(system,names),content:content.map(scrub)};
}