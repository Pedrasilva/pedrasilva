/**
 * Today strip — compact daily-context row shown directly under the hero:
 * team availability (out / working from home / coming up), upcoming holidays
 * and upcoming celebrations.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Cake, CalendarHeart, Palmtree, Sparkles, Laptop } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  useUpcomingCelebrations,
  useTeamAvailability,
  useUpcomingHolidays,
  type AvailabilityItem,
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
  const availabilityQ = useTeamAvailability(14);
  const holidaysQ = useUpcomingHolidays(60);

  const availability = availabilityQ.data;
  const holidays = holidaysQ.data ?? [];
  const celebrations = (celebrationsQ.data ?? []).filter((c) => c.daysAway > 0);

  const outToday = availability?.outToday ?? [];
  const remoteToday = availability?.remoteToday ?? [];
  const upcoming = availability?.upcoming ?? [];
  const nothing =
    outToday.length === 0 && remoteToday.length === 0 && upcoming.length === 0;

  const itemMeta = (item: AvailabilityItem) => {
    if (item.kind === "remote") return t("home:availability.remote");
    const type = t(`home:absence.${item.tipo}`, { defaultValue: item.tipo ?? "" });
    return `${type} · ${t("home:off.until", { date: fmtDate(item.end) })}`;
  };

  const upcomingMeta = (item: AvailabilityItem) => {
    if (item.kind === "remote") return t("home:availability.remote");
    const type = t(`home:absence.${item.tipo}`, { defaultValue: item.tipo ?? "" });
    return item.start === item.end
      ? type
      : `${type} · ${fmtDate(item.start)}–${fmtDate(item.end)}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Team availability ------------------------------------------- */}
      <StripCard
        icon={<Palmtree className="h-4 w-4" style={{ color: "var(--sage)" }} />}
        title={t("home:availability.title")}
        meta={t("home:off.team")}
      >
        {availabilityQ.isLoading ? (
          <Empty>{t("common:loading")}</Empty>
        ) : nothing ? (
          <Empty>{t("home:off.empty")}</Empty>
        ) : (
          <>
            {outToday.length > 0 && (
              <>
                <GroupLabel>{t("home:availability.outToday")}</GroupLabel>
                {outToday.slice(0, 4).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar nome={v.nome} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{v.nome}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {itemMeta(v)}
                      </div>
                    </div>
                  </li>
                ))}
              </>
            )}

            {remoteToday.length > 0 && (
              <>
                <GroupLabel>{t("home:availability.wfhToday")}</GroupLabel>
                {remoteToday.slice(0, 4).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background:
                          "color-mix(in oklab, var(--sage) 15%, transparent)",
                        color: "var(--sage)",
                      }}
                    >
                      <Laptop className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{v.nome}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {t("home:availability.remote")}
                      </div>
                    </div>
                  </li>
                ))}
              </>
            )}

            {upcoming.length > 0 && (
              <>
                <GroupLabel>{t("home:availability.comingUp")}</GroupLabel>
                {upcoming.slice(0, 4).map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{v.nome}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {upcomingMeta(v)}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {fmtDate(v.start)}
                    </span>
                  </li>
                ))}
              </>
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="bg-muted/40 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </li>
  );
}
