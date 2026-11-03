import {supabase} from '@/integrations/supabase/client';
import type {IncomingTimingRow} from '@/lib/projects/payment-timing';

/** Caller-scoped operational dates, never source-proposal relative dates. */
export async function readProjectIncomingRows(projectId?: string) {
  let query=supabase.from('pm_payment_schedule_items').select('project_id').eq('direction','inflow');
  if(projectId)query=query.eq('project_id',projectId);
  const visible=await query;
  if(visible.error)throw visible.error;
  const rows: IncomingTimingRow[]=[];
  // Sequential bounded reads keep pressure low on the shared database pool.
  for(const id of new Set((visible.data??[]).map(row=>row.project_id))){
    const timing=await supabase.rpc('pm_project_incoming_timing',{_project:id});
    if(timing.error)throw timing.error;
    rows.push(...(timing.data as unknown as {rows:IncomingTimingRow[]}).rows);
  }
  return rows;
}