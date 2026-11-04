import {queryOptions,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import type {IssueRow} from './invoices-to-issue';
type Rpc = (name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
// New RPCs are additive; generated types are integration-managed.
export async function invoiceRpc(name:string,args?:Record<string,unknown>){const {data,error}=await (supabase.rpc as unknown as Rpc)(name,args);if(error)throw new Error(error.message);return data;}
export const invoicesToIssueOptions=()=>queryOptions({queryKey:['finance','invoices-to-issue'],queryFn:async()=>await invoiceRpc('fin_invoices_to_issue') as {rows:IssueRow[];today:string;can_issue:boolean},staleTime:0});
export function useInvoiceAction(projectId?:string){const qc=useQueryClient();return useMutation({mutationFn:async(input:{id:string;action:'confirm'|'issue';note?:string;number?:string;date?:string})=>input.action==='confirm'?invoiceRpc('pm_confirm_ready_to_invoice',{_item:input.id,_note:input.note??''}):invoiceRpc('fin_mark_incoming_issued',{_item:input.id,_number:input.number,_date:input.date}),onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:['finance','invoices-to-issue']}),qc.invalidateQueries({queryKey:['pm-incoming-timing',...(projectId?[projectId]:[])]})]);}});}