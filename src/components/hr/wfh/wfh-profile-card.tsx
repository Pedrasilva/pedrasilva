import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Laptop } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WfhStatusChip } from "@/components/hr/wfh/wfh-status-chip";
import { useRemoteWorkRequests } from "@/hooks/use-remote-work";

export function WfhProfileCard({ collaboratorId }: { collaboratorId: string }) {
  const { t } = useTranslation(["hr", "common"]);
  const { data: requests = [], isLoading } = useRemoteWorkRequests();

  const rows = useMemo(
    () =>
      requests
        .filter((r) => r.collaborator_id === collaboratorId)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [requests, collaboratorId],
  );

  const year = String(new Date().getFullYear());
  const month = new Date().toISOString().slice(0, 7);
  // Active = approved or declared; half days count as 0.5 equivalent days.
  const active = rows.filter((r) => isActiveRemoteState(r.estado));
  const equivalent = (prefix: string) =>
    active
      .filter((r) => r.data.startsWith(prefix))
      .reduce((s, r) => s + dayPartWeight(r.day_part), 0);
  const thisYear = equivalent(year);
  const thisMonth = equivalent(month);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="h-4 w-4 text-muted-foreground" />
          {t("hr:remoteWork.title")}
        </CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            {t("hr:remoteWork.daysThisMonth")}:{" "}
            <strong className="tabular-nums text-foreground">{thisMonth}</strong>
          </span>
          <span>
            {t("hr:remoteWork.daysThisYear")}:{" "}
            <strong className="tabular-nums text-foreground">{thisYear}</strong>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noneYet")}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.slice(0, 12).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="tabular-nums">{r.data}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`hr:remoteWork.location.${r.location_type}`)}
                </span>
                <WfhStatusChip estado={r.estado} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
