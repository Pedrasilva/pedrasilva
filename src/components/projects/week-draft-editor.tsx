import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addDays, format, parseISO } from "date-fns";
import { Eraser, Undo2, Redo2, ChevronDown, Loader2, AlertTriangle, Trash2, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { dailyHours, deriveSlots, weekDays, type BoardData, type DraftSlot, type DayPart, type BoardStage } from "@/lib/projects/week-board";
import { coveringStages, draftBoard, explicitSlots, nearestStage, shiftSlots, slotChanges, slotKey, resolveStageCells, extensionRange, unrepresentedBookings, isOutsideStage, defaultStage, setSlotStage, outsideExtensionNotes } from "@/lib/projects/week-draft";
import { useWeekDraft } from "@/lib/projects/use-week-draft";
import { weekBoardQuery } from "@/lib/projects/week-board-query";
import { numberStages, formatStageLabel } from "@/lib/quotes/stage-numbering";
import { WeekPublicationDialog } from "./week-publication-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { WeekPlanningBoard } from "./week-planning-board";

export function WeekDraftEditor({ data, week }: { data:BoardData; week:string }) {
  const permissions=useMyPermissionsV2();
  if (permissions.loading || !(permissions.isAdmin || permissions.can("projects.edit_planning","all"))) return <WeekPlanningBoard data={data} week={week} />;
  return <PlannerDraft key={week} data={data} week={week} />;
}
function PlannerDraft({ data, week }: { data:BoardData; week:string }) {
  const { t }=useTranslation("projects"); const qc=useQueryClient();
  const draft=useWeekDraft(data,week);
  const [source,setSource]=useState("gantt"); const [creating,setCreating]=useState(false); const [error,setError]=useState(false);
  const [brush,setBrush]=useState<string | null>(null); const [brushHint,setBrushHint]=useState(false); const [site,setSite]=useState(false); const [picker,setPicker]=useState(false);
  const [recent,setRecent]=useState<string[]>([]); const [compare,setCompare]=useState(false); const [discard,setDiscard]=useState(false);
   const [diffOpen,setDiffOpen]=useState(false);
  const [stageBrush,setStageBrush]=useState<string>("auto"); const [selected,setSelected]=useState<Set<string>>(new Set());
  const [choice,setChoice]=useState<{project:string; cells:Pick<DraftSlot,"resource_id"|"day"|"part">[]; stages:BoardStage[]} | null>(null);
  const down=useRef(false); const visited=useRef(new Set<string>()); const remembered=useRef(new Map<string,string>());
  const current=useRef(draft.slots); current.current=draft.slots;
  const derived=useMemo(() => deriveSlots(data.allocations,week,Object.fromEntries(data.resources.map(r => [r.id,dailyHours(r)])),data.leave,data.stage_tree ?? data.stages),[data,week]);
  const ganttSlots=useMemo(() => explicitSlots(derived),[derived]);
  const board=useMemo(() => draftBoard(data,week,draft.slots),[data,week,draft.slots]);
  const allDifferences=slotChanges(ganttSlots,draft.slots);
  const dropped=unrepresentedBookings(data,derived);
  const differences=allDifferences.filter(c => c.before?.project_id !== c.after?.project_id || c.before?.is_site_visit !== c.after?.is_site_visit);
  const changed=new Set(differences.map(slotKey)); const missing=draft.slots.filter(s => !s.stage_id);
  const activeDraft=data.plan?.status==="draft";
  const label=(id:string | undefined) => data.projects.find(p => p.id===id)?.name ?? "—";
  const numbered=data.projects.flatMap(p => numberStages((data.stage_tree ?? data.stages).filter(s => s.project_id===p.id))).flatMap(n => { const stage=data.stages.find(s => s.id===n.stage.id); return stage ? [{...n,stage}] : []; }); const stageLabel=(s:BoardStage) => formatStageLabel(s,numbered.find(n => n.stage.id===s.id)?.number);
  const stageById=(id:string | null | undefined) => { const stage=data.stages.find(s => s.id===id); if(stage) return stageLabel(stage); const historical=data.stage_tree?.find(s => s.id===id); const number=historical ? numberStages((data.stage_tree ?? []).filter(s => s.project_id===historical.project_id)).find(n => n.stage.id===id)?.number : undefined; return historical ? formatStageLabel(historical,number) : t("weekPlan.noStage"); };
  useEffect(() => { try { const v=JSON.parse(localStorage.getItem("psa-week-recent-projects") ?? "[]"); if(Array.isArray(v)) setRecent(v.filter(x => typeof x==="string").slice(0,5)); } catch {} },[]);
  const selectBrush=(id:string) => { setBrush(id); setStageBrush(defaultStage(data.stages,id,weekDays(week)) ?? "auto"); setSelected(new Set()); setBrushHint(false); setPicker(false); const ids=[id,...recent.filter(v => v!==id)].slice(0,5); setRecent(ids); try { localStorage.setItem("psa-week-recent-projects",JSON.stringify(ids)); } catch {} };
  const pending=useRef<Pick<DraftSlot,"resource_id"|"day"|"part">[]>([]);
  const finish=() => { down.current=false; if(!pending.current.length) draft.endStroke(); };
  useEffect(() => { const stop=() => finish(); window.addEventListener("pointerup",stop); window.addEventListener("pointercancel",stop); window.addEventListener("blur",stop); return () => { window.removeEventListener("pointerup",stop); window.removeEventListener("pointercancel",stop); window.removeEventListener("blur",stop); }; });
  useEffect(() => { const key=(e:KeyboardEvent) => { if(!activeDraft || compare || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase()!=="z" || (e.target instanceof HTMLElement && (e.target.matches("input,textarea") || e.target.isContentEditable))) return; e.preventDefault(); if(e.shiftKey) draft.redo(); else draft.undo(); }; window.addEventListener("keydown",key); return () => window.removeEventListener("keydown",key); });
  function apply(cells:Pick<DraftSlot,"resource_id"|"day"|"part">[], project:string | null, stage:string | null) {
    const values=new Map(current.current.map(s => [slotKey(s),s]));
    for(const c of cells) { if(data.leave.some(l => l.resource_id===c.resource_id && l.day===c.day) || !weekDays(week).includes(c.day)) continue; if(project) values.set(slotKey(c),{...c,project_id:project,stage_id:stage,is_site_visit:site}); else values.delete(slotKey(c)); }
    current.current=[...values.values()]; draft.change(current.current);
  }
  function paint(resource_id:string,day:string,part:DayPart) {
    const c={resource_id,day,part}; const key=slotKey(c); if(visited.current.has(key)) return; visited.current.add(key);
    if(brush===null) { if(current.current.some(s => slotKey(s)===key)) setSelected(old => { const n=new Set(old); if(n.has(key)) n.delete(key); else n.add(key); return n; }); else setBrushHint(true); return; }
    if(brush==="erase") { apply([c],null,null); return; }
    if(stageBrush!=="auto" && data.stages.some(s => s.id===stageBrush && s.project_id===brush)) { apply([c],brush,stageBrush); return; }
    const eligible=coveringStages(data.stages,brush,day); const picked=remembered.current.get(brush);
    if(eligible.length===1) { apply([c],brush,eligible[0].id); return; }
    if(eligible.length===0) { apply([c],brush,null); return; }
    if(picked && eligible.some(s => s.id===picked)) { apply([c],brush,picked); return; }
    pending.current=[...pending.current,c];
    setChoice(old => old?.project===brush ? {...old,cells:pending.current} : {project:brush,cells:pending.current,stages:eligible});
  }
  function removeSlot(key:string) { const [resource_id,day,part]=key.split("/"); draft.startStroke(); apply([{resource_id,day,part:part as DayPart}],null,null); draft.endStroke(); setSelected(old => { const n=new Set(old); n.delete(key); return n; }); }
  function assignStage(stageId:string) { draft.startStroke(); const next=setSlotStage(current.current,selected,stageId); current.current=next; draft.change(next); draft.endStroke(); setSelected(new Set()); }
  useEffect(() => { if(activeDraft) draft.replaceNotes(old => outsideExtensionNotes(data.stages,draft.slots,old)); },[draft.slots,activeDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedSlots=draft.slots.filter(s => selected.has(slotKey(s))); const selectedProjects=[...new Set(selectedSlots.map(s => s.project_id))];
  const outside=new Set(draft.slots.filter(s => isOutsideStage(data.stages,s)).map(slotKey));
  const projectStages=(id:string) => numbered.filter(n => n.stage.project_id===id);
  const start=() => { if(draft.saving || choice) return; if(!down.current && !pending.current.length) { down.current=true; visited.current=new Set(); draft.startStroke(); } };
  function wholeWeek(resource:string) { start(); for(const day of weekDays(week)) if(!data.leave.some(l => l.resource_id===resource && l.day===day)) for(const p of ["am","pm"] as DayPart[]) paint(resource,day,p); finish(); }
  async function create() {
    setCreating(true); setError(false);
    try {
      let initial:DraftSlot[]=[]; let sourceBoard=derived;
      if(source==="gantt") initial=ganttSlots;
      if(source==="previous") { const prev=format(addDays(parseISO(week),-7),"yyyy-MM-dd"); const previous=await qc.fetchQuery(weekBoardQuery(prev)); sourceBoard=deriveSlots(previous.allocations,prev,Object.fromEntries(previous.resources.map(r => [r.id,dailyHours(r)])),previous.leave); initial=shiftSlots(previous.plan?.status==="approved" ? previous.draft_slots : explicitSlots(sourceBoard),data); }
      await draft.create(initial);
    } catch { setError(true); } finally { setCreating(false); }
  }
  async function revise() {
    if(!data.plan) return; setCreating(true); setError(false);
    try { const r=await supabase.rpc("pm_revise_week_plan",{_plan_id:data.plan.id,_expected_updated_at:data.plan.updated_at,_slots:ganttSlots}); if(r.error) throw r.error; qc.setQueryData(["pm-week-board",week],r.data as unknown as BoardData); } catch {setError(true);} finally {setCreating(false);}
  }
  const unbooked=data.projects.filter(p => data.stages.some(s => s.project_id===p.id && s.start_date<=weekDays(week)[4] && s.end_date>=week) && !draft.slots.some(s => s.project_id===p.id));
  return <>
    {!data.plan && <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-5"><span className="text-sm font-medium">{t("weekPlan.createFrom")}</span><Select value={source} onValueChange={setSource}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gantt">{t("weekPlan.currentGantt")}</SelectItem><SelectItem value="previous">{t("weekPlan.previousPlan")}</SelectItem><SelectItem value="empty">{t("weekPlan.blank")}</SelectItem></SelectContent></Select><Button onClick={create} disabled={creating}>{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("weekPlan.createDraft")}</Button>{error && <span role="alert" className="text-sm text-destructive">{t("weekPlan.saveError")}</span>}</div>}
    {data.plan?.approved_at && <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm"><span>{t("weekPublish.publishedBy",{name:data.plan.approved_by_name ?? data.plan.updated_by_name ?? "—",date:format(parseISO(data.plan.approved_at),"dd/MM/yyyy HH:mm")})}</span>{data.plan.status==="approved" && <Button variant="outline" disabled={creating} onClick={()=>void revise()}>{t("weekPublish.revise")}</Button>}{error && <span role="alert" className="text-destructive">{t("weekPublish.error")}</span>}</div>}
    {activeDraft && <>
      <div className="mb-4 flex flex-wrap items-center gap-4 border-y border-border bg-muted/30 px-3 py-3" data-testid="draft-banner"><span className="text-sm font-semibold">{t("weekPlan.draft")}</span><span className="flex-1 text-xs text-muted-foreground">{data.plan?.updated_by_name} · {data.plan?.updated_at ? format(parseISO(data.plan.updated_at),"dd/MM HH:mm") : ""}</span><span role="status" className="flex w-32 shrink-0 items-center gap-1.5 text-xs" data-testid="draft-save-status">{draft.status==="saving" || draft.dirty && draft.status!=="error" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : draft.status==="saved" ? <Check className="h-3.5 w-3.5 text-primary" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}{t(`weekPlan.${draft.status==="error" ? "saveError" : draft.status==="saving" || draft.dirty ? "saving" : "saved"}`)}</span>{draft.status==="error" && <Button size="sm" variant="outline" onClick={draft.retry}>{t("common:retry")}</Button>}<label className="flex items-center gap-2 text-sm"><Switch checked={compare} onCheckedChange={setCompare} />{t("weekPlan.compareGantt")}</label><WeekPublicationDialog data={data} disabled={draft.dirty || draft.saving || draft.status==="error"} /><Button size="icon" variant="ghost" title={t("weekPlan.discardDraft")} aria-label={t("weekPlan.discardDraft")} disabled={draft.dirty || draft.status==="saving"} onClick={() => setDiscard(true)}><Trash2 className="h-4 w-4" /></Button></div>
      <div className="mb-2 flex h-9 min-w-0 items-center gap-3 overflow-hidden text-sm" data-testid="draft-status-line"><Button variant="outline" size="sm" className={cn("shrink-0",!(draft.dirty || draft.status==="error") && "invisible")} disabled={draft.saving || !(draft.dirty || draft.status==="error")} onClick={draft.reload}>{t("weekPlan.discardUnsaved")}</Button><p role="status" className={cn("min-w-0 truncate", draft.error ? "text-destructive" : "text-muted-foreground")} title={draft.error ?? undefined}>{draft.error ?? (draft.conflict ? t("weekPlan.conflict") : brushHint ? t("weekPlan.brushHint") : !compare && brush===null ? t("weekPlan.selectHint") : "")}</p></div>
      {!compare && <div className="mb-3 flex h-11 flex-nowrap items-center gap-3 overflow-x-auto overflow-y-hidden" data-testid="draft-brush-bar"><Popover open={picker} onOpenChange={setPicker}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={picker} className="w-64 justify-between"><span className="truncate">{brush && brush!=="erase" ? label(brush) : t("weekPlan.selectProject")}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0" /></Button></PopoverTrigger><PopoverContent className="w-80 p-0"><Command><CommandInput placeholder={t("common:search")} /><CommandList><CommandEmpty>{t("weekPlan.emptyBookings")}</CommandEmpty><CommandGroup>{data.projects.map(p => <CommandItem key={p.id} value={`${p.name} ${p.client ?? ""}`} onSelect={() => selectBrush(p.id)}>{p.name}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover><Select disabled={!brush || brush==="erase"} value={stageBrush} onValueChange={setStageBrush}><SelectTrigger className="w-72 shrink-0" aria-label={t("weekPlan.selectStage")}><SelectValue placeholder={t("weekPlan.selectStage")} /></SelectTrigger><SelectContent><SelectItem value="auto">{t("weekPlan.stageAuto")}</SelectItem>{(brush && brush!=="erase" ? projectStages(brush) : []).map(n => <SelectItem key={n.stage.id} value={n.stage.id}>{formatStageLabel(n.stage,n.number)} · {n.stage.start_date} – {n.stage.end_date}</SelectItem>)}</SelectContent></Select><Button className="shrink-0" variant={brush==="erase" ? "default" : "ghost"} aria-pressed={brush==="erase"} onClick={() => { if(brush==="erase") setBrush(null); else {setBrush("erase");setSelected(new Set());} setBrushHint(false);}}><Eraser className="mr-2 h-4 w-4" />{t("weekPlan.erase")}</Button><label className="flex items-center gap-2 text-sm"><Checkbox checked={site} onCheckedChange={v => setSite(v===true)} />{t("weekPlan.siteVisit")}</label><div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={t("weekPlan.undo")} title={t("weekPlan.undo")} disabled={!draft.canUndo} onClick={draft.undo}><Undo2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={t("weekPlan.redo")} title={t("weekPlan.redo")} disabled={!draft.canRedo} onClick={draft.redo}><Redo2 className="h-4 w-4" /></Button></div>{recent.filter(id => data.projects.some(p => p.id===id)).map(id => <Button key={id} variant="ghost" size="sm" className="max-w-40 truncate" onClick={() => selectBrush(id)}>{label(id)}</Button>)}</div>}
      <div className={cn("mb-3 flex h-10 min-w-0 items-center gap-3 overflow-hidden border-l-2 pl-3 text-sm", selected.size ? "border-primary" : "invisible border-transparent")} aria-hidden={!selected.size} data-testid={selected.size ? "slot-selection" : undefined}>{selected.size>0 && <><span className="font-medium">{t("weekPlan.selectedCount",{count:selected.size})} · {label(selectedProjects[0])}</span>{selectedProjects.length===1 ? <Select onValueChange={assignStage}><SelectTrigger className="w-72" aria-label={t("weekPlan.assignStage")}><SelectValue placeholder={t("weekPlan.assignStage")} /></SelectTrigger><SelectContent>{projectStages(selectedProjects[0]).map(n => <SelectItem key={n.stage.id} value={n.stage.id}>{formatStageLabel(n.stage,n.number)} · {n.stage.start_date} – {n.stage.end_date}</SelectItem>)}</SelectContent></Select> : <span className="text-muted-foreground">{t("weekPlan.mixedProjects")}</span>}<Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t("weekPlan.clearSelection")}</Button></>}</div>
    </>}
    <WeekPlanningBoard data={data} week={week} board={activeDraft ? board : undefined} editing={activeDraft && !compare ? {paint,start,finish,wholeWeek,isDown:() => down.current,changed,selected,outside,remove:removeSlot} : undefined} />
    {activeDraft && <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm"><Button variant="link" className="h-auto p-0" onClick={() => setDiffOpen(v => !v)}>{t("weekPlan.changeCount",{count:differences.length})}</Button><span className={missing.length ? "text-destructive" : "text-muted-foreground"}>{t("weekPlan.noStageCount",{count:missing.length})}</span></div>
      {diffOpen && <div className="mb-5 border-y border-border py-3">{data.resources.map(r => { const rows=allDifferences.filter(c => c.resource_id===r.id); return rows.length ? <div key={r.id} className="mb-3"><p className="text-sm font-medium">{r.name}</p>{rows.map(c => <p key={slotKey(c)} className="flex flex-wrap items-center gap-2 py-1 text-xs text-muted-foreground">{c.day} · {t(`common:${c.part==="am" ? "morning" : "afternoon"}`)} · {label(c.before?.project_id)}{c.before?.is_site_visit && ` (${t("weekPlan.siteVisit")})`}<ArrowRight className="h-3 w-3" />{label(c.after?.project_id)}{c.after?.is_site_visit && ` (${t("weekPlan.siteVisit")})`}{c.before?.stage_id!==c.after?.stage_id && <span>{t("weekPlan.stageChange")} · {stageById(c.before?.stage_id)} → {stageById(c.after?.stage_id)}</span>}</p>)}</div> : null; })}</div>}
      {missing.length>0 && <div className="mb-4 space-y-2 border-l-2 border-destructive pl-3">{[...new Set(missing.map(s => s.project_id))].map(id => { const days=missing.filter(s => s.project_id===id).map(s => s.day); const stage=nearestStage(data.stages,id,[...days].sort()[0]); const note=stage ? extensionRange(stage,days) : null; return <div key={id} className="text-sm"><p>{t("weekPlan.outsideStages",{project:label(id)})} <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setBrush(null); setSelected(new Set(missing.filter(s => s.project_id===id).map(slotKey))); }}>{t("weekPlan.selectSlots")}</Button></p>{stage && note && <Button variant="link" size="sm" className="h-auto whitespace-normal p-0 text-left text-xs" onClick={() => draft.addNote(note)}>{t("weekPlan.requestExtension",{stage:stageLabel(stage),from:note.from,until:note.until})}</Button>}</div>; })}</div>}
      {draft.notes.map((n,i) => <p key={i} className="mb-2 text-xs text-muted-foreground">{t("weekPlan.extensionRecorded",{stage:stageById(n.stage_id),from:n.from ?? data.stages.find(s => s.id===n.stage_id)?.start_date ?? "—",until:n.until})}</p>)}
      {dropped.length>0 && <section className="mb-5 border-y border-border py-3" data-testid="dropped-bookings"><h2 className="mb-2 text-sm font-medium">{t("weekPlan.droppedBookings")}</h2>{dropped.map(s => <p key={`${s.allocation_id}/${s.day}`} className="py-1 text-xs text-muted-foreground">{data.resources.find(r => r.id===s.resource_id)?.name} · {s.day} · {label(s.project_id)} · {stageById(s.stage_id)} · {s.hours}h</p>)}</section>}
    </div>}
    {activeDraft && compare && <div className="mt-8"><h2 className="mb-4 text-lg font-medium">{t("weekPlan.currentGantt")}</h2><WeekPlanningBoard data={data} week={week} /></div>}
    {activeDraft && unbooked.length>0 && <p className="mt-5 text-xs text-muted-foreground">{t("weekPlan.unbookedProjects",{projects:unbooked.map(p => p.name).join(", ")})}</p>}
    <Popover open={!!choice} onOpenChange={v => { if(!v) { setChoice(null); pending.current=[]; draft.endStroke(); } }}><PopoverTrigger asChild><span className="fixed left-1/2 top-1/3 h-0 w-0" /></PopoverTrigger><PopoverContent className="w-80" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}><p className="mb-3 text-sm font-medium">{t("weekPlan.chooseStage")}</p>{numbered.filter(n => choice?.stages.some(s => s.id===n.stage.id)).map(n => <Button key={n.stage.id} variant="ghost" className="mb-1 h-auto w-full justify-start whitespace-normal text-left" onClick={() => { if(!choice) return; remembered.current.set(choice.project,n.stage.id); const result=resolveStageCells(data.stages,choice.project,choice.cells,n.stage.id); apply(result.resolved,choice.project,n.stage.id); pending.current=result.pending; if(result.pending.length) setChoice({...choice,cells:result.pending,stages:result.candidates}); else {setChoice(null); draft.endStroke();} }}><span>{formatStageLabel(n.stage,n.number)}<span className="block text-xs text-muted-foreground">{n.stage.start_date} – {n.stage.end_date}</span></span></Button>)}</PopoverContent></Popover>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("weekPlan.discardConfirm")}</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel><AlertDialogAction onClick={async () => { try { await draft.discard(); setCompare(false); } catch { setError(true); } }}>{t("weekPlan.discardDraft")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}