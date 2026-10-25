import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from '@/lib/toast';
import { RotateCcw } from "lucide-react";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import { RevisionProvider } from "@/lib/psa-proposal/revision-context";
import {
  useRestoreRevision,
  useRevision,
} from "@/lib/psa-proposal/use-proposal-revisions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { V2PermissionGate } from "@/components/PermissionGate";
export const Route = createFileRoute(
  "/_app/proposals/$proposalId/revisions/$revisionId",
)({
  head: () => ({ meta: [{ title: "Proposal revision | PSA Hub" }, { name: "description", content: "Read an archived proposal revision in PSA Hub." }, { property: "og:title", content: "Proposal revision | PSA Hub" }, { property: "og:description", content: "Read an archived proposal revision in PSA Hub." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: GuardedRevisionViewerPage,
});

/**
 * Read-only view of a sent revision. Everything renders from the frozen
 * snapshot captured when the revision was sent — no live quote data is read.
 *
 * The one write available here is an explicit "Restore as new draft", which
 * copies this snapshot back over the single live editable draft.
 */
function RevisionViewerPage() {
  useTranslation();
  const { proposalId, revisionId } = Route.useParams();
  const revision = useRevision(revisionId);
  const restore = useRestoreRevision(proposalId);
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (revision.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
         {uiI18n.t("crm:quoteEditor.loadingRevision")} </div>
    );
  }

  if (revision.isError || !revision.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        <span> {uiI18n.t("crm:quoteEditor.revisionLoadFailed")} </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/proposals/$proposalId/composer" params={{ proposalId }}>
             {uiI18n.t("crm:quoteEditor.backCurrentVersion")} </Link>
        </Button>
      </div>
    );
  }

  const revLabel = String(revision.data.revNumber).padStart(2, "0");

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(revisionId);
      setConfirmOpen(false);
      toast.success(uiI18n.t("crm:quoteEditor.draftRestored", { value1: revLabel }));
      navigate({
        to: "/proposals/$proposalId/composer",
        params: { proposalId },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <RevisionProvider revision={revision.data}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span>
           {uiI18n.t("crm:quoteEditor.viewingPrefix")} <strong> {uiI18n.t("crm:quoteEditor.revisionShort")} {revLabel}</strong>  {uiI18n.t("crm:quoteEditor.frozenReadonlySuffix")} </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={restore.isPending}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
           {uiI18n.t("crm:quoteEditor.restoreAsDraft")} </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
               {uiI18n.t("crm:quoteEditor.restoreRevisionPrefix")} {revLabel}  {uiI18n.t("crm:quoteEditor.editableDraftPromptSuffix")} </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                   {uiI18n.t("crm:quoteEditor.restoreDraftHint")} </p>
                <p className="font-medium text-destructive">
                   {uiI18n.t("crm:quoteEditor.restoreDraftWarning")} </p>
                <p>
                   {uiI18n.t("crm:quoteEditor.sentRevisionsSafeHint")} </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>
               {uiI18n.t("common:cancel")} </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRestore();
              }}
              disabled={restore.isPending}
            >
              {restore.isPending ? uiI18n.t("crm:quoteEditor.restoring") : uiI18n.t("crm:quoteEditor.restoreDraft")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComposerShell proposalId={proposalId} />
    </RevisionProvider>
  );
}

function GuardedRevisionViewerPage() {
  useTranslation();
  return (
    <V2PermissionGate permission="crm.pipeline.view" scope="own">
      <RevisionViewerPage />
    </V2PermissionGate>
  );
}
