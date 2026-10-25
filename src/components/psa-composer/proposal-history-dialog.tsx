import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Version history dialog for the PSA Proposal Composer.
 *
 * Lists snapshots (newest first), lets the user create a labelled snapshot,
 * restore any previous version (a pre-restore snapshot is auto-created so
 * the action is reversible), or delete obsolete entries.
 */
import { useState } from "react";
import { History, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from '@/lib/toast';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useCreateSnapshot,
  useDeleteSnapshot,
  useProposalSnapshots,
  useRestoreSnapshot,
} from "@/lib/psa-proposal/use-proposal-history";

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} d`;
  return d.toLocaleString(uiI18n.language);
}

export function ProposalHistoryDialog({
  proposalId,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  proposalId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  useTranslation();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [label, setLabel] = useState("");
  const list = useProposalSnapshots(open ? proposalId : undefined);
  const create = useCreateSnapshot(proposalId);
  const restore = useRestoreSnapshot(proposalId);
  const del = useDeleteSnapshot(proposalId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title={uiI18n.t("crm:quoteEditor.autosaveRecoveryHint")}
          >
            <History className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.autosaves")} </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle> {uiI18n.t("crm:quoteEditor.autosaveRecovery")} </DialogTitle>
          <DialogDescription>
             {uiI18n.t("crm:quoteEditor.autosaveRecoveryHelp")} <strong> {uiI18n.t("crm:quoteEditor.notRevisionHistory")} </strong>  {uiI18n.t("crm:quoteEditor.restoreHelpSuffix")} </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-zinc-500"> {uiI18n.t("crm:quoteEditor.versionNameOptional")} </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={uiI18n.t("crm:quoteEditor.versionNameHint")}
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              create.mutate(
                { label: label.trim() || undefined, reason: "manual" },
                {
                  onSuccess: () => {
                    toast.success(uiI18n.t("crm:quoteEditor.versionSaved"));
                    setLabel("");
                  },
                  onError: (e) =>
                    toast.error(uiI18n.t("crm:quoteEditor.versionSaveFailed"), {
                      description: String((e as Error).message ?? e),
                    }),
                },
              )
            }
            disabled={create.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.saveVersion")} </Button>
        </div>

        <ScrollArea className="h-[420px] rounded-md border">
          <ul className="divide-y">
            {(list.data ?? []).map((snap) => {
              const blockCount = Array.isArray(snap.snapshot?.blocks)
                ? snap.snapshot.blocks.length
                : 0;
              return (
                <li key={snap.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {snap.label ?? (
                        <span className="text-zinc-500">
                          {snap.reason === "pre-restore"
                            ? uiI18n.t("crm:quoteEditor.beforeRestore")
                            : snap.reason === "auto"
                              ? uiI18n.t("common:automatic")
                              : uiI18n.t("crm:quoteEditor.version")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {relTime(snap.created_at)} · {blockCount}  {uiI18n.t("crm:quoteEditor.blocks")} </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        !confirm(
                          uiI18n.t("crm:quoteEditor.restoreVersionPrompt"),
                        )
                      )
                        return;
                      restore.mutate(snap, {
                        onSuccess: () => toast.success(uiI18n.t("crm:quoteEditor.versionRestored")),
                        onError: (e) =>
                          toast.error(uiI18n.t("crm:quoteEditor.restoreFailed"), {
                            description: String((e as Error).message ?? e),
                          }),
                      });
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("common:restore")} </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!confirm(uiI18n.t("crm:quoteEditor.deleteVersionPrompt"))) return;
                      del.mutate(snap.id);
                    }}
                    title={uiI18n.t("crm:quoteEditor.deleteVersion")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
            {!list.isLoading && !(list.data?.length) && (
              <li className="px-3 py-6 text-center text-xs text-zinc-500">
                 {uiI18n.t("crm:quoteEditor.noVersions")} </li>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
