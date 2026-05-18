import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { LogOut, Menu } from "lucide-react";
import logoPsa from "@/assets/logo-psa.png";
import { ViewAsPicker } from "@/components/ViewAsPicker";
import { GlobalTopNav } from "@/components/GlobalTopNav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AppRail } from "@/components/shell/AppRail";
import { RAIL_ITEMS } from "@/components/shell/nav-config";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { session, loading, isAdmin, isRealAdmin, viewAsUser, setViewAsUser, setViewAsCollaboratorId, user, signOut } = useAuth();
  const { permissions } = useMyPermissions();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  const can = (k?: PermissionKey) => !k || isAdmin || permissions.has(k);
  const userInitial = (user?.email ?? "?").charAt(0).toUpperCase();
  const isHrArea = loc.pathname.startsWith("/hr");

  // Items for mobile sheet — flatten rail config.
  const mobileItems = RAIL_ITEMS.filter(
    (i) => can(i.perm) && (!i.adminOnly || isAdmin),
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img
                src={logoPsa}
                alt="Pedra Silva Architects"
                className="h-8 w-auto object-contain"
              />
            </Link>

            <div className="flex-1" />

            {/* Top-right global action hubs */}
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
                >
                  <span>Modo colaborador · Sair</span>
                </Button>
              )}

              <div className="hidden md:flex items-center gap-0.5">
                <GlobalTopNav />
              </div>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("shell.top.account")}
                    className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                  >
                    {userInitial}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{t("signedInAs")}</span>
                      <span className="text-sm font-medium truncate">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1">
                    <LanguageSwitcher />
                  </div>
                  {isRealAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-normal">
                        Admin
                      </DropdownMenuLabel>
                      <div className="px-1 pb-1">
                        <ViewAsPicker variant="mobile" />
                      </div>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => signOut()} className="cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile hamburger */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("menu")}>
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] p-0">
                  <SheetHeader className="border-b px-5 py-4 text-left">
                    <SheetTitle className="text-base">PSA Hub</SheetTitle>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        {userInitial}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                    </div>
                  </SheetHeader>
                  <div className="flex flex-col p-3">
                    <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("navigation")}
                    </div>
                    {mobileItems.map((it) => {
                      const Icon = it.icon;
                      const active = it.matches.some(
                        (m) => loc.pathname === m || loc.pathname.startsWith(m + "/"),
                      );
                      return (
                        <Link
                          key={it.id}
                          to={it.to as never}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-accent",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {t(`shell.rail.${it.labelKey}`)}
                        </Link>
                      );
                    })}
                    <div className="my-3 border-t" />
                    {isRealAdmin && <ViewAsPicker variant="mobile" />}
                    <button
                      onClick={() => signOut()}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4" />
                      {t("signOut")}
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main
          className={cn(
            isHrArea ? "" : "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6",
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
