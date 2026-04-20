import { Link, useNavigate } from "@tanstack/react-router";
import {
  Compass,
  Users,
  ListChecks,
  LogOut,
  Clock,
  Plus,
  Eye,
  Timer,
  LayoutGrid,
  CalendarDays,
  Calendar,
  ChevronDown,
  GanttChartSquare,
  FolderKanban,
  Briefcase,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { QuickCreateMenu } from "@/components/QuickCreateMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  children: React.ReactNode;
  active?: "projects" | "resources" | "tasks" | "timesheet";
}

export function AppShell({ children, active }: Props) {
  const { user, profile, isAdmin, signOut } = useProjectsAuth();
  const navigate = useNavigate();
  const initials = (profile?.full_name || user?.email || "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-3.5rem)] bg-background text-foreground sm:-mx-6">
      <header className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-[1800px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Hub
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link to="/projects" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary text-primary-foreground">
                <Compass className="h-3.5 w-3.5" />
              </div>
              <span className="font-display text-base font-semibold tracking-tight">Projects</span>
              <span className="ml-1 hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
                studio planner
              </span>
            </Link>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors data-[state=open]:bg-accent data-[state=open]:text-foreground ${
                  active === "projects"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
                <ChevronDown className="h-3 w-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 p-0">
                <div className="bg-primary px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground">
                  Projects
                </div>
                <div className="p-1">
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects" })}>
                    <LayoutGrid className="mr-2 h-4 w-4 text-muted-foreground" />
                    Project list
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects/gantt" })}>
                    <GanttChartSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                    GG - Global Gantt
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors data-[state=open]:bg-accent data-[state=open]:text-foreground ${
                  active === "tasks" || active === "timesheet"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Time
                <ChevronDown className="h-3 w-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 p-0">
                <div className="bg-primary px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground">
                  Time
                </div>
                <div className="p-1">
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects/timesheet" })}>
                    <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
                    Log Time
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects/my-tasks" })}>
                    <ListChecks className="mr-2 h-4 w-4 text-muted-foreground" />
                    My Tasks
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Timer className="mr-2 h-4 w-4 text-muted-foreground" />
                    Active Timers
                    <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                    Show/Hide Timers
                  </DropdownMenuItem>
                </div>
                <div className="bg-accent/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Timesheets
                </div>
                <div className="p-1">
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects/timesheet" })}>
                    <LayoutGrid className="mr-2 h-4 w-4 text-muted-foreground" />
                    Overview
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                    Daily
                    <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/projects/timesheet" })}>
                    <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                    Weekly
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              to="/projects/resources"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                active === "resources"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Team
            </Link>
            <div className="mx-2 flex items-center gap-1">
              <QuickCreateMenu variant="icon" />
              <QuickCreateMenu variant="time" />
              <button
                type="button"
                onClick={() => navigate({ to: "/projects" })}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground transition hover:bg-accent"
                aria-label="Projects"
                title="Projects"
              >
                <Briefcase className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/projects/gantt" })}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground transition hover:bg-accent"
                aria-label="Schedule"
                title="Schedule"
              >
                <CalendarDays className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/projects/my-tasks" })}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground transition hover:bg-accent"
                aria-label="Inbox"
                title="Inbox"
              >
                <Inbox className="h-4 w-4" />
              </button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-accent">
                {initials || "?"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm">{profile?.full_name || user?.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {isAdmin ? "Admin" : "Member"} · {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/login" });
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
