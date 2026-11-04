import {createFileRoute} from '@tanstack/react-router';
import {InvoicesToIssue} from '@/components/finance/invoices-to-issue';
import {invoicesToIssueOptions} from '@/lib/finance/use-invoices-to-issue';
import {expensePendingOptions} from '@/lib/finance/use-expense-pending-lists';
export const Route=createFileRoute('/_app/finance/invoicing/to-issue')({
 head:()=>({meta:[{title:'Faturas a emitir — PSA Hub'},{name:'description',content:'Confirmação de recebimentos, emissão e previsão mensal dos projetos autorizados.'},{property:'og:title',content:'Faturas a emitir — PSA Hub'},{property:'og:description',content:'Datas operacionais, confirmações e previsão de recebimentos do atelier.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 loader:({context})=>Promise.all([context.queryClient.ensureQueryData(invoicesToIssueOptions()),context.queryClient.ensureQueryData(expensePendingOptions())]),component:InvoicesToIssue,
});