import type {FlowExpense} from './project-expense-flow';
export type PendingExpense=FlowExpense&{project_name:string;client_name:string|null;person_name:string|null;invoice_pending:number|null;reimbursement_pending:number|null;reserved_amount:number;receipt_bucket:string};
export function pendingClientExpenses(rows:PendingExpense[]){return rows.filter(e=>(e.workflow_version===2?e.rebill_mode!==null&&e.rebill_mode!=='none':e.rebillable)&&e.invoiced_at===null&&(e.invoice_pending===null||e.invoice_pending>0));}
export function pendingStaffExpenses(rows:PendingExpense[]){return rows.filter(e=>e.payment_source_type==='personal'&&e.reimburse_collaborator_id!==null&&(e.reimbursement_pending===null||e.reimbursement_pending>0));}
export function expenseGroupTotals(rows:PendingExpense[],kind:'clients'|'staff'){
 const groups=new Map<string,{id:string;name:string;client:string|null;rows:PendingExpense[];total:number;unknown:number}>();
 for(const row of kind==='clients'?pendingClientExpenses(rows):pendingStaffExpenses(rows)){
 const id=kind==='clients'?row.project_id:row.reimburse_collaborator_id??'';const current=groups.get(id)??{id,name:kind==='clients'?row.project_name:row.person_name??'—',client:kind==='clients'?row.client_name:null,rows:[],total:0,unknown:0};
 const amount=kind==='clients'?row.invoice_pending:row.reimbursement_pending;current.rows.push(row);if(amount===null)current.unknown++;else current.total+=Number(amount);groups.set(id,current);
 }return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function canManuallyInvoice(e:PendingExpense){return e.workflow_version===2&&e.status!=='draft'&&e.eur_amount!==null&&e.tax_treatment!=='pending'&&(e.payment_source_type!=='personal'||e.approval_state==='approved')&&!e.invoiced_at;}
export function canManuallyReimburse(e:PendingExpense){return e.workflow_version===2&&e.payment_source_type==='personal'&&e.approval_state==='approved'&&e.eur_amount!==null&&e.reserved_amount<=e.eur_amount-Number(e.reimbursement_pending??0)&&Number(e.reimbursement_pending)>0;}