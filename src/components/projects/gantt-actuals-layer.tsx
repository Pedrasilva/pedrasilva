import i18n from "@/i18n/index";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { ActualPerson, ActualTotals } from "@/lib/projects/gantt-actuals";
import { euros } from "@/lib/projects/gantt-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Info, AlertTriangle } from "lucide-react";

export const ACTUAL_ROW_HEIGHT = 38;
export const ACTUAL_METRIC_HEIGHT = 44;
const number = (n:number) => new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);
export const actualBandClass = (band:ActualTotals["band"]) => ({normal:"bg-budget-spent",ahead:"bg-budget-warning",over:"bg-budget-over",incomplete:"bg-muted-foreground"})[band];

export function GanttActualMetrics({totals,financials,compact=false}:{totals:ActualTotals;financials:boolean;compact?:boolean}) {
  const {t} = useTranslation("projects");
  const values = [
    ...(financials?[
      [t("glossary:financial.fee"),euros(totals.budget)],
      [t("gantt.actuals.costToDate"),totals.cost==null?"—":euros(totals.cost)],
      [t("detail.budgetControl.remainingBudget"),totals.remaining==null?"—":euros(totals.remaining)],
      [t("gantt.actuals.consumed"),totals.consumed==null?"—":`${number(totals.consumed)}%`],
    ]:[]),
    [t("glossary:time.plannedHours"),`${number(totals.planned)}h`],
    [t("glossary:time.loggedHours"),`${number(totals.logged)}h`],
  ];
  const title = values.map(([label,value])=>`${label}: ${value}`).join(" · ");
  return <TooltipProvider delayDuration={120}><Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" size="sm" className={`h-auto min-w-0 max-w-full justify-start gap-1 px-1 py-0 text-left font-mono ${compact?"text-[9px]":"text-[10px]"}`} aria-label={title} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} data-gantt-actual-metrics>
      {financials && <span className={`h-2 w-2 shrink-0 rounded-full ${actualBandClass(totals.band)}`} />}
      <span className="min-w-0 truncate">
        {financials && <span className="block truncate">{euros(totals.budget)} · {totals.cost==null?"—":euros(totals.cost)} · {totals.remaining==null?"—":euros(totals.remaining)}</span>}
        <span className="block truncate">{number(totals.planned)} {i18n.t("projects:ganttActualsLayer.ui.hoursSlash")} {number(totals.logged)} {i18n.t("common:units.hoursShort")} {financials?i18n.t("projects:ganttActualsLayer.ui.valueSeparator", { value1: totals.consumed==null?"—":`${number(totals.consumed)}%` }):""}</span>
      </span><Info className="h-3 w-3 shrink-0" />
    </Button>
  </TooltipTrigger><TooltipContent className="max-w-xs space-y-1 text-xs">
    {values.map(([label,value])=><div key={label} className="flex justify-between gap-4"><span>{label}</span><strong>{value}</strong></div>)}
    {financials && totals.missingHours>0 && <div className="text-destructive">{t("gantt.actuals.incompleteCost",{hours:number(totals.missingHours)})}</div>}
    {totals.importedHours>0 && <div>{t("gantt.actuals.importedHours",{hours:number(totals.importedHours)})}</div>}
  </TooltipContent></Tooltip></TooltipProvider>;
}

export function GanttActualTrail({person,origin,dayWidth,maxHours,top}:{person:ActualPerson;origin:Date;dayWidth:number;maxHours:number;top:number}) {
  const {t} = useTranslation("projects");
  return <div className="absolute left-0 right-0" style={{top,height:ACTUAL_ROW_HEIGHT}} data-gantt-actual-person={person.id}>
    {person.unplanned && <span className="absolute left-1 top-0 z-10 max-w-48 truncate text-[10px] text-muted-foreground">{person.name||t("gantt.actuals.unattributed")} · {t("gantt.actuals.unplanned")}</span>}
    <TooltipProvider delayDuration={100}>{person.weeks.map(week=>{
      const left=differenceInCalendarDays(parseISO(week.start),origin)*dayWidth;
      const end=format(addDays(parseISO(week.start),6),"yyyy-MM-dd");
      const opacity=week.logged>0?0.25+0.75*week.logged/maxHours:0.12;
      return <Tooltip key={week.start}><TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className={`absolute top-4 h-3 min-w-0 rounded-sm p-0 ${week.outside>0?"ring-1 ring-destructive ring-offset-1 ring-offset-background":""}`} style={{left,width:Math.max(2,7*dayWidth-1)}} aria-label={i18n.t("projects:ganttActualsLayer.ui.actualsSummary", { value1: person.name, value2: week.start, value3: number(week.logged) })} onPointerDown={e=>e.stopPropagation()} data-gantt-actual-week={week.start}>
          <span className="absolute inset-0 rounded-sm bg-foreground" style={{opacity}} />
          {week.outside>0 && dayWidth>=4 && <AlertTriangle className="relative h-2.5 w-2.5 text-destructive" />}
        </Button>
      </TooltipTrigger><TooltipContent className="space-y-1 text-xs">
        <strong>{person.name||t("gantt.actuals.unattributed")}</strong><div>{week.start} → {end}</div>
        <div>{t("glossary:time.loggedHours")}: {number(week.logged)} {i18n.t("common:units.hoursShort")} </div>
        <div>{t("glossary:time.plannedHours")}: {number(week.planned)} {i18n.t("common:units.hoursShort")} </div>
        <div>{t("gantt.actuals.difference")}: {week.difference>0?"+":""}{number(week.difference)} {i18n.t("common:units.hoursShort")} </div>
        {week.outside>0 && <div className="text-destructive">{t("gantt.actuals.outsideDates",{hours:number(week.outside)})}</div>}
        {week.imported>0 && <div>{t("gantt.actuals.importedHours",{hours:number(week.imported)})}</div>}
      </TooltipContent></Tooltip>;
    })}</TooltipProvider>
  </div>;
}