import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/reports/use-hours-logged';
import { effectiveRates, type DefaultRateInfo } from './use-default-rates';
import { loggedEntryFigures, type FinancialEntry } from './financial-calculation';
import type { StageWithAllocations, Resource } from './types';

export function useProjectEntryFigures(projectId: string, stages: StageWithAllocations[] | undefined, resources: Resource[] | undefined, defaults: Map<string, DefaultRateInfo> | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pm-project-entry-figures', projectId, stages, resources, defaults],
    enabled: enabled && !!stages && !!resources && !!defaults,
    queryFn: async () => {
      const stageIds = (stages ?? []).map(s => s.id);
      if (!stageIds.length) return [];
      const allocations = await fetchAll<{ stage_id: string; tasks: { id: string }[] | { id: string } | null }>((a,b) => supabase.from('pm_allocations').select('stage_id,tasks:pm_tasks(id)').in('stage_id', stageIds).order('id').range(a,b) as never);
      const taskStages = new Map(allocations.flatMap(a => (Array.isArray(a.tasks) ? a.tasks : a.tasks ? [a.tasks] : []).map(t => [t.id, a.stage_id] as const)));
      const quoteStages = new Map((stages ?? []).filter(s => s.source_quote_stage_id && s.stage_kind !== 'retainer_month').map(s => [s.source_quote_stage_id, s.id]));
      const clauses = [`pm_stage_id.in.(${stageIds.join(',')})`];
      if (taskStages.size) clauses.push(`task_id.in.(${[...taskStages.keys()].join(',')})`);
      if (quoteStages.size) clauses.push(`quote_stage_id.in.(${[...quoteStages.keys()].join(',')})`);
      const [entries, mapping] = await Promise.all([
        fetchAll<FinancialEntry & { id: string; user_id: string; entry_date: string; quote_stage_id: string | null }>((a,b) => supabase.from('pm_time_entries').select('id,user_id,entry_date,task_id,pm_stage_id,quote_stage_id,hours,billable,entry_type,cost_rate_snapshot,sale_rate_snapshot').eq('entry_type','project').or(clauses.join(',')).order('id').range(a,b) as never),
        supabase.rpc('pm_list_user_resource_map'),
      ]);
      if (mapping.error) throw mapping.error;
      const identities = new Map((mapping.data ?? []).map(m => [m.user_id, m.resource_id]));
      const byResource = new Map((resources ?? []).map(r => [r.id,r]));
      return [...new Map(entries.map(e => [e.id,e])).values()].map(e => {
        const stageId = e.pm_stage_id ?? (e.task_id ? taskStages.get(e.task_id) : undefined) ?? (e.quote_stage_id ? quoteStages.get(e.quote_stage_id) : undefined);
        const resourceId = identities.get(e.user_id) ?? null;
        const resource = resourceId ? byResource.get(resourceId) : undefined;
        const rates = resource ? effectiveRates(resource, defaults) : { cost: NaN, sale: NaN };
        const retainer = (stages ?? []).find(s => s.id === stageId)?.stage_kind?.startsWith('retainer') ?? false;
        return { id: e.id, stageId, resourceId, resource, month: e.entry_date.slice(0,7), ...loggedEntryFigures(e, rates, retainer) };
      });
    },
  });
}