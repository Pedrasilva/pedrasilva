import {useTranslation} from "react-i18next";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {scheduleCalendar,RELATIVE_ORIGIN} from "@/lib/projects/schedule-engine";
export function RelativeStageFields({start,end,disabled,onChange}:{start:string;end:string;disabled:boolean;onChange:(start:string,end:string)=>void}) {
  const {t}=useTranslation("projects");const calendar=scheduleCalendar();
  const offset=calendar.offset(RELATIVE_ORIGIN,start);const duration=calendar.duration(start,end);
  return <div className="grid grid-cols-2 gap-2">
    <div><Label>{t("gantt.relative.startWeek")}</Label><Input aria-label={t("gantt.relative.startWeek")} key={`start-${start}`} type="number" step="0.2" min="1" defaultValue={offset/5+1} disabled={disabled} onBlur={e=>{const n=Number(e.target.value);if(n<1||!Number.isFinite(n))return;const s=calendar.shift(RELATIVE_ORIGIN,Math.round((n-1)*5));onChange(s,calendar.shift(s,duration-1));}}/></div>
    <div><Label>{t("gantt.relative.durationWeeks")}</Label><Input aria-label={t("gantt.relative.durationWeeks")} key={`duration-${start}-${end}`} type="number" step="0.2" min="0.2" defaultValue={duration/5} disabled={disabled} onBlur={e=>{const n=Number(e.target.value);if(n<=0||!Number.isFinite(n))return;onChange(start,calendar.shift(start,Math.max(1,Math.round(n*5))-1));}}/></div>
  </div>;
}