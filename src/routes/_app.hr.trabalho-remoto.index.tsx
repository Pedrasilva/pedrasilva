import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, X, Ban } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WfhStatusChip } from "@/components/hr/wfh/wfh-status-chip";
import {
  todayISO,
  useCanApproveRemoteWork,
  useCancelRemoteWorkRequest,
  useMyCollaborator,
  useRemoteWorkRequests,
  useSetRemoteWorkStatus,
  type RemoteWorkRequest,
} from "@/hooks/use-remote-work";

export const Route = createFileRoute("/_app/hr/trabalho-remoto/")({
  component: RequestsTab,
});

function RequestsTab() {
  const { t } = useTranslation(["hr", "common"]);
  const { user } = useAuth();
  const { collaborator, collaborators } = useMyCollaborator();
  const canApprove = useCanApproveRemoteWork();

  const requestsQ = useRemoteWorkRequests();
  const setStatus = useSetRemoteWorkStatus();
  const cancel = useCancelRemoteWorkRequest();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const nameOf = (id: string) =>
    collaborators.find((c) => c.id === id)?.nome ?? "—";

  const requests = requestsQ.data ?? [];
  const mine = collaborator
    ? requests.filter((r) => r.collaborator_id === collaborator.id)
    : [];
  const pending = useMemo(
    () =>
      requests
        .filter((r) => r.estado === "pendente")
        .sort((a, b) => a.data.localeCompare(b.data)),
    [requests],
  );

  const locationLabel = (r: RemoteWorkRequest) =>
    t(`hr:remoteWork.location.${r.location_type}`);

  const decide = async (
    id: string,
    estado: "aprovada" | "rejeitada",
    motivo?: string,
  ) => {
    try {
      await setStatus.mutateAsync({
        id,
        estado,
        approverUserId: user?.id ?? null,
        motivo: motivo ?? null,
      });
      setRejectId(null);
      setRejectReason("");
      toast.success(t("hr:remoteWork.decisionSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {canApprove && (
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
                <li key={r.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {nameOf(r.collaborator_id)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.data} · {locationLabel(r)}
                        {r.notas ? ` · ${r.notas}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70">
                        {t("hr:remoteWork.requestedOn")}:{" "}
                        {r.created_at.slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(r.id, "aprovada")}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {t("hr:remoteWork.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setRejectId(rejectId === r.id ? null : r.id)
                        }
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        {t("hr:remoteWork.reject")}
                      </Button>
                    </div>
                  </div>
                  {rejectId === r.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-sm"
                        value={rejectReason}
                        placeholder={t("hr:remoteWork.rejectReason")}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide(r.id, "rejeitada", rejectReason)}
                      >
                        {t("hr:remoteWork.confirmReject")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

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
            {mine.map((r) => {
              const cancellable =
                (r.estado === "pendente" ||
                  (r.estado === "aprovada" && r.data >= todayISO()));
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {r.data} · {locationLabel(r)}
                    </div>
                    {(r.notas || r.motivo_rejeicao) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {r.motivo_rejeicao ?? r.notas}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <WfhStatusChip estado={r.estado} />
                    {cancellable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => cancel.mutate(r.id)}
                        aria-label={t("hr:remoteWork.cancel")}
                        title={t("hr:remoteWork.cancel")}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
