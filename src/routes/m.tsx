import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import logoPsa from "@/assets/logo-psa.png";

export const Route = createFileRoute("/m")({
  component: MobileLayout,
  head: () => ({
    meta: [
      { title: "Captura rápida — Portal Pedra Silva" },
      { name: "description", content: "Phone-first capture: voice hours, project voice notes and marketing questions." },
      { property: "og:title", content: "Captura rápida — Portal Pedra Silva" },
      { property: "og:description", content: "Phone-first capture: voice hours, project voice notes and marketing questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const HINT_KEY = "psa.m.installHintDismissed";

function InstallHint() {
  const { t } = useTranslation("common");
  const [kind, setKind] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
    } catch { /* storage unavailable */ }
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setKind("ios");
    else if (/Android/i.test(ua)) setKind("android");
  }, []);
  if (!kind) return null;
  const dismiss = () => {
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* noop */ }
    setKind(null);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
      <span className="flex-1">{t(kind === "ios" ? "mobile.installIos" : "mobile.installAndroid")}</span>
      <button type="button" onClick={dismiss} aria-label={t("mobile.dismiss")} className="flex h-12 w-12 items-center justify-center">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function MobileLayout() {
  const { t } = useTranslation("common");
  const { session, loading, isPsaStaff, user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (loading || !(loc.pathname === "/m" || loc.pathname.startsWith("/m/"))) return;
    if (!session) navigate({ to: "/login", search: { next: loc.pathname }, replace: true });
    else if (!isPsaStaff) navigate({ to: "/finance", replace: true });
  }, [loading, session, isPsaStaff, loc.pathname, navigate]);

  if (loading || !session || !isPsaStaff) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background" suppressHydrationWarning>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("loading")} />
      </div>
    );
  }

  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email ?? "";
  const rawFirst = fullName.split(/[\s@.]/)[0] ?? "";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);

  return (
    <div
      className="min-h-[100dvh] overflow-x-hidden bg-background text-foreground"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6">
        <header className="flex min-h-14 items-center gap-3">
          <Link to="/m" className="flex shrink-0 items-center">
            <img src={logoPsa} alt="Pedra Silva Architects" className="h-7 w-auto object-contain" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{firstName}</span>
          <Link to="/" className="flex min-h-12 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            {t("mobile.openFullApp")}
          </Link>
        </header>
        <InstallHint />
        <Outlet />
      </div>
    </div>
  );
}
