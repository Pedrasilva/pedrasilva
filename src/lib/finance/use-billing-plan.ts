import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {invoiceRpc} from './use-invoices-to-issue';
import type {BillingPlan} from './billing-plan';
export function useBillingPlan(projectId:string|undefined){return useQuery({queryKey:['billing-plan',projectId],enabled:!!projectId,queryFn:async()=>await invoiceRpc('pm_billing_plan',{_project:projectId}) as BillingPlan});}
export function useBillingFiscalAccess(){return useQuery({queryKey:['billing-fiscal-access'],queryFn:async()=>await invoiceRpc('pm_billing_can_act_fiscal') as boolean});}
export function useBillingPlanAction(projectId:string){const qc=useQueryClient();return useMutation({mutationFn:async({name,args}:{name:string;args:Record<string,unknown>})=>invoiceRpc(name,args),onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:['billing-plan',projectId]}),qc.invalidateQueries({queryKey:['pm-incoming-timing',projectId]}),qc.invalidateQueries({queryKey:['finance','invoices-to-issue']}),qc.invalidateQueries({queryKey:['project-billing',projectId]})]);}});}
