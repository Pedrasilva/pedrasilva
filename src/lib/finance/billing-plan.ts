import type {IncomingTimingRow} from '@/lib/projects/payment-timing';
export type BillingPlanItem = IncomingTimingRow & {direction:'inflow'|'outflow';description:string;revision:number;manual_group_id:string|null;group_description:string|null;group_date_override:string|null;supplier_name:string|null;stage_completed:boolean;protected:boolean};
export type BillingPlan = {rows:BillingPlanItem[];stages:{id:string;name:string;parent_stage_id:string|null;sort_order:number}[];today:string;can_edit:boolean;can_confirm:boolean;can_issue:boolean;can_read_suppliers:boolean};
export type BillingPlanGroup = {id:string;members:BillingPlanItem[];description:string;date:string|null;amount:number;vat:number;total:number;protected:boolean;confirmed:boolean;manual:boolean};
export const roundMoney=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function groupBillingPlan(rows:BillingPlanItem[]):BillingPlanGroup[]{
 const groups=new Map<string,BillingPlanItem[]>();
 for(const row of rows){const id=row.manual_group_id??row.id;groups.set(id,[...(groups.get(id)??[]),row]);}
 return [...groups].map(([id,members])=>{const first=members[0];const dates=members.map(m=>m.planned_invoice_date).filter((d):d is string=>!!d).sort();const amount=roundMoney(members.reduce((s,m)=>s+Number(m.amount_value),0));const vat=roundMoney(members.reduce((s,m)=>s+roundMoney(Number(m.amount_value)*Number(m.vat_rate)/100),0));return {id,members,description:first?.group_description??first?.description??'',date:first?.group_date_override??(dates.length===members.length?dates.at(-1)??null:null),amount,vat,total:roundMoney(amount+vat),protected:members.some(m=>m.protected||m.frozen),confirmed:members.every(m=>m.workflow?.confirmation_current),manual:!!first?.manual_group_id};});
}
export function billingPlanState(group:BillingPlanGroup,today:string){
 if(group.members.every(m=>m.billing_status==='paid'))return 'paid';
 if(group.protected)return 'issued';
 if(group.members.some(m=>m.stage_completed)||(group.date&&group.date<=today))return 'due';
 return 'planned';
}
