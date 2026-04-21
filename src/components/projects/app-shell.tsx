import { Link, useNavigate } from "@tanstack/react-router";
import {
  Compass,
  Users,
  LayoutGrid,
  ChevronDown,
  GanttChartSquare,
  FolderKanban,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  children: React.ReactNode;
  active?: "projects" | "resources" | "tasks" | "timesheet";
}

export function AppShell({ children, active }: Props) {
  const navigate = useNavigate();

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
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
