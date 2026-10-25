import { translateError } from '@/lib/translate-error';
import {useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useTranslation} from "react-i18next";
import {Undo2,Redo2} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {undoGanttSchedule} from "@/lib/projects/gantt-schedule";
export function GanttHistoryControls({mode,scope,disabled=false}:{mode:"quote"|"project";scope:string;disabled?:boolean}) {
  const {t}=useTranslation("projects");const qc=useQueryClient();const [pending,setPending]=useState(false);
  const apply=async(redo:boolean)=>{
    setPending(true);
    try {await undoGanttSchedule(mode,scope,redo);await qc.invalidateQueries();}
    catch(e){toast.error(t(e instanceof Error?translateError(e.message):"gantt.schedule.stale"));}
    finally {setPending(false);}
  };
  return <div className="flex items-center gap-1">
    <Button size="icon" variant="ghost" disabled={disabled||pending} onClick={()=>apply(false)} title={t("gantt.schedule.undo")} aria-label={t("gantt.schedule.undo")}><Undo2 className="h-4 w-4"/></Button>
    <Button size="icon" variant="ghost" disabled={disabled||pending} onClick={()=>apply(true)} title={t("gantt.schedule.redo")} aria-label={t("gantt.schedule.redo")}><Redo2 className="h-4 w-4"/></Button>
  </div>;
}