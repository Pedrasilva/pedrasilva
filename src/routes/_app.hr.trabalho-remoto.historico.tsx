import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WfhStatusChip } from "@/components/hr/wfh/wfh-status-chip";
import {
  useMyCollaborator,
  useRemoteWorkRequests,
  type RemoteWorkStatus,
} from "@/hooks/use-remote-work";
import { toLocalISODate } from "@/lib/dates";

export const Route = createFileRoute("/_app/hr/trabalho-remoto/historico")({
  component: HistoryTab,
});

const ALL = "__all__";

function HistoryTab() {
  const { t } = useTranslation(["hr", "common"]);
  const { collaborators } = useMyCollaborator();
  const requestsQ = useRemoteWorkRequests();
  const requests = requestsQ.data ?? [];

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [who, setWho] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [location, setLocation] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const nameOf = (id: string) =>
    collaborators.find((c) => c.id === id)?.nome ?? "—";

  const monthLabel = new Date(month.y, month.m, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  const approvedByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of requests) {
      if (r.estado !== "aprovada") continue;
      const list = map.get(r.data) ?? [];
      list.push(nameOf(r.collaborator_id));
      map.set(r.data, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, collaborators]);

  const days = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const total = new Date(month.y, month.m + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push({ iso: toLocalISODate(new Date(month.y, month.m, d)), day: d });
    }
    return cells;
  }, [month]);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => (who === ALL ? true : r.collaborator_id === who))
      .filter((r) => (status === ALL ? true : r.estado === status))
      .filter((r) => (location === ALL ? true : r.location_type === location))
      .filter((r) => (from ? r.data >= from : true))
      .filter((r) => (to ? r.data <= to : true))
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [requests, who, status, location, from, to]);

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("hr:remoteWork.calendarTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium capitalize">
              {monthLabel}
            </span>
            <Button size="icon" variant="ghost" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[11px]">
          {days.map((cell, i) =>
            cell === null ? (
              <div key={`e${i}`} />
            ) : (
              <div
                key={cell.iso}
                className="min-h-[64px] rounded-md border border-border/50 p-1.5"
              >
                <div className="mb-1 text-muted-foreground">{cell.day}</div>
                {(approvedByDay.get(cell.iso) ?? []).slice(0, 3).map((n) => (
                  <div
                    key={n}
                    className="truncate rounded px-1 py-0.5"
                    style={{
                      background:
                        "color-mix(in oklab, var(--sage) 15%, transparent)",
                      color: "var(--sage)",
                    }}
                  >
                    {n}
                  </div>
                ))}
                {(approvedByDay.get(cell.iso) ?? []).length > 3 && (
                  <div className="px-1 text-muted-foreground">
                    +{(approvedByDay.get(cell.iso) ?? []).length - 3}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.recordsTitle")}
        </h2>

        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.collaborator")}</Label>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("hr:remoteWork.all")}</SelectItem>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.statusLabel")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("hr:remoteWork.all")}</SelectItem>
                {(
                  [
                    "pendente",
                    "aprovada",
                    "rejeitada",
                    "cancelada",
                  ] as RemoteWorkStatus[]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`hr:remoteWork.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.locationType")}</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("hr:remoteWork.all")}</SelectItem>
                <SelectItem value="home">
                  {t("hr:remoteWork.location.home")}
                </SelectItem>
                <SelectItem value="remote">
                  {t("hr:remoteWork.location.remote")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-from">{t("hr:remoteWork.from")}</Label>
            <Input
              id="h-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-to">{t("hr:remoteWork.to")}</Label>
            <Input
              id="h-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {requestsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noRecords")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2">{t("hr:remoteWork.date")}</th>
                  <th className="py-2">{t("hr:remoteWork.collaborator")}</th>
                  <th className="py-2">{t("hr:remoteWork.locationType")}</th>
                  <th className="py-2">{t("hr:remoteWork.statusLabel")}</th>
                  <th className="py-2">{t("hr:remoteWork.requestedOn")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 tabular-nums">{r.data}</td>
                    <td className="py-2">{nameOf(r.collaborator_id)}</td>
                    <td className="py-2">
                      {t(`hr:remoteWork.location.${r.location_type}`)}
                    </td>
                    <td className="py-2">
                      <WfhStatusChip estado={r.estado} />
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {r.created_at.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
