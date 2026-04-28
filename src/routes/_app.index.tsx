import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import {
  useUpcomingCelebrations,
  useWhoIsOff,
  useUpcomingHolidays,
} from "@/hooks/use-home-feed";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import {
  Users,
  Building2,
  Briefcase,
  Wallet,
  ArrowUpRight,
  Cake,
  Sparkles,
  Palmtree,
  CalendarHeart,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PermissionKey } from "@/lib/permissions";

export const Route = createFileRoute("/_app/")({
  component: HubPage,
});

type ModuleDef = {
  to: "/hr" | "/crm" | "/projects" | "/finance";
  number: string;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  anyOf: PermissionKey[];
};

const MODULES: ModuleDef[] = [
  {
    to: "/hr",
    number: "01",
    titleKey: "hr:module.title",
    subtitleKey: "hr:module.subtitle",
    descriptionKey: "hr:module.description",
    icon: Users,
    anyOf: [
      "hr.minha-ficha",
      "hr.ferias.own",
      "hr.beneficios.own",
      "hr.colaboradores",
      "hr.resumo",
      "hr.dias-uteis",
    ],
  },
  {
    to: "/crm",
    number: "02",
    titleKey: "crm:module.title",
    subtitleKey: "crm:module.subtitle",
    descriptionKey: "crm:module.description",
    icon: Building2,
    anyOf: ["crm.companies", "crm.contacts", "crm.pipeline"],
  },
  {
    to: "/projects",
    number: "03",
    titleKey: "projects:module.title",
    subtitleKey: "projects:module.subtitle",
    descriptionKey: "projects:module.description",
    icon: Briefcase,
    anyOf: [
      "projects.all",
      "projects.gantt",
      "projects.resources",
      "projects.my-tasks",
      "projects.timesheet",
    ],
  },
  {
    to: "/finance",
    number: "04",
    titleKey: "finance:module.title",
    subtitleKey: "finance:module.subtitle",
    descriptionKey: "finance:module.description",
    icon: Wallet,
    anyOf: ["finance.dashboard"],
  },
];

const QUOTES = [
  {
    text: "Architecture is the learned game, correct and magnificent, of forms assembled in the light.",
    author: "Le Corbusier",
  },
  {
    text: "We shape our buildings; thereafter they shape us.",
    author: "Winston Churchill",
  },
  {
    text: "Less is more.",
    author: "Mies van der Rohe",
  },
  {
    text: "God is in the details.",
    author: "Mies van der Rohe",
  },
  {
    text: "Form follows function — that has been misunderstood. Form and function should be one.",
    author: "Frank Lloyd Wright",
  },
  {
    text: "Architecture is the thoughtful making of space.",
    author: "Louis Kahn",
  },
  {
    text: "A great building must begin with the immeasurable, must go through measurable means when it is being designed, and in the end must be unmeasurable.",
    author: "Louis Kahn",
  },
  {
    text: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
  },
];

