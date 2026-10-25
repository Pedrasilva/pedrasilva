import {useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from "@/components/ui/dialog";
import {readGanttSchedule,relativeInitialization,saveGanttSchedule} from "@/lib/projects/gantt-schedule";
import {reviewScheduleLinks,scheduleCalendar,RELATIVE_ORIGIN,type ScheduleState,type SchedulePatch} from "@/lib/projects/schedule-engine";
import type {StageDependency} from "@/lib/projects/dependencies";
export function RelativeScheduleControls({quoteId,disabled}:{quoteId:string;disabled:boolean}) {
  const {t}=useTranslation("projects");const qc=useQueryClient();
  const [preview,setPreview]=useState<{state:ScheduleState;patch:SchedulePatch;rejected:StageDependency[]}|null>(null);
  const [pending,setPending]=useState(false);
  const open=async()=>{setPending(true);try {
    const state=await readGanttSchedule("quote",quoteId);
    const {accepted,rejected}=reviewScheduleLinks(state.stages,state.dependencies);
    setPreview({state,patch:relativeInitialization(state,accepted),rejected});
  }catch(e){toast.error(t(e instanceof Error?e.message:"gantt.schedule.stale"));}finally{setPending(false);}};
  const save=async()=>{
    if(!preview)return;setPending(true);
    try {await saveGanttSchedule("quote",quoteId,preview.state,preview.patch,true,false);setPreview(null);await qc.invalidateQueries();}
    catch(e){toast.error(t(e instanceof Error?e.message:"gantt.schedule.stale"));}finally {setPending(false);}
  };
  return <>
    <Button size="sm" variant="outline" disabled={disabled||pending} onClick={open}>{t("gantt.relative.initialize")}</Button>
    <Dialog open={!!preview} onOpenChange={v=>{if(!v)setPreview(null);}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t("gantt.relative.preview")}</DialogTitle></DialogHeader>
      {!!preview?.rejected.length && <div role="alert" className="border border-destructive p-3 text-sm space-y-2">
        <p>{t("gantt.relative.circularReview")}</p>
        <ul className="list-disc pl-4">{preview.rejected.map(link=><li key={link.id}>
          {preview.state.stages.find(s=>s.id===link.predecessor_id)?.name} → {preview.state.stages.find(s=>s.id===link.successor_id)?.name} · {link.type} {link.lag_days}
        </li>)}</ul>
        <p>{t("gantt.relative.removeReviewedLinks")}</p>
      </div>}
      <div className="max-h-96 overflow-auto"><table className="w-full text-sm"><tbody>{preview?.patch.stages.map(s=><tr key={s.id} className="border-b border-border"><td className="py-2">{preview.state.stages.find(v=>v.id===s.id)?.name}</td><td>{t("gantt.relative.week",{number:Math.floor(scheduleCalendar().offset(RELATIVE_ORIGIN,s.start_date)/5)+1})}</td><td>{scheduleCalendar().duration(s.start_date,s.end_date)} {t("common:days")}</td></tr>)}</tbody></table></div>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={()=>setPreview(null)}>{t("common:cancel")}</Button><Button disabled={pending} onClick={save}>{preview?.rejected.length?t("gantt.relative.confirmCorrection"):t("common:confirm")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}