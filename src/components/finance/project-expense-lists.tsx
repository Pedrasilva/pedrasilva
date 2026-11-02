import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { expenseAction, expenseDirectory, expenseSale } from '@/lib/finance/project-expense-flow';
import { ProjectExpenseForm } from './project-expense-form';
import { InvoiceEditorDialog } from './invoice-editor-dialog';
import type { FlowExpense } from '@/lib/finance/project-expense-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableCell, TableRow } from '@/components/ui/table';
import { toast } from '@/lib/toast';
import { Plus, Pencil, Check, X, Undo2 } from 'lucide-react';

export function ProjectExpenseLists({ mode, projectId }: { mode: 'clients' | 'team' | 'project'; projectId?: string }) {
  const { t, i18n } = useTranslation(['finance', 'common']);
  const qc = useQueryClient();
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<string | null>(null);
  const [allocationExpense, setAllocationExpense] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoiceExpenses, setInvoiceExpenses] = useState<FlowExpense[] | null>(null);
  const dir = useQuery({ queryKey: ['project-expense-directory', projectId], queryFn: () => expenseDirectory(projectId) });
  const data = useQuery({ queryKey: ['expense-flow', projectId], queryFn: async () => {
    let eq = supabase.from('pm_expenses').select('*').eq('workflow_version', 2).order('created_at', { ascending: false });
    if (projectId) eq = eq.eq('project_id', projectId);
    const e = await eq; if (e.error) throw e.error;
    const f = await supabase.rpc('pe_expense_figures', { _project: projectId }); if (f.error) throw f.error;
    const o = await supabase.from('finance_holder_reimbursements').select('*').not('project_expense_id', 'is', null); if (o.error) throw o.error;
    const b = await supabase.from('project_reimbursement_batches').select('*').order('created_at', { ascending: false }); if (b.error) throw b.error;
    const a = await supabase.from('project_reimbursement_allocations').select('*').is('reversed_at', null); if (a.error) throw a.error;
    const ia = await supabase.from('project_expense_invoice_allocations').select('*').is('reversed_at', null); if (ia.error) throw ia.error;
    const ra = await supabase.from('project_expense_receipt_allocations').select('*').is('reversed_at', null); if (ra.error) throw ra.error;
    const s = await supabase.rpc('pe_expense_settlement_figures', { _project: projectId }); if (s.error) throw s.error;
    return { expenses: e.data, figures: f.data, settlements: s.data, obligations: o.data, batches: b.data, allocations: a.data, invoices: ia.data, receipts: ra.data };
  } });
  const lines = useQuery({ queryKey: ['expense-flow-lines', allocationExpense], enabled: !!allocationExpense, queryFn: async () => {
    const e = data.data?.expenses.find(e => e.id === allocationExpense);
    if (!e) return [];
    const r = await supabase.from('financial_document_lines').select('id,description,document_id,amount_ex_vat,financial_documents!inner(document_number,direction,doc_type,status)').eq('project_id', e.project_id).eq('financial_documents.direction', 'issued').eq('financial_documents.doc_type', 'client_invoice').neq('financial_documents.status', 'cancelled'); if (r.error) throw r.error; return r.data;
  } });
  const payments = useQuery({ queryKey: ['expense-flow-client-payments'], enabled: mode === 'clients', queryFn: async () => { const r = await supabase.from('financial_document_payments').select('id,document_id,amount,payment_date').gt('amount', 0); if (r.error) throw r.error; return r.data; } });
  const [paymentAllocation, setPaymentAllocation] = useState<string | null>(null);
  const [payment, setPayment] = useState('');
  const money = (n: number | null) => n === null || !Number.isFinite(n) ? t('finance:expenseFlow.pending') : new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(n);
  const name = (id: string, list: 'projects' | 'collaborators') => dir.data?.[list].find(c => c.id === id)?.name ?? id;
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try { const r = await expenseAction(action, payload); await qc.invalidateQueries({ queryKey: ['expense-flow'] }); await qc.invalidateQueries({ queryKey: ['project-expenses'] }); await qc.invalidateQueries({ queryKey: ['project-insights'] }); toast.success(t('finance:expenseFlow.saved')); return r; }
    catch (e) { toast.error((e as Error).message); return null; } finally { setBusy(false); }
  }
  const expenses = data.data?.expenses ?? [];
  const rows = expenses.filter(e => mode === 'clients' ? e.rebill_mode !== 'none' : mode === 'team' ? e.payment_source_type === 'personal' && e.approval_state === 'approved' : true);
  const groups = [...new Set(rows.map(e => mode === 'team' ? e.reimburse_collaborator_id ?? '' : e.project_id))];
  const picked = rows.filter(e => selected.includes(e.id));
  const batchAllocations = data.data?.allocations.filter(a => a.batch_id === batch) ?? [];
  const activeAllocation = data.data?.invoices.find(a => a.id === paymentAllocation);
  return <section className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t(`finance:expenseFlow.${mode}`)}</h2><Button onClick={() => { setEditing(null); setForm(true); }}><Plus className="mr-2 size-4" />{t('finance:expenseFlow.add')}</Button></header>
    {data.error && <p className="text-destructive">{(data.error as Error).message}</p>}
    {mode === 'clients' && <Button variant="outline" disabled={picked.length === 0 || new Set(picked.map(e => e.project_id)).size !== 1 || picked.some(e => e.tax_treatment === 'pending' || e.eur_amount === null || e.status === 'draft' || e.payment_source_type === 'personal' && e.approval_state !== 'approved')} onClick={() => setInvoiceExpenses(picked)}>{t('finance:expenseFlow.createInvoice')}</Button>}
    {expenses.some(e => e.eur_amount === null) && <p className="text-destructive text-sm">{t('finance:expenseFlow.missingCost', { count: expenses.filter(e => e.eur_amount === null).length })}</p>}
    {!data.isPending && rows.length === 0 && <p className="py-6 text-muted-foreground">{t('finance:expenseFlow.empty')}</p>}
    {groups.map(group => <div key={group} className="space-y-2"><h3 className="font-medium">{name(group, mode === 'team' ? 'collaborators' : 'projects')}</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow>{mode !== 'project' && <TableHead />}<TableHead>{t('finance:expenseFlow.description')}</TableHead><TableHead>{t('finance:expenseFlow.paidBy')}</TableHead><TableHead>{t('finance:expenseFlow.taxTreatment')}</TableHead><TableHead>{t('common:status')}</TableHead><TableHead className="text-right">{t('glossary:financial.cost')}</TableHead>{mode !== 'team' && <TableHead className="text-right">{t('finance:expenseFlow.saleAmount')}</TableHead>}<TableHead /></TableRow></TableHeader><TableBody>{rows.filter(e => (mode === 'team' ? e.reimburse_collaborator_id : e.project_id) === group).map(e => {
      const f = data.data?.figures.find(f => f.expense_id === e.id);
      const invoice = data.data?.invoices.filter(a => a.expense_id === e.id) ?? [];
      const settlement = data.data?.settlements.find(s => s.expense_id === e.id);
      const invoiced = invoice.reduce((s, a) => s + a.billed_amount, 0) - (settlement?.credited_net ?? 0);
      const sale = expenseSale(e.eur_amount, e.rebill_mode, e.markup_pct);
      const status = mode === 'team' ? (f?.reimbursed_amount ?? 0) >= (e.eur_amount ?? Infinity) ? 'paid' : 'approved' : mode === 'clients' ? (f?.received_amount ?? 0) >= invoice.reduce((s, a) => s + a.billed_amount + a.vat_amount, 0) - (settlement?.credited_net ?? 0) - (settlement?.credited_vat ?? 0) && invoiced > 0 ? 'paid' : sale !== null && invoiced >= sale ? 'included' : 'pending' : e.approval_state === 'pending' ? 'submitted' : e.status;
      return <TableRow key={e.id}>{mode !== 'project' && <TableCell><Checkbox checked={selected.includes(e.id)} disabled={busy || mode === 'team' && (f?.reserved_amount ?? 0) >= (e.eur_amount ?? 0)} onCheckedChange={v => setSelected(s => v ? [...s, e.id] : s.filter(id => id !== e.id))} aria-label={e.description} /></TableCell>}<TableCell><div className="font-medium">{e.description}</div><div className="text-xs text-muted-foreground">{e.incurred_at ? new Intl.DateTimeFormat(i18n.language).format(new Date(`${e.incurred_at}T12:00:00`)) : '—'} · {new Intl.NumberFormat(i18n.language, { style: 'currency', currency: e.original_currency ?? 'EUR' }).format(e.original_amount ?? 0)}</div>{mode === 'team' && <div className="text-xs text-muted-foreground">{name(e.project_id, 'projects')}</div>}</TableCell><TableCell>{e.payment_source_type === 'personal' ? name(e.reimburse_collaborator_id ?? '', 'collaborators') : t(`finance:expenseFlow.${e.payment_source_type}`)}</TableCell><TableCell><Badge variant="outline">{t(`finance:expenseFlow.${e.tax_treatment}`)}</Badge></TableCell><TableCell><Badge variant="secondary">{t(`finance:expenseFlow.${status}`)}</Badge></TableCell><TableCell className="text-right tabular-nums">{money(e.eur_amount)}</TableCell>{mode !== 'team' && <TableCell className="text-right tabular-nums">{money(sale)}{invoiced > 0 && <div className="text-xs text-muted-foreground">{t('finance:expenseFlow.included')}: {money(invoiced)}</div>}</TableCell>}<TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title={t('common:edit')} aria-label={t('common:edit')} disabled={busy} onClick={() => { setEditing(e.id); setForm(true); }}><Pencil className="size-4" /></Button>{e.approval_state === 'pending' && <><Button variant="ghost" size="icon" title={t('finance:expenseFlow.approve')} aria-label={t('finance:expenseFlow.approve')} disabled={busy} onClick={() => void act('decide', { expenseId: e.id, approve: true })}><Check className="size-4" /></Button><Button variant="ghost" size="icon" title={t('finance:expenseFlow.reject')} aria-label={t('finance:expenseFlow.reject')} disabled={busy} onClick={() => { const reason = window.prompt(t('finance:expenseFlow.reason')); if (reason) void act('decide', { expenseId: e.id, approve: false, reason }); }}><X className="size-4" /></Button></>}{mode === 'clients' && <Button size="sm" variant="outline" disabled={busy || e.tax_treatment === 'pending'} onClick={() => { setAllocationExpense(e.id); setAmount(String(e.eur_amount ?? '')); setLine(''); }}>{t('finance:expenseFlow.allocateInvoice')}</Button>}</div>{mode === 'clients' && invoice.map(a => <div key={a.id} className="flex gap-1 mt-2"><Button size="sm" variant="outline" onClick={() => { setPaymentAllocation(a.id); setPayment(''); setAmount(String(a.billed_amount + a.vat_amount)); }}>{t('finance:expenseFlow.allocateReceipt')}</Button><Button variant="ghost" size="icon" title={t('finance:expenseFlow.reverse')} aria-label={t('finance:expenseFlow.reverse')} onClick={() => { const reason = window.prompt(t('finance:expenseFlow.reason')); if (reason) void act('reverseInvoice', { allocationId: a.id, reason }); }}><Undo2 className="size-4" /></Button></div>)}</TableCell></TableRow>;
    })}</TableBody></Table></div></div>)}
    {mode === 'team' && <><Button disabled={busy || picked.length === 0 || new Set(picked.map(e => e.reimburse_collaborator_id)).size !== 1} onClick={async () => { const obligations = data.data?.obligations.filter(o => picked.some(e => e.id === o.project_expense_id)).map(o => o.id) ?? []; const r = await act('batch', { collaboratorId: picked[0]?.reimburse_collaborator_id, obligationIds: obligations }); if (r) { setBatch(r.id); setSelected([]); } }}>{t('finance:expenseFlow.createBatch', { count: picked.length })}</Button><h3 className="font-semibold">{t('finance:expenseFlow.batches')}</h3>{data.data?.batches.map(b => <div key={b.id} className="flex justify-between border-b border-border py-3"><span>{b.reference} · {name(b.collaborator_id, 'collaborators')}</span><Button variant="outline" onClick={() => setBatch(b.id)}>{t('finance:expenseFlow.openBatch')}</Button></div>)}</>}
    <ProjectExpenseForm open={form} onOpenChange={setForm} projectId={projectId} initial={expenses.find(e => e.id === editing)} finance={mode !== 'project'} />
    <InvoiceEditorDialog open={!!invoiceExpenses} documentId={null} initialExpenses={invoiceExpenses ?? undefined} initialProjectId={invoiceExpenses?.[0]?.project_id} onClose={() => { setInvoiceExpenses(null); void qc.invalidateQueries({ queryKey: ['expense-flow'] }); }} />
    <Dialog open={!!batch} onOpenChange={v => { if (!v) setBatch(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('finance:expenseFlow.batchTitle')}</DialogTitle></DialogHeader><p>{data.data?.batches.find(b => b.id === batch)?.reference}</p>{batchAllocations.map(a => { const o = data.data?.obligations.find(o => o.id === a.obligation_id); const e = expenses.find(e => e.id === o?.project_expense_id); return <div key={a.id} className="flex justify-between border-b border-border py-3"><div>{e?.description}<div className="text-xs text-muted-foreground">{t('finance:expenseFlow.settled')}: {money(a.settled_amount)}{a.bank_transaction_id && <> · {a.bank_transaction_id}</>}</div></div><span>{money(a.reserved_amount)}</span><Button variant="ghost" size="icon" aria-label={t('finance:expenseFlow.reverse')} title={t('finance:expenseFlow.reverse')} onClick={() => { const reason = window.prompt(t('finance:expenseFlow.reason')); if (reason) void act('reverseReimbursement', { allocationId: a.id, reason }); }}><Undo2 className="size-4" /></Button></div>; })}<p className="text-sm text-muted-foreground">{t('finance:expenseFlow.matchBankHint')}</p></DialogContent></Dialog>
    <Dialog open={!!allocationExpense} onOpenChange={v => { if (!v) setAllocationExpense(null); }}><DialogContent><DialogHeader><DialogTitle>{t('finance:expenseFlow.allocateInvoice')}</DialogTitle></DialogHeader><Label>{t('finance:expenseFlow.invoiceLine')}</Label><Select value={line || undefined} onValueChange={setLine}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lines.data?.map(l => <SelectItem key={l.id} value={l.id}>{l.financial_documents.document_number} · {l.description}</SelectItem>)}</SelectContent></Select><Label htmlFor="allocation-cost">{t('glossary:financial.cost')}</Label><Input id="allocation-cost" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /><Button disabled={!line || busy} onClick={async () => { const e = expenses.find(e => e.id === allocationExpense); const sale = expenseSale(Number(amount), e?.rebill_mode ?? null, e?.markup_pct ?? null) ?? 0; const vatRate = (e?.tax_parameters as { vatRate?: number } | null)?.vatRate ?? 0; const r = await act('invoice', { expenseId: allocationExpense, lineId: line, costAmount: Number(amount), vatAmount: Math.round(sale * vatRate) / 100 }); if (r) setAllocationExpense(null); }}>{t('common:confirm')}</Button></DialogContent></Dialog>
    <Dialog open={!!paymentAllocation} onOpenChange={v => { if (!v) setPaymentAllocation(null); }}><DialogContent><DialogHeader><DialogTitle>{t('finance:expenseFlow.allocateReceipt')}</DialogTitle></DialogHeader><Select value={payment || undefined} onValueChange={setPayment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{payments.data?.map(p => <SelectItem key={p.id} value={p.id}>{p.payment_date} · {money(p.amount)}</SelectItem>)}</SelectContent></Select><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /><Button disabled={!payment || !activeAllocation || busy} onClick={async () => { const r = await act('receipt', { allocationId: paymentAllocation, paymentId: payment, amount: Number(amount) }); if (r) setPaymentAllocation(null); }}>{t('common:confirm')}</Button></DialogContent></Dialog>
  </section>;
}