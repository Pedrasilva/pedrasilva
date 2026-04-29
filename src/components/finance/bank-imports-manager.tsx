/**
 * Admin-only manager for `bank_statement_imports` of a single bank account.
 *
 * Lets the user:
 *   - inspect each import's file name, period, status, and row counts
 *   - move an import (and all its transactions) to another bank account,
 *     with re-checked duplicate guards on the target
 *   - undo an import: deletes if clean, soft-archives if it has linked
 *     payments, asks for confirmation if any rows have been classified
 *
 * Both correction flows go through SECURITY DEFINER RPCs that enforce admin
 * role server-side. This component additionally hides the actions for
 * non-admins.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Loader2,
  RotateCcw,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type ImportRow = {
  id: string;
  file_name: string;
  bank_account_id: string;
  status: string;
  rows_imported: number;
  rows_total: number;
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  undone_at: string | null;
  moved_at: string | null;
  original_account_id: string | null;
};

type Account = { id: string; account_name: string };

export function BankImportsManager({
  accountId,
  accounts,
  onChanged,
}: {
  accountId: string;
  accounts: Account[];
  onChanged: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<ImportRow | null>(null);
  const [undoTarget, setUndoTarget] = useState<ImportRow | null>(null);

  const importsQ = useQuery({
    enabled: open && !!accountId,
    queryKey: ["finance", "bank-imports", accountId],
    queryFn: async (): Promise<ImportRow[]> => {
      const { data, error } = await supabase
        .from("bank_statement_imports")
        .select(
          "id, file_name, bank_account_id, status, rows_imported, rows_total, imported_at, period_start, period_end, undone_at, moved_at, original_account_id"
        )
        .eq("bank_account_id", accountId)
        .order("imported_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ImportRow[];
    },
  });

  function refreshAll() {
    importsQ.refetch();
    qc.invalidateQueries({ queryKey: ["finance", "bank-tx"] });
    qc.invalidateQueries({ queryKey: ["finance", "bank-tx-counts"] });
    onChanged();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings2 className="size-4 mr-1" /> {t("finance:bankImports.manage")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("finance:bankImports.title")}</DialogTitle>
          </DialogHeader>

          {!isAdmin && (
            <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="size-4 mt-0.5" />
              <div>{t("finance:bankImports.adminOnly")}</div>
            </div>
          )}

          {importsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
          ) : (importsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("finance:bankImports.empty")}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance:bankImports.col.file")}</TableHead>
                    <TableHead>{t("finance:bankImports.col.imported")}</TableHead>
                    <TableHead>{t("finance:bankImports.col.period")}</TableHead>
                    <TableHead className="text-right">{t("finance:bankImports.col.rows")}</TableHead>
                    <TableHead>{t("finance:bankImports.col.status")}</TableHead>
                    <TableHead className="text-right">{t("common:actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(importsQ.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs max-w-[280px] truncate" title={row.file_name}>
                        {row.file_name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(row.imported_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.period_start ?? "—"} → {row.period_end ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {row.rows_imported}/{row.rows_total}
                      </TableCell>
                      <TableCell>
                        <ImportStatusBadge status={row.status} />
                        {row.moved_at && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t("finance:bankImports.moved")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && row.status !== "rolled_back" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setMoveTarget(row)}
                            >
                              <ArrowRightLeft className="size-3 mr-1" />
                              {t("finance:bankImports.move")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setUndoTarget(row)}
                            >
                              <RotateCcw className="size-3 mr-1" />
                              {t("finance:bankImports.undo")}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {moveTarget && (
        <MoveImportDialog
          row={moveTarget}
          accounts={accounts.filter((a) => a.id !== moveTarget.bank_account_id)}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            setMoveTarget(null);
            refreshAll();
          }}
        />
      )}

      {undoTarget && (
        <UndoImportDialog
          row={undoTarget}
          onClose={() => setUndoTarget(null)}
          onDone={() => {
            setUndoTarget(null);
            refreshAll();
          }}
        />
      )}
    </>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const map: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    imported: { variant: "default", label: t("finance:bankImports.status.imported") },
    pending: { variant: "outline", label: t("finance:bankImports.status.pending") },
    rolled_back: { variant: "destructive", label: t("finance:bankImports.status.rolled_back") },
    archived: { variant: "secondary", label: t("finance:bankImports.status.archived") },
  };
  const m = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function MoveImportDialog({
  row,
  accounts,
  onClose,
  onMoved,
}: {
  row: ImportRow;
  accounts: Account[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!target) {
      toast.error(t("finance:bankImports.selectTarget"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("bank_import_move_account", {
      _import_id: row.id,
      _new_account_id: target,
    });
    setBusy(false);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("duplicate_file_on_target")) {
        toast.error(t("finance:bankImports.errorDupFile"));
      } else if (msg.includes("duplicate_rows_on_target")) {
        toast.error(t("finance:bankImports.errorDupRows"));
      } else {
        toast.error(msg || "Move failed");
      }
      return;
    }
    toast.success(t("finance:bankImports.moveSuccess"));
    onMoved();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("finance:bankImports.moveTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("finance:bankImports.moveHint", { file: row.file_name })}
          </p>
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:bankImports.targetAccount")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder={t("finance:bankImports.selectTarget")} /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("common:cancel")}</Button>
          <Button onClick={go} disabled={busy || !target}>
            {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            {t("finance:bankImports.confirmMove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UndoImportDialog({
  row,
  onClose,
  onDone,
}: {
  row: ImportRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<{
    total: number;
    classified: number;
    with_payments: number;
  } | null>(null);

  async function attempt(force: boolean) {
    setBusy(true);
    const { data, error } = await supabase.rpc("bank_import_undo", {
      _import_id: row.id,
      _force: force,
      _reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as {
      status: string;
      total?: number;
      classified?: number;
      with_payments?: number;
      reason?: string;
    };
    if (result.status === "requires_confirmation") {
      setConfirmation({
        total: result.total ?? 0,
        classified: result.classified ?? 0,
        with_payments: result.with_payments ?? 0,
      });
      return;
    }
    if (result.status === "archived") {
      toast.success(t("finance:bankImports.archivedDueToPayments"));
    } else {
      toast.success(t("finance:bankImports.undoSuccess"));
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("finance:bankImports.undoTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("finance:bankImports.undoHint", { file: row.file_name })}
          </p>

          {confirmation && (
            <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-xs space-y-1">
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle className="size-3" />
                {t("finance:bankImports.undoWarn")}
              </div>
              <ul className="list-disc list-inside">
                <li>{t("finance:bankImports.undoStat.total", { n: confirmation.total })}</li>
                <li>{t("finance:bankImports.undoStat.classified", { n: confirmation.classified })}</li>
                <li>{t("finance:bankImports.undoStat.payments", { n: confirmation.with_payments })}</li>
              </ul>
              <div className="pt-1">
                {confirmation.with_payments > 0
                  ? t("finance:bankImports.undoWillArchive")
                  : t("finance:bankImports.undoWillDelete")}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">{t("finance:bankImports.reason")}</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("common:cancel")}</Button>
          <Button
            variant="destructive"
            onClick={() => attempt(confirmation !== null)}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            {confirmation
              ? t("finance:bankImports.confirmUndo")
              : t("finance:bankImports.undo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
