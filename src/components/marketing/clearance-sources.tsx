import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from '@/hooks/use-permissions-v2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { ClearanceSource } from '@/lib/marketing/clearance';

export function useClearanceSources() {
  return useQuery({ queryKey: ['marketing-clearance-sources'], staleTime: 10000, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('marketing_draft_clearance_sources').select('*');
    if (error) throw error;
    return (data ?? []) as ClearanceSource[];
  } });
}
export function DismissCaptureFlag({ captureId, flag }: { captureId: string; flag: string }) {
  const { t } = useTranslation('marketing');
  const { allowed } = useCan('marketing.curate', 'all');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!allowed) return null;
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('marketing_dismiss_capture_flag', { _capture: captureId, _flag: flag, _reason: reason });
      if (error) throw error;
      await qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('marketing-') });
      setOpen(false); setReason(''); toast.success(t('clearanceReview.dismissed'));
    } catch (e) { toast.error(e instanceof Error ? e.message : t('posts.error')); }
    finally { setBusy(false); }
  };
  return <><Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{t('clearanceReview.dismiss')}</Button>
    <Dialog open={open} onOpenChange={v => !busy && setOpen(v)}><DialogContent><DialogHeader><DialogTitle>{t('clearanceReview.dismissTitle')}</DialogTitle></DialogHeader>
      <p className="text-sm">{flag}</p><Input aria-label={t('clearanceReview.reason')} placeholder={t('clearanceReview.reason')} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} />
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('common:cancel')}</Button><Button disabled={busy || reason.trim().length < 3} onClick={save}>{t('clearanceReview.dismiss')}</Button></DialogFooter>
    </DialogContent></Dialog></>;
}
export function ClearanceSources({ draftId, safetyFlags = [] }: { draftId: string; safetyFlags?: string[] }) {
  const { t } = useTranslation('marketing');
  const { data = [] } = useClearanceSources();
  const rows = data.filter(r => r.draft_id === draftId);
  const extraFlags = safetyFlags.filter(f => !rows.some(r => r.flag === f));
  const warning = rows.some(r => r.warning) || extraFlags.length > 0;
  return <div className="space-y-1 text-xs" data-clearance-draft={draftId}>
    {warning && <p className="font-medium text-warning">{t('posts.clearanceWarning')}</p>}
    {rows.map(r => <div key={`${r.kind}-${r.source_id}-${r.flag ?? ''}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`${r.warning ? 'text-warning' : 'text-muted-foreground'} min-w-0 break-words`}>{t(r.clearance ? "clearanceReview.sourceWithStatus" : "clearanceReview.source", { kind: t(`clearanceReview.${r.kind}`), label: r.label, status: r.clearance ? t(`clearance.${r.clearance}`) : "", check: r.clearance === "cleared" ? " ✓" : "" })}</span>
      {r.kind === 'project' ? r.profile_id && <Link className="text-primary underline" to="/marketing/projects/$profileId" params={{ profileId: r.profile_id }}>{t('profile.openProfile')}</Link> : <Link className="text-primary underline" to="/marketing" search={{ capture: r.source_id }}>{t('clearanceReview.openInbox')}</Link>}
      {r.kind === 'capture' && r.no_project && <span className="text-muted-foreground">{t('clearanceReview.noProject')}</span>}
      {r.kind === 'flag' && r.flag && <DismissCaptureFlag captureId={r.source_id} flag={r.flag} />}
    </div>)}
    {extraFlags.map(f => <p key={f} className="text-warning">{f}</p>)}
  </div>;
}