function quoteOfTheDay() {
  const d = new Date();
  const dayOfYear = Math.floor(
    (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return QUOTES[dayOfYear % QUOTES.length];
}



function HubPage() {
  const { t } = useTranslation(["home", "common", "hr", "crm", "projects", "finance"]);
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { permissions, loading: permsLoading } = useMyPermissions();
  const loading = authLoading || permsLoading;

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`home:month.${i}`)),
    [t],
  );
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => t(`home:weekday.${i}`)),
    [t],
  );

  const fmtDate = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${months[(m ?? 1) - 1]}`;
  };

  const relativeDays = (days: number) => {
    if (days === 0) return t("home:relative.today");
    if (days === 1) return t("home:relative.tomorrow");
    if (days < 7) return t("home:relative.inDays", { days });
    if (days < 14) return t("home:relative.nextWeek");
    return t("home:relative.inDays", { days });
  };

  const visible = useMemo(() => {
    if (isAdmin) return MODULES;
    return MODULES.filter((m) => m.anyOf.some((k) => permissions.has(k)));
  }, [isAdmin, permissions]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return t("home:greeting.night");
    if (h < 12) return t("home:greeting.morning");
    if (h < 20) return t("home:greeting.afternoon");
    return t("home:greeting.evening");
  }, [t]);

  const firstName = useMemo(() => {
    const email = user?.email ?? "";
    const local = email.split("@")[0] ?? "";
    if (!local) return "";
    return local
      .split(/[._-]/)[0]
      .replace(/^./, (c) => c.toUpperCase());
  }, [user?.email]);

  const today = useMemo(() => {
    const d = new Date();
    return `${weekdays[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }, [weekdays, months]);

  const quote = useMemo(quoteOfTheDay, []);

  const celebrationsQ = useUpcomingCelebrations(45);
  const offTodayQ = useWhoIsOff();
  const holidaysQ = useUpcomingHolidays(60);

  const todayCelebrations =
    celebrationsQ.data?.filter((c) => c.daysAway === 0) ?? [];
  const upcomingCelebrations =
    celebrationsQ.data?.filter((c) => c.daysAway > 0).slice(0, 6) ?? [];

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t("common:loading")}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("home:noModules.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("home:noModules.body")}
        </p>
      </div>
    );
  }

  return (
    <div className="psa-editorial -mx-4 -my-6 sm:-mx-6">
      {/* HERO ============================================================= */}
      <section
        className="relative overflow-hidden border-b"
        style={{
          background:
            "linear-gradient(180deg, var(--cream) 0%, var(--background) 100%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16">
          <div className="flex items-baseline justify-between gap-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {today}
            </div>
            <div className="hidden md:block text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("home:studioHub")}
            </div>
          </div>

          <h1 className="mt-6 font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight max-w-4xl">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
            <span className="block text-muted-foreground">
              {t("home:tagline")}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base sm:text-lg text-foreground/70 leading-relaxed">
            {t("home:intro")}
          </p>

          {/* Today's celebration banner */}
          {todayCelebrations.length > 0 && (
            <div className="mt-8 inline-flex flex-wrap items-center gap-3 rounded-full border bg-background/80 px-5 py-2.5 backdrop-blur shadow-sm">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-background"
                style={{ background: "var(--clay)" }}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium">
                {t("home:todayCelebrate", {
                  names: todayCelebrations
                    .map((c) =>
                      c.kind === "birthday"
                        ? t("home:celebrate.birthday", { name: c.nome })
                        : t("home:celebrate.anniversary", {
                            name: c.nome,
                            years: c.years,
                          }),
                    )
                    .join(", "),
                })}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* MODULES ========================================================== */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 lg:pt-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("home:modules.kicker")}
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {t("home:modules.title")}
            </h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.to} to={m.to} className="group block">
                <Card
                  className={cn(
                    "relative h-full overflow-hidden border-border/70 transition-all duration-300",
                    "hover:-translate-y-1 hover:shadow-xl hover:border-foreground/20",
                  )}
                >
                  <div className="p-6 sm:p-7">
                    <div className="flex items-start justify-between">
                      <span
                        className="font-display text-5xl font-semibold leading-none text-foreground/10 transition-colors group-hover:text-foreground/30"
                      >
                        {m.number}
                      </span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors group-hover:border-foreground/40 group-hover:bg-foreground group-hover:text-background">
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-12" />
                      </span>
                    </div>
                    <div className="mt-10">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {t(m.subtitleKey)}
                      </div>
                      <h3 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                        {t(m.titleKey)}
                      </h3>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {t(m.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FINANCE SNAPSHOT ================================================= */}
      {(isAdmin || permissions.has("finance.dashboard")) && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-2">
          <FinanceSnapshotBlock />
        </section>
      )}

      {/* WIDGETS ========================================================== */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {t("home:studio.kicker")}
          </div>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {t("home:studio.title")}
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Celebrations ------------------------------------------------ */}
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <CalendarHeart
                  className="h-4 w-4"
                  style={{ color: "var(--clay)" }}
                />
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {t("home:celebrations.title")}
                </h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("home:celebrations.window")}
              </span>
            </div>
            <ul className="divide-y">
              {celebrationsQ.isLoading && (
                <li className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("common:loading")}
                </li>
              )}
              {!celebrationsQ.isLoading &&
                upcomingCelebrations.length === 0 && (
                  <li className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("home:celebrations.empty")}
                  </li>
                )}
              {upcomingCelebrations.map((c) => {
                const isBirthday = c.kind === "birthday";
                const Icon = isBirthday ? Cake : Sparkles;
                const accent = isBirthday ? "var(--clay)" : "var(--sage)";
                const label = isBirthday
                  ? t("home:celebrate.turnsAge", { age: c.age })
                  : t("home:celebrate.yearsAtPsa", { count: c.years });
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-4 px-6 py-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: `color-mix(in oklab, ${accent} 15%, transparent)`,
                          color: accent,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium tabular-nums">
                        {fmtDate(c.date)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {relativeDays(c.daysAway)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Side column: who is off + holidays + quote ------------------ */}
          <div className="space-y-4">
            {/* Who is off */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Palmtree
                    className="h-4 w-4"
                    style={{ color: "var(--sage)" }}
                  />
                  <h3 className="font-display text-base font-semibold tracking-tight">
                    {t("home:off.title")}
                  </h3>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("home:off.team")}
                </span>
              </div>
              <ul className="divide-y">
                {offTodayQ.isLoading && (
                  <li className="px-5 py-5 text-center text-xs text-muted-foreground">
                    {t("common:loading")}
                  </li>
                )}
                {!offTodayQ.isLoading && (offTodayQ.data?.length ?? 0) === 0 && (
                  <li className="px-5 py-5 text-center text-xs text-muted-foreground">
                    {t("home:off.empty")}
                  </li>
                )}
                {offTodayQ.data?.slice(0, 5).map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar nome={v.nome} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {v.nome}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t(`home:absence.${v.tipo}`, { defaultValue: v.tipo })} ·{" "}
                          {t("home:off.until", { date: fmtDate(v.data_fim) })}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Holidays */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Sparkles
                    className="h-4 w-4"
                    style={{ color: "var(--clay-complement)" }}
                  />
                  <h3 className="font-display text-base font-semibold tracking-tight">
                    {t("home:holidays.title")}
                  </h3>
                </div>
              </div>
              <ul className="divide-y">
                {holidaysQ.isLoading && (
                  <li className="px-5 py-5 text-center text-xs text-muted-foreground">
                    {t("common:loading")}
                  </li>
                )}
                {!holidaysQ.isLoading && (holidaysQ.data?.length ?? 0) === 0 && (
                  <li className="px-5 py-5 text-center text-xs text-muted-foreground">
                    {t("home:holidays.empty")}
                  </li>
                )}
                {holidaysQ.data?.slice(0, 4).map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {h.nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(h.data)}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                      {relativeDays(h.daysAway)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        {/* Quote ------------------------------------------------------- */}
        <Card
          className="mt-4 overflow-hidden border-0"
          style={{ background: "var(--ink)", color: "var(--cream)" }}
        >
          <div className="px-8 py-10 sm:px-12 sm:py-14">
            <Quote className="h-6 w-6 opacity-40" />
            <blockquote className="mt-4 font-display text-2xl sm:text-3xl leading-snug tracking-tight max-w-4xl">
              “{quote.text}”
            </blockquote>
            <div className="mt-6 text-[11px] uppercase tracking-[0.24em] opacity-70">
              — {quote.author}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Avatar({ nome }: { nome: string }) {
  const initials = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        background: "color-mix(in oklab, var(--clay) 18%, transparent)",
        color: "var(--clay)",
      }}
    >
      {initials || "?"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Finance snapshot block (home page)
// ---------------------------------------------------------------------------

const FINANCE_HOME_YEAR = 2026;
const fmtEURHome = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);

function FinanceSnapshotBlock() {
  const { t } = useTranslation(["finance", "common"]);
  const now = new Date();
  const month = now.getMonth() + 1;

  const periodQ = useQuery({
    queryKey: ["home-finance", "period", FINANCE_HOME_YEAR, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_periods")
        .select("id, opening_balance")
        .eq("year", FINANCE_HOME_YEAR)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const periodId = periodQ.data?.id ?? null;

  const incomeQ = useQuery({
    queryKey: ["home-finance", "income", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_income_items")
        .select("amount_inc_vat, amount_ex_vat, vat_amount")
        .eq("period_id", periodId!);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) =>
          s +
          (r.amount_inc_vat != null
            ? Number(r.amount_inc_vat)
            : Number(r.amount_ex_vat || 0) + Number(r.vat_amount || 0)),
        0,
      );
    },
  });

  const expensesQ = useQuery({
    queryKey: ["home-finance", "expenses", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_expense_items")
        .select("amount_inc_vat, amount_ex_vat, vat_amount")
        .eq("period_id", periodId!);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) =>
          s +
          (r.amount_inc_vat != null
            ? Number(r.amount_inc_vat)
            : Number(r.amount_ex_vat || 0) + Number(r.vat_amount || 0)),
        0,
      );
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["home-finance", "snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("bank_account_id, snapshot_date, balance")
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      const seen = new Map<string, number>();
      for (const r of data ?? []) {
        if (!seen.has(r.bank_account_id))
          seen.set(r.bank_account_id, Number(r.balance || 0));
      }
      return Array.from(seen.values()).reduce((s, v) => s + v, 0);
    },
  });

  const currentBalance = snapshotsQ.data ?? 0;
  const income = incomeQ.data ?? 0;
  const expenses = expensesQ.data ?? 0;
  const net = income - expenses;
  const projected = currentBalance + net;

  const statusKey =
    net > 0 ? "positive" : net < 0 ? "negative" : "flat";
  const statusTone =
    net > 0
      ? "text-emerald-600"
      : net < 0
        ? "text-rose-600"
        : "text-muted-foreground";
  const StatusIcon = net >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" style={{ color: "var(--clay)" }} />
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("finance:home.kicker")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <KpiMini
              label={t("finance:home.currentBalance")}
              value={fmtEURHome(currentBalance)}
            />
            <KpiMini
              label={t("finance:home.expectedIncome")}
              value={fmtEURHome(income)}
              tone="text-emerald-700"
            />
            <KpiMini
              label={t("finance:home.expectedExpenses")}
              value={fmtEURHome(expenses)}
              tone="text-rose-700"
            />
            <KpiMini
              label={t("finance:home.projectedClosing")}
              value={fmtEURHome(projected)}
            />
          </div>
          <div className={cn("flex items-center gap-2 text-sm", statusTone)}>
            <StatusIcon className="h-4 w-4" />
            <span>{t(`finance:home.status.${statusKey}`)}</span>
          </div>
        </div>
        <Button asChild variant="outline" className="md:self-center">
          <Link to="/finance">
            {t("finance:home.open")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function KpiMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-lg font-semibold tabular-nums",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

