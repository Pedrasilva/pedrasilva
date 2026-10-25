import i18n from "@/i18n/index";
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from '@/components/ui/command';
import { useMyPermissionsV2 } from '@/hooks/use-permissions-v2';
import { supabase } from '@/integrations/supabase/client';
import type { BoardData, DraftSlot } from '@/lib/projects/week-board';
import { noteKey, noteParticipants, noteSeed, type WeekNote, type NoteKind } from '@/lib/projects/week-notes';
import { weekNotesQuery } from '@/lib/projects/week-notes-query';

type Choice = { id: string; name: string; code?: string | null };
type Box = { kind: NoteKind; project_id: string | null; opportunity_id: string | null; name: string; participants: string[]; manual?: boolean };
export function WeekProjectNotes(props: { data: BoardData; slots: DraftSlot[]; week: string }) {
  const { t } = useTranslation('projects');
  return <section className="mt-10 border-t border-border pt-6" data-testid="week-project-notes"><h2 className="mb-5 text-lg font-semibold">{t('weekNotes.projectTitle')}</h2><Suspense fallback={<p className="text-sm text-muted-foreground">{t('common:loading')}</p>}><NotesContent key={props.week} {...props} /></Suspense></section>;
}
function NotesContent({ data, slots, week }: { data: BoardData; slots: DraftSlot[]; week: string }) {
  const { t } = useTranslation('projects');
  const permissions = useMyPermissionsV2();
  const edit = !permissions.loading && (permissions.isAdmin || permissions.can('projects.edit_week_notes','all'));
  const query = useSuspenseQuery(weekNotesQuery(week));
  const [added, setAdded] = useState<Box[]>([]); const [open,setOpen] = useState(false);
  const choices = useQuery({ queryKey: ['week-note-choices'], enabled: edit, queryFn: async () => {
    const r = await supabase.rpc('pm_week_note_choices'); if(r.error) throw r.error;
    return r.data as unknown as { projects: Choice[]; opportunities: Choice[] };
  }});
  const rows = query.data.notes;
  const projectIds = new Set(slots.map(s => s.project_id));
  rows.filter(n => n.kind === 'project').forEach(n => { if(n.project_id) projectIds.add(n.project_id); });
  added.forEach(n => { if(n.project_id) projectIds.add(n.project_id); });
  // Active projects preserve exactly the toolbar ordering. Saved/manual projects follow it.
  const ordered = [...data.projects, ...(choices.data?.projects ?? []).filter(p => !data.projects.some(d => d.id === p.id))];
  const boxes: Box[] = ordered.filter(p => projectIds.has(p.id)).map(p => ({kind:'project',project_id:p.id,opportunity_id:null,name:p.name,participants:noteParticipants(data,slots,p.id)}));
  for (const n of rows.filter(n => n.kind === 'project')) if(n.project_id && !boxes.some(b => b.project_id === n.project_id)) boxes.push({kind:'project',project_id:n.project_id,opportunity_id:null,name: n.subject_name ?? '—',participants:noteParticipants(data,slots,n.project_id)});
  for (const n of rows.filter(n => n.kind === 'opportunity')) boxes.push({kind:'opportunity',project_id:null,opportunity_id:n.opportunity_id,name: n.subject_name ?? choices.data?.opportunities.find(o => o.id === n.opportunity_id)?.name ?? t('weekNotes.opportunity'),participants:[]});
  for (const n of added) if(!boxes.some(b => noteKey(b) === noteKey(n))) boxes.push(n);
  const choose = (p: Choice,kind: 'project'|'opportunity') => { setAdded(a => [...a,{ kind,project_id:kind==='project'?p.id:null,opportunity_id:kind==='opportunity'?p.id:null,name:p.name,participants:[],manual:true }]); setOpen(false); };
  return <>
    {edit && <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="mb-5"><Plus className="mr-2 h-4 w-4" />{t('weekNotes.addProject')}</Button></PopoverTrigger><PopoverContent className="w-80 p-0"><Command><CommandInput placeholder={t('common:search')} /><CommandList>{(['projects','opportunities'] as const).map(group => <CommandGroup key={group} heading={t(`weekNotes.${group}`)}>{choices.data?.[group].filter(p => !boxes.some(b => b.project_id === p.id || b.opportunity_id === p.id)).map(p => <CommandItem key={p.id} value={p.name} onSelect={() => choose(p,group==='projects'?'project':'opportunity')}>{p.name}</CommandItem>)}</CommandGroup>)}</CommandList></Command></PopoverContent></Popover>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{boxes.map(box => <NoteBox key={noteKey(box)} box={box} row={rows.find(n => noteKey(n) === noteKey(box))} week={week} edit={edit} names={query.data.names} />)}</div>
    {edit && <div className="mt-8"><NoteBox box={{kind:'week',project_id:null,opportunity_id:null,name:t('weekNotes.weekTitle'),participants:[]}} row={rows.find(n => n.kind==='week')} week={week} edit={edit} names={query.data.names} /></div>}
  </>;
}
function NoteBox({ box, row, week, edit, names }: { box: Box; row?: WeekNote; week: string; edit: boolean; names: Record<string,string> }) {
  const { t } = useTranslation('projects');
  const seed = useMemo(() => ({...noteSeed(row,week),added_manually:box.manual ?? row?.added_manually ?? false}),[]);
  const [value,setValue] = useState(seed); const latest=useRef(value); latest.current=value;
  const persisted=useRef(JSON.stringify(seed)); const revision=useRef(row?.week_start === week ? row.revision : 0);
  const [saved,setSaved] = useState(row?.week_start === week ? row : undefined);
  const [state,setState] = useState<'idle'|'saving'|'saved'|'error'|'conflict'>('idle');
  const busy=useRef(false); const blocked=useRef(false); const mounted=useRef(true); const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  async function save() {
    if(!edit || busy.current || blocked.current || JSON.stringify(latest.current)===persisted.current) return;
    busy.current=true; if(mounted.current) setState('saving');
    const sent=latest.current;
    // Nullable RPC parameters are sent as JSON null (not omitted).
    const result=await supabase.rpc('pm_week_note_save',{_week:week,_kind:box.kind,_project:box.project_id as string,_opportunity:box.opportunity_id as string,_value:{...sent,status:sent.status || null},_revision:revision.current});
    busy.current=false;
    if(result.error) { blocked.current=true; if(mounted.current) setState(result.error.code==='40001'?'conflict':'error'); return; }
    const next=result.data as unknown as WeekNote; revision.current=next.revision; persisted.current=JSON.stringify(sent);
    if(mounted.current) { setSaved(next); setState('saved'); }
    if(JSON.stringify(latest.current)!==persisted.current) void save();
  }
  useEffect(() => { if(!edit || JSON.stringify(value)===persisted.current) return; timer.current=setTimeout(() => void save(),1500); return () => clearTimeout(timer.current); },[value,edit]);
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; clearTimeout(timer.current); void save(); }; },[]);
  const change=(field: keyof typeof seed,content: string) => setValue(v => ({...v,[field]:content}));
  const fields=['newContacts','humanResources','timesheets','otherTopics'];
  return <article className="rounded-md border border-border bg-card p-4" data-testid={`note-${noteKey(box)}`}>
    <header className="mb-4"><h3 className="text-sm font-semibold">{box.name}</h3>{box.participants.length>0 && <p className="mt-1 text-xs text-muted-foreground">{box.participants.join(' · ')}</p>}
      {value.carried_from_week && !saved && <p className="mt-1 text-xs text-muted-foreground">{t('weekNotes.carried',{date:value.carried_from_week})}</p>}
    </header>
    {box.kind==='week' ? <div className="grid gap-4 md:grid-cols-2">{fields.map(field => <label key={field} className="block text-xs text-muted-foreground">{t(`weekNotes.${field}`)}<Textarea className="mt-1 min-h-24 text-foreground" aria-label={t(`weekNotes.${field}`)} value={value.week_topics[field] ?? ''} readOnly={!edit} onBlur={() => void save()} onChange={e => setValue(v => ({...v,week_topics:{...v.week_topics,[field]:e.target.value}}))} /></label>)}</div> : <>
      <label className="mb-3 block text-xs text-muted-foreground">{t('glossary:crm.status')}<Select disabled={!edit} value={value.status || 'unset'} onValueChange={v => change('status',v==='unset'?'':v)}><SelectTrigger className="mt-1 text-foreground" aria-label={t('glossary:crm.status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">—</SelectItem>{['a_decorrer','obra','stand_by','a_arrancar'].map(s => <SelectItem key={s} value={s}>{t(`weekNotes.status.${s}`)}</SelectItem>)}</SelectContent></Select></label>
      <label className="block text-xs text-muted-foreground">{t('weekNotes.notes')}<Textarea className="mt-1 min-h-28 text-foreground" aria-label={t('weekNotes.notes')} value={value.notes} readOnly={!edit} onChange={e => change('notes',e.target.value)} onBlur={() => void save()} /></label>
      <div className="mt-3 grid grid-cols-2 gap-3">{(['target_text','flag'] as const).map(f => <label key={f} className="text-xs text-muted-foreground">{t(`weekNotes.${f==='flag'?'flag':'target'}`)}<Input className="mt-1 text-foreground" aria-label={t(`weekNotes.${f==='flag'?'flag':'target'}`)} readOnly={!edit} value={value[f]} onChange={e => change(f,e.target.value)} onBlur={() => void save()} /></label>)}</div>
    </>}
    <footer className="mt-3 flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
      {state==='saving' && <><Loader2 className="h-3 w-3 animate-spin" />{t('weekPlan.saving')}</>}
      {state==='saved' && <Check className="h-3 w-3" />}
      {(saved ?? row) && <span>{t('weekNotes.edited',{name:names[(saved ?? row)?.updated_by ?? ''] ?? t('weekNotes.editor'),date:new Date((saved ?? row)?.updated_at ?? '').toLocaleString(i18n.language)})}</span>}
      {(state==='error' || state==='conflict') && <><AlertTriangle className="h-3 w-3 text-destructive" /><span>{t(`weekNotes.${state}`)}</span><Button size="sm" variant="ghost" onClick={() => { if(state==='conflict') window.location.reload(); else { blocked.current=false; void save(); } }}>{t(state==='conflict'?'weekNotes.reload':'common:retry')}</Button></>}
    </footer>
  </article>;
}