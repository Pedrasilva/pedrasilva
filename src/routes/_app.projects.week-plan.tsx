import { Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addDays, format, isValid, parseISO } from "date-fns";
import { enGB, pt } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mondayOf } from "@/lib/projects/week-board";
import { weekBoardQuery } from "@/lib/projects/week-board-query";
import { WeekPlanningBoard } from "@/components/projects/week-planning-board";

export const Route = createFileRoute("/_app/projects/week-plan")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => {
    const week = typeof search.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.week) && isValid(parseISO(search.week)) ? mondayOf(search.week) : undefined;
    return { week };
  },
  head: () => ({ meta: [
    { title:"Planeamento semanal | PSA Hub" },
    { name:"description", content:"Planeamento semanal da equipa Pedra Silva Architects por pessoa e projecto." },
    { property:"og:title", content:"Planeamento semanal | PSA Hub" },
    { property:"og:description", content:"Planeamento semanal da equipa Pedra Silva Architects por pessoa e projecto." },
    { property:"og:type", content:"website" }, { name:"twitter:card", content:"summary_large_image" },
  ] }),
  component: WeekPlanPage,
  errorComponent: WeekPlanError,
});

function WeekPlanError({ reset }: { reset: () => void }) {
  const { t } = useTranslation("common");
  return <div className="py-12"><p className="mb-4 text-muted-foreground">{t("errorTitle")}</p><Button variant="outline" onClick={reset}>{t("retry")}</Button></div>;
}
function WeekPlanPage() {
  const { t, i18n } = useTranslation("projects");
  const search = Route.useSearch(); const navigate = useNavigate();
  const week = search.week ?? mondayOf(new Date());
  const locale = i18n.language.startsWith("pt") ? pt : enGB;
  const date = parseISO(week); const end = addDays(date, 4);
  const label = format(date, date.getMonth() === end.getMonth() ? "d" : "d MMM", { locale }) + "–" + format(end, "d MMM yyyy", { locale });
  const changeWeek = (value: string) => navigate({ to:"/projects/week-plan", search:{ week:value } });
  return <div className="w-full min-w-0 pb-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6 pt-4">
      <div><p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{t("studio")}</p><h1 className="text-3xl font-semibold">{t("weekPlan.title")}</h1></div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={t("common:previousWeek")} title={t("common:previousWeek")} onClick={() => changeWeek(format(addDays(date,-7),"yyyy-MM-dd"))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-36 text-center text-sm font-medium" data-testid="week-label">{label}</span><Button size="icon" variant="ghost" aria-label={t("common:nextWeek")} title={t("common:nextWeek")} onClick={() => changeWeek(format(addDays(date,7),"yyyy-MM-dd"))}><ChevronRight className="h-4 w-4" /></Button></div>
        <Button variant="outline" size="sm" onClick={() => changeWeek(mondayOf(new Date()))}><CalendarDays className="mr-2 h-4 w-4" />{t("common:today")}</Button>
      </div>
    </header>
    <Suspense fallback={<p className="py-12 text-sm text-muted-foreground">{t("common:loading")}</p>}><WeekPlanContent week={week} /></Suspense>
  </div>;
}
function WeekPlanContent({ week }: { week:string }) {
  const { data } = useSuspenseQuery(weekBoardQuery(week));
  return <WeekPlanningBoard data={data} week={week} />;
}