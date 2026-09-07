import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarRange, ChevronLeft, ChevronRight, Info } from "lucide-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useMyPermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toLocalISODate } from "@/lib/dates";
import {
  useTeamAvailability,
  useYearlyAbsenceMatrix,
} from "@/lib/hr/use-team-availability";
import { AvailabilityGrid } from "@/components/hr/availability/availability-grid";
import { AvailabilitySummary } from "@/components/hr/availability/availability-summary";
import { AvailabilityYear } from "@/components/hr/availability/availability-year";
import { AvailabilityBalances } from "@/components/hr/availability/availability-balances";
import { AbsenceLegend } from "@/components/hr/availability/absence-legend";

export const Route = createFileRoute("/_app/hr/disponibilidade")({
  head: () => ({
    meta: [
      { title: "Team availability — PSA Hub" },
      {
        name: "description",
        content:
          "Read-only monthly overview of team leave, public holidays, remote work and daily coverage.",
      },
      { property: "og:title", content: "Team availability — PSA Hub" },
      {
        property: "og:description",
        content:
          "Read-only monthly overview of team leave, public holidays, remote work and daily coverage.",
      },
    ],
  }),
  component: () => (
    <PermissionGate permission="hr.ferias.own">
      <AvailabilityPage />
    </PermissionGate>
  ),
});

const ALL = "__all__";

function AvailabilityPage() {
  const { t } = useTranslation("hr");
  const { isAdmin, permissions } = useMyPermissions();
  // Detailed absence types are reserved for HR admins and leave approvers.
  const canSeeDetail =
    isAdmin ||
    permissions.has("hr.leave.approve" as never) ||
    permissions.has("hr.admin" as never);

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const [dept, setDept] = useState(ALL);
  const [project, setProject] = useState(ALL);
  const [collab, setCollab] = useState(ALL);
  const [state, setState] = useState(ALL);

  const data = useTeamAvailability(year, month);
  const yearMatrix = useYearlyAbsenceMatrix(year);

  const todayISO = toLocalISODate(today);

  const filteredPeople = useMemo(() => {
    return data.people.filter((p) => {
      if (dept !== ALL && p.departamento !== dept) return false;
      if (project !== ALL && !p.projectIds.includes(project)) return false;
      if (collab !== ALL && p.id !== collab) return false;
      if (state !== ALL) {
        const kinds = data.days
          .filter((d) => d.isWorkingDay)
          .map((d) => data.cells[p.id]?.[d.iso]);
        if (state === "remote" && !kinds.some((c) => c?.kind === "remote")) return false;
        if (
          state === "away" &&
          !kinds.some((c) => c?.kind === "absent" || c?.kind === "absent-half")
        )
          return false;
        if (state === "pending" && !kinds.some((c) => c?.kind === "pending")) return false;
        if (
          state.startsWith("tipo:") &&
          !kinds.some((c) => c?.tipo === state.slice(5))
        )
          return false;
      }
      return true;
    });
  }, [data, dept, project, collab, state]);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(cursor);

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarRange className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">{t("availability.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("availability.subtitle")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/hr/ferias">{t("availability.manageLeave")}</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">{t("availability.prevMonth")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            {t("availability.today")}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">{t("availability.nextMonth")}</span>
          </Button>
        </div>
        <span className="min-w-[10rem] text-sm font-medium capitalize">{monthLabel}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder={t("availability.filters.department")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("availability.filters.allDepartments")}</SelectItem>
              {data.departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder={t("availability.filters.project")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("availability.filters.allProjects")}</SelectItem>
              {data.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={collab} onValueChange={setCollab}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder={t("availability.filters.collaborator")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("availability.filters.allCollaborators")}</SelectItem>
              {data.people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder={t("availability.filters.state")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("availability.filters.allStates")}</SelectItem>
              <SelectItem value="away">{t("availability.state.unavailable")}</SelectItem>
              <SelectItem value="remote">{t("availability.state.remote")}</SelectItem>
              <SelectItem value="pending">{t("availability.state.pending")}</SelectItem>
              {canSeeDetail
                ? (
                    [
                      "ferias",
                      "casamento",
                      "falecimento_familiar",
                      "assistencia_filho",
                      "nascimento_filho",
                      "trabalhador_estudante",
                      "doacao_sangue",
                      "autorizada_paga",
                      "autorizada_nao_paga",
                    ] as const
                  ).map((tp) => (
                    <SelectItem key={tp} value={`tipo:${tp}`}>
                      {t(`availability.types.${tp}`)}
                    </SelectItem>
                  ))
                : null}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="month">
        <TabsList>
          <TabsTrigger value="month">{t("availability.tabs.month")}</TabsTrigger>
          <TabsTrigger value="year">{t("availability.tabs.year")}</TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="space-y-4 pt-4">
          <AvailabilitySummary
            people={filteredPeople}
            days={data.days}
            cells={data.cells}
            coverage={data.coverage}
            canSeeDetail={canSeeDetail}
            todayISO={todayISO}
          />

          <AvailabilityGrid
            people={filteredPeople}
            days={data.days}
            cells={data.cells}
            coverage={data.coverage}
            canSeeDetail={canSeeDetail}
          />

          <AbsenceLegend canSeeDetail={canSeeDetail} />

          {data.partTimeScheduleUnknown ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("availability.partTimeNote")}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="year" className="space-y-4 pt-4">
          <AvailabilityYear
            people={filteredPeople}
            matrix={yearMatrix.data ?? {}}
            year={year}
          />
          <AvailabilityBalances people={filteredPeople} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
