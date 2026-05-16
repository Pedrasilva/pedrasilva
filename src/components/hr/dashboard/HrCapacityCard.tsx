import { useTranslation } from "react-i18next";
import { CalendarDays, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { HrCapacityOverview } from "@/hooks/use-hr-capacity-overview";

type Props = { data: HrCapacityOverview | undefined; loading?: boolean };

export function HrCapacityCard({ data, loading }: Props) {
  const { t } = useTranslation("hr");
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
          <Skeleton className="h-32 w-full" />
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
                <div className="mt-0.5 text-xl font-semibold tabular-nums">
                  {data.overlapsNext30}
                </div>
              </div>
            </div>

            {data.current.length === 0 && data.upcoming30.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("dashboard.capacity.empty")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {[...data.current, ...data.upcoming30].slice(0, 6).map((e) => (
                  <li
                    key={e.vacationId}
                    className="flex items-center justify-between gap-2 text-sm border-b border-border/40 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{e.collaboratorName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {e.tipo}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {e.startDate} → {e.endDate}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
