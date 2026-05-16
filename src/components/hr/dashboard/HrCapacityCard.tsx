import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HrCapacityOverview, HrCapacityEntry } from "@/hooks/use-hr-capacity-overview";

type Props = { data: HrCapacityOverview | undefined; loading?: boolean };

function formatRange(start: string, end: string, locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  const s = fmt.format(new Date(start));
  const e = fmt.format(new Date(end));
  return s === e ? s : `${s} → ${e}`;
}

export function HrCapacityCard({ data, loading }: Props) {
  const { t, i18n } = useTranslation("hr");
  const [tab, setTab] = useState<"today" | "next14">("today");

  const list: HrCapacityEntry[] = useMemo(() => {
    if (!data) return [];
    return tab === "today"
      ? data.current
      : [...data.current, ...data.upcoming14].slice(0, 8);
  }, [data, tab]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          {t("dashboard.capacity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.capacity.current")}
                </div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums">
                  {data.current.length}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.capacity.next14")}
                </div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums">
                  {data.upcoming14.length}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.capacity.overlaps")}
                </div>
                <div
                  className={
                    "mt-0.5 text-xl font-semibold tabular-nums " +
                    (data.overlapsNext30 > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "")
                  }
                >
                  {data.overlapsNext30}
                </div>
              </div>
            </div>

            {data.current.length + data.upcoming14.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("dashboard.capacity.empty")}
              </p>
            ) : (
              <>
                <Tabs value={tab} onValueChange={(v) => setTab(v as "today" | "next14")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="today" className="text-xs h-7 px-3">
                      {t("dashboard.capacity.tabs.today")} ({data.current.length})
                    </TabsTrigger>
                    <TabsTrigger value="next14" className="text-xs h-7 px-3">
                      {t("dashboard.capacity.tabs.next14")} (
                      {data.current.length + data.upcoming14.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    {t("dashboard.capacity.emptyToday")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((e) => (
                      <li
                        key={e.vacationId}
                        className="flex items-center justify-between gap-2 text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Users className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{e.collaboratorName}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {e.tipo}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {formatRange(e.startDate, e.endDate, i18n.language)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
