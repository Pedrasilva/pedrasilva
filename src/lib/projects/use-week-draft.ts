import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { type BoardData, type DraftSlot, type ExtensionNote } from "./week-board";
import { applySlotChanges, slotChanges, slotKey, extensionKey, mergeExtensionNotes } from "./week-draft";
import { weekBoardQuery } from "./week-board-query";

type SaveResult = { board:BoardData; conflicts:number; created?:boolean };
export function useWeekDraft(data: BoardData, week: string) {
  const qc = useQueryClient();
  const { t } = useTranslation("projects");
  const [slots, setSlots] = useState<DraftSlot[]>(data.draft_slots);
  const [notes, setNotes] = useState<ExtensionNote[]>(data.plan?.notes ?? []);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<{ before:DraftSlot[]; after:DraftSlot[] }[]>([]);
  const [future, setFuture] = useState<{ before:DraftSlot[]; after:DraftSlot[] }[]>([]);
  const baseline = useRef(data.draft_slots); const live = useRef(slots); live.current = slots;
  const baselineNotes = useRef(data.plan?.notes ?? []); const busy = useRef(false);
  const liveNotes=useRef(notes); liveNotes.current=notes;
  const dirty = slotChanges(baseline.current, slots).length > 0 || JSON.stringify(notes) !== JSON.stringify(baselineNotes.current);
  const stroke = useRef<DraftSlot[] | null>(null);
  useEffect(() => {
    if (!dirty && !busy.current) { baseline.current=data.draft_slots; baselineNotes.current=data.plan?.notes ?? []; setSlots(data.draft_slots); setNotes(data.plan?.notes ?? []); }
  }, [data]); // Incoming refetches must not overwrite unsaved local edits.
  useBlocker({ shouldBlockFn:() => (dirty || busy.current) && !window.confirm(t("weekPlan.unsavedConfirm")), enableBeforeUnload:dirty || status === "saving" });
  const request = useCallback(async (action:"create" | "save" | "discard", changes:ReturnType<typeof slotChanges>, extraNotes:ExtensionNote[] | null = null) => {
    const { data:result, error } = await supabase.rpc("pm_week_draft", { _week_start:week, _action:action, _changes:changes, _expected_updated_at:data.plan?.updated_at, _notes:extraNotes });
    if (error) throw error;
    return result as unknown as SaveResult;
  }, [week, data.plan?.updated_at]);
  const save = useCallback(async () => {
    if (busy.current || stroke.current || !data.plan || !dirty) return;
    busy.current=true; setStatus("saving"); setError(null);
    const sent=live.current; const sentNotes=notes;
    try {
      const result=await request("save",slotChanges(baseline.current,sent),sentNotes);
      const localChanges=slotChanges(sent,live.current);
      const merged=new Map(result.board.draft_slots.map(s => [slotKey(s),s]));
      for (const c of localChanges) { const key=slotKey(c); if (c.after) merged.set(key,{resource_id:c.resource_id,day:c.day,part:c.part,...c.after}); else merged.delete(key); }
      const serverNotes=result.board.plan?.notes ?? [];
      const added=liveNotes.current.filter(n => !sentNotes.some(v => extensionKey(v)===extensionKey(n)));
      baseline.current=result.board.draft_slots; baselineNotes.current=serverNotes;
      setNotes(mergeExtensionNotes([...serverNotes,...added]));
      setSlots([...merged.values()]); setConflict(result.conflicts>0); setStatus("saved");
      qc.setQueryData(["pm-week-board",week],result.board);
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? e)); }
    finally { busy.current=false; setVersion(v => v+1); }
  }, [data.plan,dirty,notes,request,qc,week]);
  useEffect(() => { if (dirty && status !== "error") { const timer=setTimeout(save,600); return () => clearTimeout(timer); } }, [dirty,slots,notes,version,status,save]);
  const startStroke=() => { if (!stroke.current) stroke.current=live.current; };
  const endStroke=() => { const before=stroke.current; stroke.current=null; if (before && slotChanges(before,live.current).length) { setHistory(h => [...h,{before,after:live.current}].slice(-20)); setFuture([]); } setVersion(v => v+1); };
  const change=(next:DraftSlot[]) => { live.current=next; setSlots(next); if(status==="error") setStatus("saved"); };
  const undo=() => { const h=history.at(-1); if(h) { change(applySlotChanges(live.current,h.after,h.before)); setHistory(v => v.slice(0,-1)); setFuture(v => [...v,h]); } };
  const redo=() => { const h=future.at(-1); if(h) { change(applySlotChanges(live.current,h.before,h.after)); setFuture(v => v.slice(0,-1)); setHistory(v => [...v,h]); } };
  return { slots, notes, status, dirty, conflict, error, saving:status === "saving", startStroke,endStroke,change,undo,redo,canUndo:!!history.length,canRedo:!!future.length,retry:save,
    addNote:(n:ExtensionNote) => setNotes(old => mergeExtensionNotes([...old,n])),
    reload:async () => { if(busy.current) return; busy.current=true; try { const board=await qc.fetchQuery({...weekBoardQuery(week),staleTime:0}); baseline.current=board.draft_slots; baselineNotes.current=board.plan?.notes ?? []; live.current=board.draft_slots; setSlots(board.draft_slots); setNotes(board.plan?.notes ?? []); setHistory([]); setFuture([]); stroke.current=null; setConflict(false); setError(null); setStatus("saved"); } catch(e) { setError(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? e)); setStatus("error"); } finally {busy.current=false;} },
    create:async (initial:DraftSlot[]) => { const r=await request("create",slotChanges([],initial)); baseline.current=r.board.draft_slots; setSlots(r.board.draft_slots); qc.setQueryData(["pm-week-board",week],r.board); return r; },
    discard:async () => { setError(null); try { const r=await request("discard",[]); baseline.current=[]; baselineNotes.current=[]; setSlots([]); setNotes([]); setHistory([]); setFuture([]); qc.setQueryData(["pm-week-board",week],r.board); } catch(e) { setError(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? e)); setStatus("error"); throw e; } },
  };
}