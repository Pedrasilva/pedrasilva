import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { numberStages, formatStageLabel } from '@/lib/quotes/stage-numbering';
import { canConfirmPublication, type AllocationPreviewRow, type WeekPreview } from '@/lib/projects/week-publication';
import type { BoardData, ExtensionNote } from '@/lib/projects/week-board';

export function WeekPublicationDialog({data,disabled}:{data:BoardData;disabled:boolean}) {
 const {t}=useTranslation('projects'); const qc=useQueryClient();
 const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [preview,setPreview]=useState<WeekPreview|null>(null);
 const [extensions,setExtensions]=useState<ExtensionNote[]>([]); const [overlap,setOverlap]=useState(false); const [baseline,setBaseline]=useState(false); const [replace,setReplace]=useState(false); const [error,setError]=useState(false);
 const [publicationId,setPublicationId]=useState('');
 async function refresh(chosen:ExtensionNote[]=extensions) {
  if(!data.plan) return; setBusy(true); setError(false); setPreview(null); setOverlap(false); setBaseline(false); setReplace(false);
  try { const r=await supabase.rpc('pm_preview_week_plan',{_plan_id:data.plan.id,_extensions:chosen}); if(r.error) throw r.error; setPreview(r.data as unknown as WeekPreview); }
  catch {setError(true);} finally{setBusy(false);}
 }
 async function publish() {
  if(!data.plan || !preview || !canConfirmPublication(preview,overlap,baseline,replace)) return; setBusy(true); setError(false);
  try {
   const r=await supabase.rpc('pm_apply_week_plan',{_plan_id:data.plan.id,_preview_token:preview.token,_extensions:extensions,_ack_overlap:overlap,_ack_baseline:baseline,_publication_id:publicationId});
   if(r.error) throw r.error;
   await qc.invalidateQueries({predicate:q=>['pm-week-board','pm-allocations-all','pm-project','pm-stages-all','pm-project-insights','stage-budget-control','pm-allocations-for-forecast','pm-stages-for-forecast','report-capacity-forecast','report-estimate-vs-actual'].includes(String(q.queryKey[0]))}); setOpen(false);
  } catch {setError(true); setPreview(null);} finally{setBusy(false);}
 }
 const stages=preview?.stages ?? data.stage_tree ?? data.stages;
 const numbered=[...new Set(stages.map(s=>s.project_id))].flatMap(id=>numberStages(stages.filter(s=>s.project_id===id)));
 const stageName=(id:string)=>{const n=numbered.find(s=>s.stage.id===id); return n ? formatStageLabel(n.stage,n.number) : t('weekPlan.noStage');};
 const row=(a:AllocationPreviewRow)=><span>{preview?.projects.find(p=>p.id===stages.find(s=>s.id===a.stage_id)?.project_id)?.name} · {stageName(a.stage_id)} · {a.start_date} – {a.end_date} · {a.day_part==='full' ? t('weekPublish.fullDay') : a.day_part ? t(`common:${a.day_part==='am'?'morning':'afternoon'}`) : '—'} · {a.hours_per_day}h{a.allocation_percentage != null && ` · ${a.allocation_percentage}%`}{a.is_site_visit && ` · ${t('weekPlan.siteVisit')}`}{a.source && ` · ${a.source}`}{a.external_id && ` · ${a.external_id}`}{a.source_quote_allocation_id && ` · ${t('weekPublish.quoteLink')}`}</span>;
 return <><Button disabled={disabled} onClick={()=>{setOpen(true);setExtensions([]);setPublicationId(crypto.randomUUID());void refresh([]);}}><Check className="mr-2 h-4 w-4"/>{t('weekPublish.approve')}</Button>
 <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{t('weekPublish.title')}</DialogTitle><DialogDescription>{t('weekPublish.replaces')}</DialogDescription></DialogHeader>
 {(data.plan?.notes ?? []).length>0 && <section className="space-y-2 border-y border-border py-3"><h2 className="text-sm font-semibold">{t('weekPublish.extensions')}</h2>{data.plan?.notes.map((n,i)=><label key={i} className="flex items-start gap-2 text-sm"><Checkbox disabled={busy} checked={extensions.some(e=>JSON.stringify(e)===JSON.stringify(n))} onCheckedChange={v=>{const chosen=v===true?[...extensions,n]:extensions.filter(e=>JSON.stringify(e)!==JSON.stringify(n));setExtensions(chosen);void refresh(chosen);}}/><span>{stageName(n.stage_id)} · {n.from ?? '—'} – {n.until}</span></label>)}</section>}
 {busy && <Loader2 className="h-5 w-5 animate-spin"/>}{error && <p role="alert" className="text-sm text-destructive">{t('weekPublish.error')}</p>}
 {preview && <>
 {preview.past_week && <p className="text-sm text-destructive">{t('weekPublish.past')}</p>}
 {preview.offending_cells.map((c,i)=><p key={i} role="alert" className="text-sm text-destructive">{t(`weekPublish.blocks.${c.code}`)} · {preview.resources.find(r=>r.id===c.resource_id)?.name} · {c.day} {c.part && t(`common:${c.part==='am'?'morning':'afternoon'}`)} {c.stage_id && stageName(c.stage_id)} {preview.projects.find(p=>p.id===c.project_id)?.name}</p>)}
 <section className="space-y-4">{preview.resources.filter(r=>preview.operations.some(o=>o.resource_id===r.id)||preview.skipped.some(a=>a.resource_id===r.id)).map(r=><div key={r.id} className="border-b border-border pb-3"><h3 className="mb-2 font-semibold">{r.name}</h3>{preview.operations.filter(o=>o.resource_id===r.id).map((o,i)=><div key={i} className="mb-2 text-xs"><span className="font-semibold">{t(`weekPublish.actions.${o.action}`)}</span>{o.before && <p className="text-muted-foreground">{row(o.before)}</p>}{o.after && <p>{o.before && '→ '}{row(o.after)}</p>}</div>)}{preview.skipped.filter(a=>a.resource_id===r.id).map(a=><p key={a.id} className="mb-2 text-xs text-muted-foreground">{t('weekPublish.skipped')} · {row(a)}</p>)}</div>)}</section>
 {preview.extensions.map((e,i)=><p key={i} className="text-sm">{stageName(e.stage_id)} · {e.old_start} – {e.old_end} → {e.start_date} – {e.end_date}</p>)}
 <p className="text-xs text-muted-foreground">{t('weekPublish.unchanged',{count:preview.unchanged})}</p>
 <label className="flex gap-2 text-sm"><Checkbox checked={replace} disabled={busy} onCheckedChange={v=>setReplace(v===true)}/>{t('weekPublish.replaceAck')}</label>
 {!!preview.overlaps.length && <label className="flex gap-2 text-sm text-destructive"><Checkbox checked={overlap} disabled={busy} onCheckedChange={v=>setOverlap(v===true)}/>{t('weekPublish.overlapAck',{count:preview.overlaps.length})}</label>}
 {preview.extensions.some(e=>e.baseline_locked) && <label className="flex gap-2 text-sm text-destructive"><Checkbox checked={baseline} disabled={busy} onCheckedChange={v=>setBaseline(v===true)}/>{t('weekPublish.baselineAck')}</label>}
 </>}
 <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t('common:cancel')}</Button><Button variant="outline" disabled={busy} onClick={()=>void refresh()}><RefreshCw className="mr-2 h-4 w-4"/>{t('weekPublish.refresh')}</Button><Button disabled={busy||!canConfirmPublication(preview,overlap,baseline,replace)} onClick={()=>void publish()}>{t('weekPublish.confirm')}</Button></DialogFooter>
 </DialogContent></Dialog></>;
}
