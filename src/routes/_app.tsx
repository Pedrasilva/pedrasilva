import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Users, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const loc = useLocation();
  const items = [
    { to: "/", label: "Colaboradores", icon: Users, match: (p: string) => p === "/" || p.startsWith("/colaborador") },
    { to: "/resumo", label: "Resumo geral", icon: BarChart3, match: (p: string) => p.startsWith("/resumo") },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              S
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Cálculo Salarial</div>
              <div className="text-[11px] text-muted-foreground">Recursos Humanos</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = it.match(loc.pathname);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{it.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
