import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  Play,
  CheckSquare,
  Users,
  CalendarDays,
  GanttChartSquare,
  ListChecks,
  Plus,
  Briefcase,
  Receipt,
  Package,
  ChevronDown,
} from "lucide-react";
import {
  LogTimeDialog,
  StartTimerDialog,
  TaskDialog,
  ProjectDialog,
} from "@/components/QuickCreateMenu";
import {
  QuickExpenseDialog,
  QuickMaterialDialog,
} from "@/components/quick-finance-dialogs";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";

type Sheet =
  | null
  | "logTime"
  | "startTimer"
  | "task"
  | "project"
  | "expense"
  | "material";

export function GlobalTopNav() {
  const { t } = useTranslation("projects");
  const [sheet, setSheet] = useState<Sheet>(null);
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const loc = useLocation();
  const can = (k: PermissionKey) => isAdmin || permissions.has(k);

  const canTime = can("projects.timesheet");
  const canTasks = can("projects.my-tasks");
  const canSchedule = can("projects.resources") || can("projects.gantt");
  const canCreateTask = canTasks;
  const canCreateProject = can("projects.all");
  const canCreateProjectExpense = can("projects.financials");
  const canCreate =
    canCreateTask || canCreateProject || canCreateProjectExpense;

  // Active states reflect where the user currently is — keeps the hub
  // glanceable even when its menu is closed.
  const timeActive = loc.pathname.startsWith("/projects/timesheet");
  const tasksActive = loc.pathname.startsWith("/projects/my-tasks");
  const scheduleActive =
    loc.pathname.startsWith("/projects/resources") ||
    loc.pathname.startsWith("/projects/gantt");

  const hubClass = (active: boolean) =>
    cn(
      "h-9 gap-1.5 px-2.5",
      active && "bg-accent text-primary hover:bg-accent",
    );

  if (!canTime && !canTasks && !canSchedule && !canCreate) {
    return null;
  }

  return (
    <>
      {/* Time */}
      {canTime && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={hubClass(timeActive)}
            aria-label={t("topNav.time")}
            aria-current={timeActive ? "page" : undefined}
          >
            <Clock className="h-4 w-4" />
            <span className="hidden lg:inline">{t("topNav.time")}</span>
            <ChevronDown className="hidden h-3 w-3 opacity-60 lg:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("topNav.time")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("logTime")} className="gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> {t("topNav.logTime")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("startTimer")} className="gap-2">
            <Play className="h-4 w-4 text-muted-foreground" /> {t("topNav.startTimer")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/projects/timesheet" className="flex w-full cursor-pointer items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" /> {t("topNav.myTimesheet")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      {/* Tasks */}
      {canTasks && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={hubClass(tasksActive)}
            aria-label={t("topNav.tasks")}
            aria-current={tasksActive ? "page" : undefined}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="hidden lg:inline">{t("topNav.tasks")}</span>
            <ChevronDown className="hidden h-3 w-3 opacity-60 lg:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("topNav.tasks")}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to="/projects/my-tasks" className="flex w-full cursor-pointer items-center gap-2">
              <CheckSquare className="h-4 w-4 text-muted-foreground" /> {t("topNav.myTasks")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              to="/projects/my-tasks"
              className="flex w-full cursor-pointer items-center gap-2"
            >
              <Users className="h-4 w-4 text-muted-foreground" /> {t("topNav.teamTasks")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSheet("task")} className="gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" /> {t("topNav.createTask")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      {/* Schedule */}
      {canSchedule && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={hubClass(scheduleActive)}
            aria-label={t("topNav.schedule")}
            aria-current={scheduleActive ? "page" : undefined}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden lg:inline">{t("topNav.schedule")}</span>
            <ChevronDown className="hidden h-3 w-3 opacity-60 lg:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("topNav.schedule")}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link
              to="/projects/resources"
              className="flex w-full cursor-pointer items-center gap-2"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> {t("topNav.mySchedule")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/projects/resources" className="flex w-full cursor-pointer items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> {t("topNav.teamSchedule")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/projects/gantt" className="flex w-full cursor-pointer items-center gap-2">
              <GanttChartSquare className="h-4 w-4 text-muted-foreground" /> {t("topNav.globalGantt")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      {/* Create (+) */}
      {canCreate && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="default"
            className="ml-1 h-9 w-9"
            aria-label={t("topNav.create")}
            title={t("topNav.create")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("topNav.create")}
          </DropdownMenuLabel>
          {canCreateTask && (
            <DropdownMenuItem onClick={() => setSheet("task")} className="gap-2">
              <CheckSquare className="h-4 w-4 text-muted-foreground" /> {t("topNav.newTask")}
            </DropdownMenuItem>
          )}
          {canCreateProject && (
            <DropdownMenuItem onClick={() => setSheet("project")} className="gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" /> {t("topNav.newProject")}
            </DropdownMenuItem>
          )}
          {canCreateProjectExpense && (
            <>
              <DropdownMenuItem onClick={() => setSheet("expense")} className="gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" /> {t("topNav.newExpense")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("material")} className="gap-2">
                <Package className="h-4 w-4 text-muted-foreground" /> {t("topNav.newMaterial")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      <LogTimeDialog open={sheet === "logTime"} onClose={() => setSheet(null)} />
      <StartTimerDialog open={sheet === "startTimer"} onClose={() => setSheet(null)} />
      <TaskDialog open={sheet === "task"} onClose={() => setSheet(null)} />
      <ProjectDialog open={sheet === "project"} onClose={() => setSheet(null)} />
      <QuickExpenseDialog open={sheet === "expense"} onClose={() => setSheet(null)} />
      <QuickMaterialDialog open={sheet === "material"} onClose={() => setSheet(null)} />
    </>
  );
}
