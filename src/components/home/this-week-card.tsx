import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mondayOf } from "@/lib/projects/week-board";
import { weekBoardQuery } from "@/lib/projects/week-board-query";
import { homeWeekAccess, nextWeekStatus, personalHomeWeek, type HomeWeekSlot } from "@/lib/projects/home-week";

export function ThisWeekCard() {
  const { t } = useTranslation(["home", "common", "projects", "glossary"]);
  const { isPsaStaff } = useAuth();
  const permissions = useMyPermissionsV2();
  const access = homeWeekAccess(isPsaStaff, permissions.loading, permissions.isAdmin, permissions.can("projects.edit_planning", "all"));
  const week = mondayOf(new Date());
  const next = format(addDays(parseISO(week), 7), "yyyy-MM-dd");
  const current = useQuery({ ...weekBoardQuery(week), enabled: access.visible });
  const upcoming = useQuery({ ...weekBoardQuery(next), enabled: access.planner });
  const personal = current.data ? personalHomeWeek(current.data, week) : null;
  if (!access.visible) return null;
  const booking = (slot: HomeWeekSlot | null) => slot ? <>
    <p className="break-words text-xs font-medium">{slot.project}</p>
    <p className="break-words text-[11px] text-muted-foreground">{slot.stage}{slot.siteVisit && <> · {t("projects:weekPlan.siteVisit")}</>}</p>
  </> : <span className="text-xs text-muted-foreground">—</span>;

  return <Card className="p-5" data-testid="home-this-week">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" />{t("common:thisWeek")}<span className="text-xs font-normal text-muted-foreground">{format(parseISO(week), "dd/MM")}–{format(addDays(parseISO(week), 4), "dd/MM")}</span></h2>
      <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs"><Link to="/projects/week-plan" search={{ week }}>{t("home:week.viewTeam")}<ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
    </div>
    {current.isError ? <div className="flex items-center gap-3 text-xs text-destructive" role="alert">{t("common:errorTitle")}<Button variant="ghost" size="sm" onClick={() => void current.refetch()}>{t("common:retry")}</Button></div> : !personal ? <p className="text-xs text-muted-foreground">{t("common:loading")}</p> : <>
      {!personal.approved && <p className="mb-3 text-xs text-muted-foreground">{t("home:week.notPlanned")}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {personal.days.map((day, i) => <div key={day.day} className="min-w-0 border-t border-border pt-2">
          <p className="mb-2 text-xs font-semibold">{t(`home:weekday.${i + 1}`)} <span className="font-normal text-muted-foreground">{format(parseISO(day.day), "dd/MM")}</span></p>
          {day.nonWorking.length ? <div className="space-y-1">{day.nonWorking.map((l, j) => <p key={j} className="break-words text-xs text-muted-foreground">{l.kind === "holiday" ? l.name ?? t("glossary:hr.holiday") : t("glossary:hr.leave")}</p>)}</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:gap-2">{(["am", "pm"] as const).map(part => <div key={part} className="min-w-0"><p className="mb-0.5 text-[10px] text-muted-foreground">{t(`common:${part === "am" ? "morning" : "afternoon"}`)}</p>{booking(day[part])}</div>)}</div>}
        </div>)}
      </div>
    </>}
    {access.planner && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3" data-testid="home-next-week">
      <p className="text-xs text-muted-foreground">{t("common:nextWeek")} · <span role="status">{upcoming.isError ? t("common:errorTitle") : upcoming.data ? t(`home:week.status.${nextWeekStatus(upcoming.data)}`) : t("common:loading")}</span></p>
      <Button asChild variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-xs"><Link to="/projects/week-plan" search={{ week: next }}>{t("home:week.planNext")}<ArrowRight className="ml-2 h-3 w-3 shrink-0" /></Link></Button>
    </div>}
  </Card>;
}