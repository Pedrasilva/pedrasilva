import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { expenseAction, expenseDirectory, expenseSale, type FlowExpense, type Choice } from '@/lib/finance/project-expense-flow';
import { readProjectExpenseReceipt } from '@/lib/finance/project-expense-queue.functions';
import { supabase } from '@/integrations/supabase/client';
import { receiptStoragePath } from '@/lib/projects/expense-from-receipt';
import { Upload } from 'lucide-react';

function ChoiceInput({ id, value, choices, onChange }: { id: string; value: string; choices: Choice[]; onChange: (s: string) => void }) {
  return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{choices.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>;
}

export function ProjectExpenseForm({ open, onOpenChange, projectId, initial, finance = false }: { open: boolean; onOpenChange: (o: boolean) => void; projectId?: string; initial?: FlowExpense | null; finance?: boolean }) {
  const { t, i18n } = useTranslation(['finance', 'common', 'projects']);
  const qc = useQueryClient();
  const readReceipt = useServerFn(readProjectExpenseReceipt);
  const directory = useQuery({ queryKey: ['project-expense-directory', projectId], queryFn: () => expenseDirectory(projectId), enabled: open });
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));
  useEffect(() => { if (!open) return; setSavedId(initial?.id ?? null); setValues({ projectId: initial?.project_id ?? projectId ?? '', description: initial?.description ?? '', category: initial?.category ?? 'travel', date: initial?.incurred_at ?? new Date().toISOString().slice(0, 10), supplier: initial?.vendor ?? '', documentNumber: initial?.document_number ?? '', currency: initial?.original_currency ?? 'EUR', originalAmount: initial?.original_amount?.toString() ?? '', eurAmount: initial?.eur_amount?.toString() ?? '', exchangeDate: initial?.exchange_rate_date ?? '', exchangeSource: initial?.exchange_rate_source ?? '', exchangeEvidence: initial?.exchange_evidence ? JSON.stringify(initial.exchange_evidence) : '', paidBy: initial?.payment_source_type ?? 'personal', collaboratorId: initial?.reimburse_collaborator_id ?? '', cardId: initial?.payment_card_id ?? '', accountId: initial?.paid_from_account_id ?? '', rebillMode: initial?.rebill_mode ?? 'cost', markupPct: initial?.markup_pct?.toString() ?? '0', taxTreatment: initial?.tax_treatment ?? 'pending', vatRate: String((initial?.tax_parameters as { vatRate?: number } | null)?.vatRate ?? ''), notes: initial?.notes ?? '', receiptPath: initial?.receipt_path ?? '' }); }, [open, initial, projectId]);
  useEffect(() => { if (directory.data?.myCollaborator) setValues(v => ({ ...v, collaboratorId: v.collaboratorId || directory.data?.myCollaborator || '' })); }, [directory.data]);
  const money = (n: number | null) => n === null ? t('finance:expenseFlow.pending') : new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(n);
  const cost = values.currency === 'EUR' ? Number(values.originalAmount) || null : Number(values.eurAmount) || null;
  async function save(submit: boolean) {
    setBusy(true);
    try {
      const data = { ...values, expenseId: savedId, originalAmount: Number(values.originalAmount), eurAmount: values.eurAmount || null, markupPct: Number(values.markupPct || 0), collaboratorId: values.paidBy === 'personal' ? values.collaboratorId : null, accountId: values.paidBy === 'company_account' ? values.accountId : null, cardId: values.paidBy === 'company_card' ? values.cardId : null, exchangeEvidence: values.exchangeEvidence ? { reference: values.exchangeEvidence } : null, taxParameters: values.vatRate ? { vatRate: Number(values.vatRate) } : null };
      const saved = await expenseAction('save', data); setSavedId(saved.id);
      if (queueId) {
        const linked = await supabase.rpc('pe_link_queue', { _id: queueId, _expense: saved.id });
        if (linked.error) throw linked.error;
      }
      if (submit) await expenseAction('submit', { expenseId: saved.id });
      await qc.invalidateQueries({ queryKey: ['project-expenses'] }); await qc.invalidateQueries({ queryKey: ['expense-flow'] });
      toast.success(t('finance:expenseFlow.saved')); if (submit) onOpenChange(false);
      return saved.id;
    } catch (e) { toast.error((e as Error).message); return null; } finally { setBusy(false); }
  }
  async function upload(file: File) {
    const collaborator = directory.data?.myCollaborator;
    if (!values.projectId || !collaborator) { toast.error(t('finance:expenseFlow.chooseProject')); return; }
    setBusy(true);
    try {
      const path = receiptStoragePath(collaborator, values.projectId, file.name);
      const up = await supabase.storage.from('benefit-receipts').upload(path, file, { upsert: false }); if (up.error) throw up.error;
      set('receiptPath', path);
      const result = await readReceipt({ data: { projectId: values.projectId, storagePath: path } }); if (!result.ok) throw new Error(result.error);
      setQueueId(result.queueItemId ?? null);
      if (result.extracted) {
        const ex = result.extracted;
        setValues(v => ({ ...v, supplier: ex.supplier ?? v.supplier, documentNumber: ex.documentNumber ?? v.documentNumber, date: ex.date ?? v.date, currency: ex.currency ?? v.currency, originalAmount: ex.amount?.toString() ?? v.originalAmount }));
      }
      toast.success(t('finance:expenseFlow.receiptRead'));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const fields = ['description', 'date', 'supplier', 'documentNumber', 'currency', 'originalAmount'] as const;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{t('finance:expenseFlow.formTitle')}</DialogTitle></DialogHeader><form className="space-y-5" onSubmit={e => { e.preventDefault(); void save(true); }}>
    {!projectId && <div className="space-y-2"><Label htmlFor="pe-project">{t('common:project')}</Label><ChoiceInput id="pe-project" value={values.projectId} choices={directory.data?.projects ?? []} onChange={v => set('projectId', v)} /></div>}
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(k => <div key={k} className="space-y-2"><Label htmlFor={`pe-${k}`}>{t(`finance:expenseFlow.${k}`)}</Label><Input id={`pe-${k}`} required value={values[k] ?? ''} type={k === 'date' ? 'date' : k === 'originalAmount' ? 'number' : 'text'} step="0.01" onChange={e => set(k, e.target.value)} /></div>)}</div>
    {values.currency !== 'EUR' && <div className="grid gap-3 sm:grid-cols-2">{['eurAmount', 'exchangeDate', 'exchangeSource', 'exchangeEvidence'].map(k => <div key={k} className="space-y-2"><Label htmlFor={`pe-${k}`}>{t(`finance:expenseFlow.${k}`)}</Label><Input id={`pe-${k}`} value={values[k] ?? ''} type={k === 'exchangeDate' ? 'date' : k === 'eurAmount' ? 'number' : 'text'} step="0.01" onChange={e => set(k, e.target.value)} /></div>)}</div>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pe-paidBy">{t('finance:expenseFlow.paidBy')}</Label><ChoiceInput id="pe-paidBy" value={values.paidBy} choices={['personal', 'company_card', 'company_account'].map(id => ({ id, name: t(`finance:expenseFlow.${id}`) }))} onChange={v => set('paidBy', v)} /></div><div className="space-y-2"><Label htmlFor="pe-payer">{t(values.paidBy === 'personal' ? 'common:person' : 'finance:expenseFlow.paymentSource')}</Label><ChoiceInput id="pe-payer" value={values[values.paidBy === 'personal' ? 'collaboratorId' : values.paidBy === 'company_card' ? 'cardId' : 'accountId']} choices={(values.paidBy === 'personal' ? directory.data?.collaborators : values.paidBy === 'company_card' ? directory.data?.cards : directory.data?.accounts) ?? []} onChange={v => set(values.paidBy === 'personal' ? 'collaboratorId' : values.paidBy === 'company_card' ? 'cardId' : 'accountId', v)} /></div></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pe-rebill">{t('finance:expenseFlow.rebillMode')}</Label><ChoiceInput id="pe-rebill" value={values.rebillMode} choices={['none', 'cost', 'markup'].map(id => ({ id, name: t(`finance:expenseFlow.${id}`) }))} onChange={v => set('rebillMode', v)} /></div>{values.rebillMode === 'markup' && <div className="space-y-2"><Label htmlFor="pe-markup">{t('finance:expenseFlow.markupPct')}</Label><Input id="pe-markup" type="number" min="0" value={values.markupPct} onChange={e => set('markupPct', e.target.value)} /></div>}</div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pe-tax">{t('finance:expenseFlow.taxTreatment')}</Label><ChoiceInput id="pe-tax" value={values.taxTreatment} choices={(finance ? ['pending', 'disbursement', 'reinvoiced_cost'] : ['pending']).map(id => ({ id, name: t(`finance:expenseFlow.${id}`) }))} onChange={v => set('taxTreatment', v)} /></div>{finance && <div className="space-y-2"><Label htmlFor="pe-vat">{t('finance:expenseFlow.vatRate')}</Label><Input id="pe-vat" type="number" value={values.vatRate} onChange={e => set('vatRate', e.target.value)} /></div>}</div>
    <div className="flex justify-between border-y border-border py-3 text-sm"><span>{t('common:cost')}: {money(cost)}</span><span>{t('finance:expenseFlow.saleAmount')}: {money(expenseSale(cost, values.rebillMode, Number(values.markupPct)))}</span></div>
    <div className="space-y-2"><Label htmlFor="pe-notes">{t('finance:expenseFlow.notes')}</Label><Textarea id="pe-notes" value={values.notes} onChange={e => set('notes', e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="pe-receipt" className="flex items-center gap-2"><Upload className="size-4" />{t('finance:expenseFlow.receipt')}</Label><Input id="pe-receipt" type="file" accept="image/*,application/pdf" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} />{values.receiptPath && <p className="text-xs text-muted-foreground">{values.receiptPath.split('/').pop()}</p>}</div>
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>{t('finance:expenseFlow.saveDraft')}</Button><Button type="submit" disabled={busy}>{t('finance:expenseFlow.submit')}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}