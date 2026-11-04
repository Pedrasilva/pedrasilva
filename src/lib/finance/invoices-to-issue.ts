import type {IncomingTimingRow} from '@/lib/projects/payment-timing';
import {buildStageNumberMap,formatStageLabel,type NumberableStage} from '@/lib/quotes/stage-numbering';

export type InvoiceWorkflow = {confirmed_at:string|null; confirmed_by:string|null; note:string|null; confirmation_current:boolean; invoice_number:string|null; issue_date:string|null};
export type IssueRow = IncomingTimingRow & {project_name:string; client_name:string|null; workflow:InvoiceWorkflow; pm_date_moves:number;project_stages?:NumberableStage[]};
export function invoiceStageLabel(row:IssueRow){const stages=row.project_stages??[];const stage=stages.find(s=>s.id===row.stage_id);return stage?formatStageLabel(stage,buildStageNumberMap(stages).get(stage.id)):row.stage_name;}
export type IssueStatus = 'planned'|'due'|'confirmed'|'issued'|'paid'|'cancelled';
export type IssueGroup = 'overdue'|'thisWeek'|'next14Days'|'laterThisMonth'|'later'|'undefined'|'issued'|'paid'|'cancelled';
export function addDays(date:string,days:number){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function invoiceStatus(row:Pick<IssueRow,'billing_status'|'workflow'|'planned_invoice_date'>,today:string):IssueStatus {
  if(['paid','issued','cancelled'].includes(row.billing_status))return row.billing_status as IssueStatus;
  if(row.workflow?.confirmation_current)return 'confirmed';
  return row.planned_invoice_date&&row.planned_invoice_date<=addDays(today,14)?'due':'planned';
}
export function invoiceGroup(row:IssueRow,today:string):IssueGroup {
  const status=invoiceStatus(row,today);if(status==='issued'||status==='paid'||status==='cancelled')return status;
  const date=row.planned_invoice_date;if(!date)return 'undefined';if(date<today)return 'overdue';
  const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
  if(date<=addDays(today,7-weekday))return 'thisWeek';
  if(date<=addDays(today,14))return 'next14Days';
  if(date.slice(0,7)===today.slice(0,7))return 'laterThisMonth';return 'later';
}
export function invoiceWarnings(rows:IssueRow[],today:string){
  const pending=rows.filter(r=>!['issued','paid','cancelled'].includes(r.billing_status));
  return {overdue:pending.filter(r=>r.planned_invoice_date&&r.planned_invoice_date<today).length,
    unconfirmed:pending.filter(r=>r.planned_invoice_date&&r.planned_invoice_date<=addDays(today,14)&&!r.workflow?.confirmation_current).length,
    moved:rows.filter(r=>r.pm_date_moves>0).length};
}
export function monthlyIncoming(rows:IssueRow[]){
  const months=new Map<string,number>();let undated=0;
  for(const row of rows){if(['paid','cancelled'].includes(row.billing_status))continue;
    if(!row.planned_payment_date){undated++;continue;}
    const month=row.planned_payment_date.slice(0,7);months.set(month,(months.get(month)??0)+Number(row.amount_value));
  }
  return {months:[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,amount])=>({month,amount})),undated};
}