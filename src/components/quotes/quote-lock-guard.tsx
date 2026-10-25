import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Quote lock guard — banner + prompt-to-revise dialog.
 *
 * Mounted once per quote workspace (and on the standalone composer route).
 * It listens for any write rejected by the DB lock guards and, instead of a
 * raw error, offers the user the one legitimate way forward: create a new
 * revision (which clears the lock). Once the quote has been converted into a
 * project the lock is terminal — we only point at the project.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from '@/lib/toast';
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
import { Button } from "@/components/ui/button";
import {
  onQuoteLockBlocked,
  useQuoteLock,
  useUnlockQuoteForRevision,
} from "@/lib/quotes/use-quote-lock";

export function QuoteLockGuard({
  quoteId,
  showBanner = true,
}: {
  quoteId: string | undefined;
  showBanner?: boolean;
}) {
  useTranslation();
  const lock = useQuoteLock(quoteId);
  const unlock = useUnlockQuoteForRevision(quoteId);
  const [open, setOpen] = useState(false);

  useEffect(() => onQuoteLockBlocked(() => setOpen(true)), []);

  if (!quoteId || !lock.data?.isLocked) return null;
  const converted = lock.data.isConverted;
  const projectId = lock.data.projectId;

  return (
    <>
      {showBanner && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              {converted
                ? uiI18n.t("crm:quoteEditor.convertedLocked")
                : uiI18n.t("crm:quoteEditor.sentLocked")}
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
              {converted
                ? uiI18n.t("crm:quoteEditor.convertedLockedHint")
                : uiI18n.t("crm:quoteEditor.sentLockedHint")}
            </p>
            {converted && projectId && (
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                <ExternalLink className="h-3 w-3" />  {uiI18n.t("crm:quotes.openProject")} </Link>
            )}
            {!converted && (
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                   {uiI18n.t("crm:quoteEditor.createRevision")} </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {converted ? uiI18n.t("crm:quoteEditor.convertedProject") : uiI18n.t("crm:quoteEditor.proposalLocked")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {converted
                ? uiI18n.t("crm:quoteEditor.convertedProjectHint")
                : uiI18n.t("crm:quoteEditor.newRevisionPrompt")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel> {uiI18n.t("common:close")} </AlertDialogCancel>
            {!converted && (
              <AlertDialogAction
                disabled={unlock.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  unlock.mutate(undefined, {
                    onSuccess: () => {
                      setOpen(false);
                      toast.success(uiI18n.t("crm:quoteEditor.revisionUnlocked"));
                    },
                    onError: (err: Error) => toast.error(err.message),
                  });
                }}
              >
                 {uiI18n.t("crm:quoteEditor.createRevision")} </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
