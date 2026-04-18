import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  BarChart3,
  Calculator,
  CalendarDays,
  CalendarCheck,
  LogOut,
  Settings,
  Eye,
  EyeOff,
  Wallet,
} from "lucide-react";
import logoPsa from "@/assets/logo-psa.png";
import { Badge } from "@/components/ui/badge";
import { QuickCreateMenu } from "@/components/QuickCreateMenu";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { session, loading, isAdmin, isRealAdmin, viewAsUser, setViewAsUser, user, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  const items = [
    {
      to: "/",
      label: "Colaboradores",
      icon: Users,
      match: (p: string) => p === "/" || p.startsWith("/colaborador"),
      adminOnly: true,
    },
    { to: "/ferias", label: "Férias", icon: CalendarDays, match: (p: string) => p.startsWith("/ferias"), adminOnly: false },
    { to: "/beneficios", label: "Benefícios", icon: Wallet, match: (p: string) => p.startsWith("/beneficios"), adminOnly: false },
    { to: "/resumo", label: "Resumo geral", icon: BarChart3, match: (p: string) => p.startsWith("/resumo"), adminOnly: true },
  ] as const;

  const settingsItems = [
    { to: "/valor-bo", label: "Valor BO/hora", icon: Calculator, match: (p: string) => p.startsWith("/valor-bo") },
    { to: "/dias-uteis", label: "Dias úteis", icon: CalendarCheck, match: (p: string) => p.startsWith("/dias-uteis") },
  ] as const;

  const visible = items.filter((it) => !it.adminOnly || isAdmin);
  const settingsActive = isAdmin && settingsItems.some((s) => s.match(loc.pathname));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={isAdmin ? "/" : "/ferias"} className="flex items-center gap-3">
            <img
              src={logoPsa}
              alt="Pedra Silva Architects"
              className="h-9 w-auto object-contain"
            />
            <div className="hidden leading-tight border-l pl-3 sm:block">
              <div className="text-sm font-semibold">PSA Recursos Humanos</div>
              <div className="text-[11px] text-muted-foreground">Cálculo salarial</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {visible.map((it) => {
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

            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      settingsActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent",
                    )}
                    aria-label="Definições"
                  >
                    <Settings
                      className={cn(
                        "h-4 w-4 transition-transform duration-300 hover:rotate-45",
                      )}
                    />
                    <span className="hidden sm:inline">Definições</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Configuração</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {settingsItems.map((s) => {
                    const Icon = s.icon;
                    const active = s.match(loc.pathname);
                    return (
                      <DropdownMenuItem key={s.to} asChild>
                        <Link
                          to={s.to}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2",
                            active && "bg-accent font-medium",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {s.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isAdmin && <QuickCreateMenu />}

            {isRealAdmin && (
              <Button
                variant={viewAsUser ? "default" : "outline"}
                size="sm"
                onClick={() => setViewAsUser(!viewAsUser)}
                className="ml-2 gap-2"
                title={
                  viewAsUser
                    ? "A ver como colaborador. Clique para voltar ao modo admin."
                    : "Pré-visualizar a app como um colaborador (sem permissões de admin)"
                }
              >
                {viewAsUser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">
                  {viewAsUser ? "Sair da vista colaborador" : "Ver como colaborador"}
                </span>
              </Button>
            )}

            {viewAsUser && (
              <Badge variant="secondary" className="ml-2 hidden md:inline-flex">
                Modo colaborador
              </Badge>
            )}

            <div className="ml-2 hidden items-center gap-2 border-l pl-2 sm:flex">
              <span className="max-w-[160px] truncate text-xs text-muted-foreground" title={user?.email ?? ""}>
                {user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
