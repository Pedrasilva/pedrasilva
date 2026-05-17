import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
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
  Upload,
  User as UserIcon,
  Utensils,
  FolderKanban,
  LayoutGrid,
  TrendingUp,
  LineChart,
} from "lucide-react";
import logoPsa from "@/assets/logo-psa.png";
import { Badge } from "@/components/ui/badge";
import { ViewAsPicker } from "@/components/ViewAsPicker";
import { ModuleTopNav } from "@/components/ModuleTopNav";
import { LanguageSwitcher } from "@/components/language-switcher";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("projects");
  const { session, loading, isAdmin, isRealAdmin, viewAsUser, setViewAsUser, setViewAsCollaboratorId, user, signOut } = useAuth();
  const { permissions } = useMyPermissions();
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

  const can = (key: PermissionKey) => isAdmin || permissions.has(key);

  const items = [
    {
      to: "/" as const,
      label: "Hub",
      icon: Users,
      match: (p: string) => p === "/",
      show: true,
    },
    {
      to: "/hr/minha-ficha" as const,
      label: "Minha ficha",
      icon: UserIcon,
      match: (p: string) => p.startsWith("/hr/minha-ficha"),
      show: can("hr.minha-ficha"),
    },
    {
      to: "/hr/ferias" as const,
      label: "Férias",
      icon: CalendarDays,
      match: (p: string) => p.startsWith("/hr/ferias"),
      show: can("hr.ferias.own"),
    },
    {
      to: "/hr/beneficios" as const,
      label: "Benefícios",
      icon: Wallet,
      match: (p: string) => p.startsWith("/hr/beneficios"),
      show: can("hr.beneficios.own"),
    },
    {
      to: "/hr" as const,
      label: "Colaboradores",
      icon: Users,
      match: (p: string) =>
        p === "/hr" ||
        p.startsWith("/hr/colaborador"),
      show: can("hr.colaboradores"),
    },
    {
      to: "/hr/resumo" as const,
      label: "Resumo comparativo",
      icon: BarChart3,
      match: (p: string) => p.startsWith("/hr/resumo"),
      show: isRealAdmin,
    },
  ] as const;

  const settingsItems = [
    { to: "/hr/admin" as const, label: "Administração", icon: Shield, match: (p: string) => p.startsWith("/hr/admin") },
    { to: "/admin/imports" as const, label: "Importações", icon: Upload, match: (p: string) => p.startsWith("/admin/imports") },
    { to: "/admin/projects" as const, label: "Projetos (admin)", icon: Shield, match: (p: string) => p.startsWith("/admin/projects") },
    { to: "/hr/valor-bo" as const, label: "Valor BO/hora", icon: Calculator, match: (p: string) => p.startsWith("/hr/valor-bo") },
    { to: "/hr/dias-uteis" as const, label: "Dias úteis", icon: CalendarCheck, match: (p: string) => p.startsWith("/hr/dias-uteis") },
    { to: "/hr/subsidio-alimentacao" as const, label: "Subsídio alimentação", icon: Utensils, match: (p: string) => p.startsWith("/hr/subsidio-alimentacao") },
  ] as const;

  const visible = items.filter((it) => it.show);
  const settingsActive = isRealAdmin && settingsItems.some((s) => s.match(loc.pathname));
  // Cabeçalho/nav de HR só aparece nas rotas /hr.
  const isHrArea = loc.pathname.startsWith("/hr");
  // No bloco Projects também escondemos a nav HR (tem a sua própria shell).
  const isProjectsArea = loc.pathname.startsWith("/projects");
  // Na landing/Hub (/) escondemos também — os módulos já estão no corpo da página.
  const isHomeArea = loc.pathname === "/";
  const hideHrNav = isHrArea || isProjectsArea || isHomeArea;
  // Global top-nav (Time/Tasks/Schedule/Create) is always visible.


  const userInitial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-3 shrink-0"
          >
            <img
              src={logoPsa}
              alt="Pedra Silva Architects"
              className="h-8 w-auto object-contain"
            />
            {isHrArea && (
              <div className="hidden leading-tight border-l pl-3 lg:block">
                <div className="text-sm font-semibold whitespace-nowrap">PSA · Recursos Humanos</div>
                <div className="text-[11px] text-muted-foreground">Cálculo salarial</div>
              </div>
            )}
          </Link>

          {/* Nav principal — só fora da área HR (dentro do /hr usa-se a sidebar lateral) */}
          {!hideHrNav && (
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

            {isRealAdmin && (
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
          )}

          {/* Projects sub-nav (inline) — primary nav only: Projects + Team */}
          {isProjectsArea && (
            <nav className="hidden md:flex items-center gap-1 ml-2 text-sm">
              <Link to="/projects" className="flex items-center gap-2 mr-1">
                <FolderKanban className="h-4 w-4 text-primary" />
                <span className="font-display text-sm font-semibold tracking-tight">{t("nav.projects")}</span>
              </Link>
              <Link
                to="/projects"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  loc.pathname === "/projects"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {t("nav.projects")}
              </Link>
              <Link
                to="/projects/resources"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  loc.pathname.startsWith("/projects/resources")
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Users className="h-3.5 w-3.5" />
                {t("nav.team")}
              </Link>
            </nav>
          )}

          {/* Analytics dropdown — only for users with financial permissions */}
          {isProjectsArea && can("projects.financials") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    (loc.pathname.startsWith("/projects/financials") ||
                      loc.pathname.startsWith("/projects/forecast") ||
                      loc.pathname.startsWith("/projects/insights"))
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  {t("nav.analytics", "Analytics")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem asChild>
                  <Link
                    to="/projects/financials"
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      loc.pathname.startsWith("/projects/financials") && "bg-accent text-foreground font-medium",
                    )}
                  >
                    <BarChart3 className="h-4 w-4" />
                    {t("nav.financials")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/projects/forecast"
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      loc.pathname.startsWith("/projects/forecast") && "bg-accent text-foreground font-medium",
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    {t("nav.forecast")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/projects/insights"
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      loc.pathname.startsWith("/projects/insights") && "bg-accent text-foreground font-medium",
                    )}
                  >
                    <LineChart className="h-4 w-4" />
                    {t("nav.insights")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Acções à direita */}
          <div className="flex items-center gap-1.5">
            {viewAsUser && (
              <Button
                variant="secondary"
                size="sm"
                className="hidden md:inline-flex h-8 gap-1.5"
                onClick={() => {
                  setViewAsUser(false);
                  setViewAsCollaboratorId(null);
                }}
                title="Voltar a ver como super admin"
              >
                <span>Modo colaborador</span>
                <span className="text-xs opacity-70">· Sair</span>
              </Button>
            )}

            <LanguageSwitcher className="hidden md:inline-flex" />

            {isRealAdmin && (
              <Button
                asChild
                variant={loc.pathname.startsWith("/admin") ? "default" : "ghost"}
                size="sm"
                className="hidden md:inline-flex h-9 gap-1.5 px-2.5"
                title="Administração"
              >
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  <span className="hidden lg:inline">Admin</span>
                </Link>
              </Button>
            )}

            <div className="hidden md:flex items-center gap-0.5">
              <ModuleTopNav />
            </div>

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
                {isRealAdmin && (
                  <>
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-normal">
                      Admin
                    </DropdownMenuLabel>
                    <div className="px-1 pb-1">
                      <ViewAsPicker variant="mobile" />
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
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

                  {isRealAdmin && (
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
      <main
        className={cn(
          isHrArea
            ? ""
            : "mx-auto max-w-7xl px-4 py-6 sm:px-6",
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
