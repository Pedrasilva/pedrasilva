import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMyCollaborator,
  useRemoteWorkRequests,
} from "@/hooks/use-remote-work";
import { toLocalISODate } from "@/lib/dates";

export const Route = createFileRoute("/_app/hr/trabalho-remoto/analytics")({
  component: AnalyticsTab,
});

type Period = "month" | "quarter" | "year" | "custom";

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  if (period === "month") {
    return {
      from: toLocalISODate(new Date(y, now.getMonth(), 1)),
      to: toLocalISODate(new Date(y, now.getMonth() + 1, 0)),
    };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      from: toLocalISODate(new Date(y, q * 3, 1)),
      to: toLocalISODate(new Date(y, q * 3 + 3, 0)),
    };
  }
  return {
    from: toLocalISODate(new Date(y, 0, 1)),
    to: toLocalISODate(new Date(y, 11, 31)),
  };
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end) {
    out.push(toLocalISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function AnalyticsTab() {
  const { t } = useTranslation(["hr", "common"]);
  const { collaborators } = useMyCollaborator();
  const requestsQ = useRemoteWorkRequests();

  const [period, setPeriod] = useState<Period>("year");
  const preset = periodRange(period === "custom" ? "year" : period);
  const [customFrom, setCustomFrom] = useState(preset.from);
  const [customTo, setCustomTo] = useState(preset.to);

  const range =
    period === "custom"
      ? { from: customFrom, to: customTo }
      : periodRange(period);

  const holidaysQ = useQuery<string[]>({
    queryKey: ["holidays", "iso", range.from, range.to],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("data")
        .gte("data", range.from)
        .lte("data", range.to);
      if (error) throw error;
      return (data ?? []).map((h) => h.data as string);
    },
  });

  const vacationsQ = useQuery<
    Array<{ collaborator_id: string; data_inicio: string; data_fim: string }>
  >({
    queryKey: ["vacations", "range", range.from, range.to],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, data_inicio, data_fim")
        .eq("estado", "aprovada")
        .lte("data_inicio", range.to)
        .gte("data_fim", range.from);
      if (error) throw error;
      return (data ?? []) as Array<{
        collaborator_id: string;
        data_inicio: string;
        data_fim: string;
      }>;
    },
  });

  const rows = useMemo(() => {
    const holidays = new Set(holidaysQ.data ?? []);
    const requests = (requestsQ.data ?? []).filter(
      (r) =>
        r.estado === "aprovada" && r.data >= range.from && r.data <= range.to,
    );

    const workdays = eachDay(range.from, range.to).filter((iso) => {
      const dow = new Date(iso + "T00:00:00").getDay();
      return dow !== 0 && dow !== 6 && !holidays.has(iso);
    });

    const vacationDays = new Map<string, Set<string>>();
    for (const v of vacationsQ.data ?? []) {
      const set = vacationDays.get(v.collaborator_id) ?? new Set<string>();
      for (const iso of workdays) {
        if (iso >= v.data_inicio && iso <= v.data_fim) set.add(iso);
      }
      vacationDays.set(v.collaborator_id, set);
    }

    const wfhByCollab = new Map<string, number>();
    for (const r of requests) {
      wfhByCollab.set(
        r.collaborator_id,
        (wfhByCollab.get(r.collaborator_id) ?? 0) + 1,
      );
    }

    return [...wfhByCollab.entries()].map(([id, days]) => {
      const collab = collaborators.find((c) => c.id === id);
      const dpw = collab?.days_per_week ?? null;
      // Eligible working days are only reliable when the contracted week is
      // known; otherwise we leave the percentage blank rather than guess.
      const eligible =
        dpw && dpw > 0
          ? Math.round(
              (workdays.length - (vacationDays.get(id)?.size ?? 0)) *
                (Math.min(dpw, 5) / 5),
            )
          : null;
      return {
        id,
        nome: collab?.nome ?? "—",
        days,
        eligible,
        pct: eligible && eligible > 0 ? (days / eligible) * 100 : null,
      };
    }).sort((a, b) => b.days - a.days);
  }, [
    holidaysQ.data,
    requestsQ.data,
    vacationsQ.data,
    collaborators,
    range.from,
    range.to,
  ]);

  const totalDays = rows.reduce((s, r) => s + r.days, 0);
  const people = rows.length;
  const avgDays = people > 0 ? totalDays / people : 0;
  const pcts = rows.map((r) => r.pct).filter((p): p is number => p !== null);
  const teamAvgPct =
    pcts.length > 0 ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requestsQ.data ?? []) {
      if (r.estado !== "aprovada") continue;
      if (r.data < range.from || r.data > range.to) continue;
      const key = r.data.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [requestsQ.data, range.from, range.to]);
  const trendMax = Math.max(1, ...trend.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.period")}</Label>
            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as Period)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">
                  {t("hr:remoteWork.periods.month")}
                </SelectItem>
                <SelectItem value="quarter">
                  {t("hr:remoteWork.periods.quarter")}
                </SelectItem>
                <SelectItem value="year">
                  {t("hr:remoteWork.periods.year")}
                </SelectItem>
                <SelectItem value="custom">
                  {t("hr:remoteWork.periods.custom")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="a-from">{t("hr:remoteWork.from")}</Label>
                <Input
                  id="a-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-to">{t("hr:remoteWork.to")}</Label>
                <Input
                  id="a-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("hr:remoteWork.kpi.totalDays")} value={String(totalDays)} />
        <Kpi label={t("hr:remoteWork.kpi.people")} value={String(people)} />
        <Kpi
          label={t("hr:remoteWork.kpi.avgDays")}
          value={avgDays.toFixed(1)}
        />
        <Kpi
          label={t("hr:remoteWork.kpi.avgPct")}
          value={teamAvgPct === null ? "—" : `${teamAvgPct.toFixed(1)}%`}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.comparisonTitle")}
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noUsage")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2">{t("hr:remoteWork.collaborator")}</th>
                  <th className="py-2 text-right">
                    {t("hr:remoteWork.wfhDays")}
                  </th>
                  <th className="py-2 text-right">
                    {t("hr:remoteWork.eligibleDays")}
                  </th>
                  <th className="py-2 text-right">{t("hr:remoteWork.wfhPct")}</th>
                  <th className="py-2 text-right">
                    {t("hr:remoteWork.teamAverage")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">{r.nome}</td>
                    <td className="py-2 text-right tabular-nums">{r.days}</td>
                    <td className="py-2 text-right tabular-nums">
                      {r.eligible ?? "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.pct === null ? "—" : `${r.pct.toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {teamAvgPct === null ? "—" : `${teamAvgPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.trendTitle")}
        </h2>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noUsage")}
          </p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pt-2">
            {trend.map(([key, value]) => (
              <div key={key} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {value}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, (value / trendMax) * 120)}px`,
                    background: "var(--sage)",
                  }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {key.slice(5)}/{key.slice(2, 4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}
