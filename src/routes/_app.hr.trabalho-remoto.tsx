import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Laptop, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/PermissionGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useRemoteWorkRequests,
  useCreateRemoteWorkRequests,
  useSetRemoteWorkStatus,
  useDeleteRemoteWorkRequest,
  type RemoteWorkRequest,
} from "@/hooks/use-remote-work";
import { toLocalISODate } from "@/lib/dates";

export const Route = createFileRoute("/_app/hr/trabalho-remoto")({
  component: () => (
    <PermissionGate permission="hr.ferias.own">
      <RemoteWorkPage />
    </PermissionGate>
  ),
});

type CollabRow = { id: string; nome: string; email: string | null };

function RemoteWorkPage() {
  const { t } = useTranslation(["hr", "common"]);
  const { user, isAdmin } = useAuth();

  const { data: collaborators = [] } = useQuery<CollabRow[]>({
    queryKey: ["collaborators", "directory-basic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators_directory")
        .select("id, nome, email")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CollabRow[];
    },
  });

  const nameOf = (id: string) =>
    collaborators.find((c) => c.id === id)?.nome ?? "—";

  const myCollab = useMemo(
    () =>
      collaborators.find(
        (c) =>
          c.email &&
          user?.email &&
          c.email.toLowerCase() === user.email.toLowerCase(),
      ) ?? null,
    [collaborators, user],
  );

  const requestsQ = useRemoteWorkRequests();
  const create = useCreateRemoteWorkRequests();
  const setStatus = useSetRemoteWorkStatus();
  const remove = useDeleteRemoteWorkRequest();

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalISODate(d);
  }, []);

  const [from, setFrom] = useState(tomorrow);
  const [to, setTo] = useState(tomorrow);
  const [notas, setNotas] = useState("");

  const requests = requestsQ.data ?? [];
  const mine = myCollab
    ? requests.filter((r) => r.collaborator_id === myCollab.id)
    : [];
  const pending = requests.filter((r) => r.estado === "pendente");

  const year = new Date().getFullYear();
  const monthPrefix = toLocalISODate(new Date()).slice(0, 7);
  const usage = useMemo(() => {
    const map = new Map<string, { year: number; month: number }>();
    for (const r of requests) {
      if (r.estado !== "aprovada") continue;
      const cur = map.get(r.collaborator_id) ?? { year: 0, month: 0 };
      if (r.data.startsWith(String(year))) cur.year += 1;
      if (r.data.startsWith(monthPrefix)) cur.month += 1;
      map.set(r.collaborator_id, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, nome: nameOf(id), ...v }))
      .sort((a, b) => b.year - a.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, collaborators]);

  const submit = async () => {
    if (!myCollab) {
      toast.error(t("hr:remoteWork.noCollaborator"));
      return;
    }
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    if (end < start) {
      toast.error(t("hr:remoteWork.invalidRange"));
      return;
    }
    const dates: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) dates.push(toLocalISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length === 0) {
      toast.error(t("hr:remoteWork.noWeekdays"));
      return;
    }
    try {
      await create.mutateAsync({
        collaboratorId: myCollab.id,
        dates,
        notas,
      });
      setNotas("");
      toast.success(t("hr:remoteWork.submitted"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Laptop className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">{t("hr:remoteWork.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.subtitle")}
          </p>
        </div>
      </header>

      {/* Request form */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.newRequest")}
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rw-from">{t("hr:remoteWork.from")}</Label>
            <Input
              id="rw-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > to) setTo(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rw-to">{t("hr:remoteWork.to")}</Label>
            <Input
              id="rw-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="rw-notes">{t("hr:remoteWork.notes")}</Label>
            <Textarea
              id="rw-notes"
              rows={1}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={t("hr:remoteWork.notesPlaceholder")}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t("hr:remoteWork.hint")}
          </p>
          <Button onClick={submit} disabled={create.isPending}>
            {t("hr:remoteWork.submit")}
          </Button>
        </div>
      </Card>

      {/* Pending approvals */}
      {isAdmin && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("hr:remoteWork.pendingQueue")} ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("hr:remoteWork.noPending")}
            </p>
          ) : (
            <ul className="divide-y">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {nameOf(r.collaborator_id)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.data}
                      {r.notas ? ` · ${r.notas}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setStatus.mutate({
                          id: r.id,
                          estado: "aprovada",
                          approverUserId: user?.id ?? null,
                        })
                      }
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      {t("hr:remoteWork.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setStatus.mutate({
                          id: r.id,
                          estado: "rejeitada",
                          approverUserId: user?.id ?? null,
                        })
                      }
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      {t("hr:remoteWork.reject")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* My requests */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.myRequests")}
        </h2>
        {requestsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noneYet")}
          </p>
        ) : (
          <ul className="divide-y">
            {mine.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.data}</div>
                  {r.notas && (
                    <div className="truncate text-xs text-muted-foreground">
                      {r.notas}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge estado={r.estado} />
                  {r.estado === "pendente" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(r.id)}
                      aria-label={t("hr:remoteWork.cancel")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Usage tracking */}
      {isAdmin && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("hr:remoteWork.usageTitle")}
          </h2>
          {usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("hr:remoteWork.noUsage")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2">{t("hr:remoteWork.collaborator")}</th>
                  <th className="py-2 text-right">
                    {t("hr:remoteWork.daysThisMonth")}
                  </th>
                  <th className="py-2 text-right">
                    {t("hr:remoteWork.daysThisYear")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usage.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2">{u.nome}</td>
                    <td className="py-2 text-right tabular-nums">{u.month}</td>
                    <td className="py-2 text-right tabular-nums">{u.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ estado }: { estado: RemoteWorkRequest["estado"] }) {
  const { t } = useTranslation("hr");
  const variant =
    estado === "aprovada"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : estado === "rejeitada"
        ? "bg-destructive/15 text-destructive"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return (
    <Badge className={`border-0 ${variant}`} variant="secondary">
      {t(`remoteWork.status.${estado}`)}
    </Badge>
  );
}
