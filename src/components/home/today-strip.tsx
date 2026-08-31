/**
 * Today strip — compact daily-context row shown directly under the hero:
 * who is off, upcoming holidays and upcoming celebrations.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Cake, CalendarHeart, Palmtree, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  useUpcomingCelebrations,
  useWhoIsOff,
  useUpcomingHolidays,
} from "@/hooks/use-home-feed";

export function TodayStrip() {
  const { t } = useTranslation(["home", "common"]);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`home:month.${i}`)),
    [t],
  );

  const fmtDate = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${months[(m ?? 1) - 1]}`;
  };

  const relativeDays = (days: number) => {
    if (days === 0) return t("home:relative.today");
    if (days === 1) return t("home:relative.tomorrow");
    if (days < 14) return t("home:relative.inDays", { days });
    return t("home:relative.inDays", { days });
  };

  const celebrationsQ = useUpcomingCelebrations(45);
  const offTodayQ = useWhoIsOff();
  const holidaysQ = useUpcomingHolidays(60);

  const off = offTodayQ.data ?? [];
  const holidays = holidaysQ.data ?? [];
  const celebrations = (celebrationsQ.data ?? []).filter((c) => c.daysAway > 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Off today ---------------------------------------------------- */}
      <StripCard
        icon={<Palmtree className="h-4 w-4" style={{ color: "var(--sage)" }} />}
        title={t("home:off.title")}
        meta={t("home:off.team")}
      >
        {offTodayQ.isLoading ? (
          <Empty>{t("common:loading")}</Empty>
        ) : off.length === 0 ? (
          <Empty>{t("home:off.empty")}</Empty>
        ) : (
          <>
            {off.slice(0, 4).map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar nome={v.nome} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{v.nome}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {t(`home:absence.${v.tipo}`, { defaultValue: v.tipo })} ·{" "}
                    {t("home:off.until", { date: fmtDate(v.data_fim) })}
                  </div>
                </div>
              </li>
            ))}
            {off.length > 4 && (
              <li className="px-5 py-2 text-[11px] text-muted-foreground">
                {t("home:off.more", {
                  count: off.length - 4,
                  defaultValue: `+${off.length - 4} more`,
                })}
              </li>
            )}
          </>
        )}
      </StripCard>

      {/* Holidays ----------------------------------------------------- */}
      <StripCard
        icon={
          <Sparkles
            className="h-4 w-4"
            style={{ color: "var(--clay-complement)" }}
          />
        }
        title={t("home:holidays.title")}
      >
        {holidaysQ.isLoading ? (
          <Empty>{t("common:loading")}</Empty>
        ) : holidays.length === 0 ? (
          <Empty>{t("home:holidays.empty")}</Empty>
        ) : (
          holidays.slice(0, 3).map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{h.nome}</div>
                <div className="text-[11px] text-muted-foreground">
                  {fmtDate(h.data)}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                {relativeDays(h.daysAway)}
              </span>
            </li>
          ))
        )}
      </StripCard>

      {/* Celebrations ------------------------------------------------- */}
      <StripCard
        icon={
          <CalendarHeart className="h-4 w-4" style={{ color: "var(--clay)" }} />
        }
        title={t("home:celebrations.title")}
        meta={t("home:celebrations.window")}
      >
        {celebrationsQ.isLoading ? (
          <Empty>{t("common:loading")}</Empty>
        ) : celebrations.length === 0 ? (
          <Empty>{t("home:celebrations.empty")}</Empty>
        ) : (
          celebrations.slice(0, 4).map((c) => {
            const isBirthday = c.kind === "birthday";
            const Icon = isBirthday ? Cake : Sparkles;
            const accent = isBirthday ? "var(--clay)" : "var(--sage)";
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `color-mix(in oklab, ${accent} 15%, transparent)`,
                      color: accent,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {isBirthday
                        ? t("home:celebrate.turnsAge", { age: c.age })
                        : t("home:celebrate.yearsAtPsa", { count: c.years })}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-medium tabular-nums">
                    {fmtDate(c.date)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {relativeDays(c.daysAway)}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </StripCard>
    </div>
  );
}

function StripCard({
  icon,
  title,
  meta,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-display text-base font-semibold tracking-tight">
            {title}
          </h3>
        </div>
        {meta && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      <ul className="divide-y">{children}</ul>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-5 py-6 text-center text-xs text-muted-foreground">
      {children}
    </li>
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{
        background: "color-mix(in oklab, var(--clay) 18%, transparent)",
        color: "var(--clay)",
      }}
    >
      {initials || "?"}
    </span>
  );
}
