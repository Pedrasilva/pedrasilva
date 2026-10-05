import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDriveArchiveStatus, retryDriveCopies } from "@/lib/finance/drive-archive.functions";

export function DriveArchivePage() {
  const { t } = useTranslation(["finance"]);
  const k = (x: string, o?: Record<string, unknown>) => t(`finance:driveArchive.${x}`, o);
  const qc = useQueryClient();
  const load = useServerFn(getDriveArchiveStatus);
  const retry = useServerFn(retryDriveCopies);
  const q = useQuery({ queryKey: ["finance", "drive-archive"], queryFn: () => load() });
  const m = useMutation({
    mutationFn: (ids: string[]) => retry({ data: { ids } }),
    onSuccess: (r) => {
      toast[r.errors.length ? "error" : "success"](k("retryAllDone", { copied: r.copied, failed: r.errors.length }));
      qc.invalidateQueries({ queryKey: ["finance", "drive-archive"] });
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : k("never"));
  const d = q.data;

  return (
    <div className="container mx-auto py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{k("title")}</h1>
        <p className="text-sm text-muted-foreground">{k("subtitle")}</p>
      </header>
      {q.isLoading || !d ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">{k("root")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!d.root.configured ? <p className="text-muted-foreground">{k("notConfigured")}</p> : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium">{d.root.name ?? d.root.id ?? "—"}</span>
                  {d.root.link && (
                    <Button asChild size="sm" variant="outline">
                      <a href={d.root.link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" />{k("openFolder")}</a>
                    </Button>
                  )}
                </div>
              )}
              {d.root.error && <p className="text-xs text-destructive break-all">{k("rootError")}: {d.root.error}</p>}
              <p className="text-xs text-muted-foreground">{k("lastCopy")}: {fmt(d.lastCopiedAt)}</p>
              <div className="flex gap-2 flex-wrap">
                {(["copied", "failed", "pending"] as const).map((s) => (
                  <Badge key={s} variant={s === "failed" && d.counts.failed ? "destructive" : "secondary"}>{k(`status.${s}`)}: {d.counts[s]}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm">{k("listTitle")}</CardTitle>
              {d.open.length > 0 && (
                <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(d.open.slice(0, 25).map((r) => r.id))}>
                  {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{k("retryAll")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {d.open.length === 0 && <p className="text-sm text-muted-foreground">{k("none")}</p>}
              {d.open.map((r) => (
                <div key={r.id} className="rounded-md border p-2.5 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.extracted_seller_name ?? r.original_filename ?? "—"} · {r.bank_period ?? "—"}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.drive_copy_status === "failed" ? "destructive" : "secondary"}>{k(`status.${r.drive_copy_status ?? "pending"}`)}</Badge>
                      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate([r.id])}>{k("retry")}</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.drive_copy_attempts} {k("attempts")}
                    {r.drive_copy_status === "failed" && ` · ${r.drive_next_retry_at ? k("nextRetry", { date: fmt(r.drive_next_retry_at) }) : k("waitingManual")}`}
                  </p>
                  {r.drive_copy_error && <p className="text-xs text-destructive break-all">{r.drive_copy_error.slice(0, 300)}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          {Object.keys(d.hr.counts).length > 0 && (
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">{k("hrTitle")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(d.hr.counts).map(([s, n]) => <Badge key={s} variant={s === "failed" ? "destructive" : "secondary"}>{s}: {n}</Badge>)}
                </div>
                <p className="text-xs text-muted-foreground">{k("hrLast")}: {fmt(d.hr.lastSyncedAt)}</p>
                {d.hr.sampleError && <p className="text-xs text-destructive break-all">{d.hr.sampleError.slice(0, 300)}</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
