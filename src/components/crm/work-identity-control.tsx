import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { WorkView } from '@/lib/crm/work-numbering';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';

export function WorkIdentityControl({ kind, recordId, canRestart = false }: { kind: 'lead' | 'quote' | 'project'; recordId: string; canRestart?: boolean }) {
  const { t } = useTranslation('crm');
  const qc = useQueryClient();
  const [mode, setMode] = useState<'number' | 'restart' | null>(null);
  const [number, setNumber] = useState('');
  const [reason, setReason] = useState('');
  const [restartReference, setRestartReference] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['work-identity', kind, recordId], queryFn: async () => {
    const result = await supabase.rpc('crm_work_view', { _kind: kind, _record: recordId });
    if (result.error) throw result.error;
    return result.data as unknown as WorkView | null;
  } });
  const save = useMutation({ mutationFn: async () => {
    if (!data?.workId || data.revision === undefined) throw new Error(t('workNumbering.unmapped'));
    if (mode === 'number') {
      const result = await supabase.rpc('crm_work_edit_number', { _work: data.workId, _number: number.trim(), _expected_revision: data.revision, _reason: reason.trim() });
      if (result.error) throw result.error;
    } else {
      const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric' }).format(new Date()));
      const result = await supabase.rpc('crm_work_restart', { _work: data.workId, _year: year, _expected_revision: data.revision, _reason: reason.trim() });
      if (result.error) throw result.error;
      const reference = await supabase.rpc('crm_work_reference', { _version: result.data, _ordinal: 0 });
      if (reference.error) throw reference.error;
      setRestartReference(reference.data);
    }
  }, onSuccess: () => { setMode(null); setReason(''); qc.invalidateQueries({ queryKey: ['work-identity'] }); toast.success(t('workNumbering.saved')); }, onError: (error: Error) => toast.error(error.message) });
  if (!data?.reference) return null;
  const open = (next: 'number' | 'restart') => { setNumber(data.canonicalNumber ?? ''); setReason(''); setMode(next); };
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-work-reference={data.reference}>
    <span className="font-mono tabular-nums" title={data.folder}>{restartReference ?? data.reference}</span>
    {data.mapped && <>
      {data.canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" title={t('workNumbering.edit')} aria-label={t('workNumbering.edit')} onClick={() => open('number')}><Pencil className="h-3.5 w-3.5" /></Button>}
      {canRestart && <Button variant="ghost" size="sm" onClick={() => open('restart')}><RotateCcw className="mr-1 h-3.5 w-3.5" />{t('workNumbering.restart')}</Button>}
    </>}
    <Dialog open={mode !== null} onOpenChange={(value) => { if (!value) setMode(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{t(mode === 'number' ? 'workNumbering.edit' : 'workNumbering.restart')}</DialogTitle><DialogDescription>{t(mode === 'number' ? 'workNumbering.numberImpact' : 'workNumbering.restartImpact', { folder: data.folder })}</DialogDescription></DialogHeader>
        {mode === 'number' && <div className="space-y-2"><Label htmlFor="work-number">{t('workNumbering.number')}</Label><Input id="work-number" value={number} onChange={(e) => setNumber(e.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="work-number-reason">{t('workNumbering.reason')}</Label><Input id="work-number-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending || reason.trim().length < 3 || (mode === 'number' && !number.trim())}>{t('workNumbering.confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}