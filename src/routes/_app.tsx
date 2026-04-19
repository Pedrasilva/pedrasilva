import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  Menu,
  Shield,
  User as UserIcon,
} from "lucide-react";
import logoPsa from "@/assets/logo-psa.png";
import { Badge } from "@/components/ui/badge";
import { ViewAsPicker } from "@/components/ViewAsPicker";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { session, loading, isAdmin, isRealAdmin, viewAsUser, setViewAsUser, user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  // Fecha o menu mobile ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

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
    { to: "/minha-ficha", label: "Minha ficha", icon: UserIcon, match: (p: string) => p.startsWith("/minha-ficha"), adminOnly: false },
    { to: "/ferias", label: "Férias", icon: CalendarDays, match: (p: string) => p.startsWith("/ferias"), adminOnly: false },
    { to: "/beneficios", label: "Benefícios", icon: Wallet, match: (p: string) => p.startsWith("/beneficios"), adminOnly: false },
    { to: "/resumo", label: "Resumo geral", icon: BarChart3, match: (p: string) => p.startsWith("/resumo"), adminOnly: true },
  ] as const;

  const settingsItems = [
    { to: "/admin", label: "Administração", icon: Shield, match: (p: string) => p.startsWith("/admin") },
    { to: "/valor-bo", label: "Valor BO/hora", icon: Calculator, match: (p: string) => p.startsWith("/valor-bo") },
    { to: "/dias-uteis", label: "Dias úteis", icon: CalendarCheck, match: (p: string) => p.startsWith("/dias-uteis") },
    { to: "/subsidio-alimentacao", label: "Subsídio alimentação", icon: Utensils, match: (p: string) => p.startsWith("/subsidio-alimentacao") },
  ] as const;

  const visible = items.filter((it) => !it.adminOnly || isAdmin);
  const settingsActive = isAdmin && settingsItems.some((s) => s.match(loc.pathname));

  const userInitial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          {/* Brand */}
          <Link
            to={isAdmin ? "/" : "/ferias"}
            className="flex items-center gap-3 shrink-0"
          >
            <img
              src={logoPsa}
              alt="Pedra Silva Architects"
              className="h-8 w-auto object-contain"
            />
            <div className="hidden leading-tight border-l pl-3 lg:block">
              <div className="text-sm font-semibold whitespace-nowrap">PSA · Recursos Humanos</div>
              <div className="text-[11px] text-muted-foreground">Cálculo salarial</div>
            </div>
          </Link>

          {/* Nav principal — visível em md+ */}
          <nav className="hidden md:flex items-center gap-0.5 ml-2">
            {visible.map((it) => {
              const Icon = it.icon;
              const active = it.match(loc.pathname);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{it.label}</span>
                </Link>
              );
            })}

            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      settingsActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    aria-label="Definições"
                  >
                    <Settings className="h-4 w-4 transition-transform duration-300 hover:rotate-45" />
                    <span className="hidden lg:inline">Definições</span>
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
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Acções à direita */}
          <div className="flex items-center gap-1.5">
            {viewAsUser && (
              <Badge variant="secondary" className="hidden md:inline-flex">
                Modo colaborador
              </Badge>
            )}

            <ViewAsPicker variant="desktop" />

            {/* Menu de utilizador (desktop) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                  aria-label="Conta"
                >
                  {userInitial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Sessão iniciada como</span>
                    <span className="text-sm font-medium truncate">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOut()} className="cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Terminar sessão
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger (mobile) */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0">
                <SheetHeader className="border-b px-5 py-4 text-left">
                  <SheetTitle className="text-base">PSA · Recursos Humanos</SheetTitle>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                      {userInitial}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                  </div>
                </SheetHeader>

                <div className="flex flex-col p-3">
                  <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Navegação
                  </div>
                  {visible.map((it) => {
                    const Icon = it.icon;
                    const active = it.match(loc.pathname);
                    return (
                      <Link
                        key={it.to}
                        to={it.to}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-accent",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {it.label}
                      </Link>
                    );
                  })}

                  {isAdmin && (
                    <>
                      <div className="px-2 pb-1 pt-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Configuração
                      </div>
                      {settingsItems.map((s) => {
                        const Icon = s.icon;
                        const active = s.match(loc.pathname);
                        return (
                          <Link
                            key={s.to}
                            to={s.to}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-accent",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {s.label}
                          </Link>
                        );
                      })}
                    </>
                  )}

                  <div className="my-3 border-t" />

                  {isRealAdmin && <ViewAsPicker variant="mobile" />}

                  <button
                    onClick={() => signOut()}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" />
                    Terminar sessão
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
