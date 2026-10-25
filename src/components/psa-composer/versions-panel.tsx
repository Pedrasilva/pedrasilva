import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Revision history — the primary surface for sent revisions.
 *
 * Each sent revision can be viewed as a frozen, read-only document (exactly
 * what was sent) or downloaded as the archived PDF. Nothing here writes to
 * the live quote.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, History, Lock, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useNextRevNumber,
  useProposalRevisions,
  getRevisionPdfUrl,
  revisionIsViewable,
  type ProposalRevision,
} from "@/lib/psa-proposal/use-proposal-revisions";
import type { PsaProposal } from "@/lib/psa-proposal/types";
import {
  describeSignature,
  useProposalSignatures,
} from "@/lib/psa-proposal/use-proposal-signatures";


function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

async function downloadRevision(rev: ProposalRevision) {
  if (!rev.pdf_storage_path) {
    toast.error(uiI18n.t("crm:quoteEditor.noRevisionPdf"));
    return;
  }
  try {
    const url = await getRevisionPdfUrl(rev.pdf_storage_path);
    const a = document.createElement("a");
    a.href = url;
    a.download = rev.pdf_filename ?? `rev-${rev.rev_number}.pdf`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro a obter PDF";
    toast.error(msg);
  }
}

export function VersionsPanel({
  proposal,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: {
  proposal: PsaProposal;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  useTranslation();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;
  const { data: revisions = [], nextRev } = useNextRevNumber(proposal.id);
  useProposalRevisions(proposal.id); // ensure prefetched
  const { data: signatures = [] } = useProposalSignatures(proposal.id);
  const isLocked = !!proposal.locked_at;
  const workingLabel = isLocked
    ? `Rev ${String(nextRev - 1).padStart(2, "0")} · bloqueada`
    : `Rev ${String(nextRev).padStart(2, "0")} · edição`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {hideTrigger ? (
          <span className="sr-only" aria-hidden tabIndex={-1} />
        ) : (
          <Button variant="outline" size="sm" title={uiI18n.t("crm:quoteEditor.revisionHistory")}>
            <History className="mr-1 h-3.5 w-3.5" /> {workingLabel}
          </Button>
        )}
      </DropdownMenuTrigger>


      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide">
           {uiI18n.t("crm:quoteEditor.revisionHistory")} </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isLocked && (
          <DropdownMenuItem disabled className="flex items-center gap-2 opacity-100">
            <Pencil className="h-3.5 w-3.5 text-blue-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                 {uiI18n.t("crm:quoteEditor.revisionShort")} {String(nextRev).padStart(2, "0")}  {uiI18n.t("crm:quoteEditor.editableCopySuffix")} </div>
              <div className="text-[11px] text-muted-foreground">
                 {uiI18n.t("crm:quoteEditor.editingNow")} </div>
            </div>
          </DropdownMenuItem>
        )}
        {revisions.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
             {uiI18n.t("crm:quoteEditor.noSentRevisions")} </div>
        )}
        {revisions.map((r) => {
          const basedOn = r.restored_from_snapshot_id
            ? revisions.find((x) => x.id === r.restored_from_snapshot_id)
            : null;
          return (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
          >
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                 {uiI18n.t("crm:quoteEditor.revisionShort")} {String(r.rev_number).padStart(2, "0")}  {uiI18n.t("crm:quoteEditor.sentSuffix")} </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {formatDate(r.created_at)} · {r.pdf_filename ?? "sem ficheiro"}
              </div>
              {basedOn && (
                <div className="text-[11px] text-indigo-600">
                   {uiI18n.t("crm:quoteEditor.basedOnRevision")} {String(basedOn.rev_number).padStart(2, "0")}
                </div>
              )}
              {(() => {
                const sig = signatures.find((s) => s.snapshot_id === r.id);
                if (!sig) return null;
                const { tone, label } = describeSignature(sig);
                return (
                  <div
                    className={
                      tone === "success"
                        ? "text-[11px] text-emerald-700"
                        : tone === "warning"
                          ? "text-[11px] text-rose-700"
                          : "text-[11px] text-sky-700"
                    }
                  >
                    ✎ {label}
                  </div>
                );
              })()}
              {!revisionIsViewable(r) && (
                <div className="text-[11px] text-amber-700">
                   {uiI18n.t("crm:quoteEditor.noArchivedData")} </div>
              )}
            </div>
            {revisionIsViewable(r) ? (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                title={uiI18n.t("crm:quoteEditor.viewReadonlyRevision")}
              >
                <Link
                  to="/proposals/$proposalId/revisions/$revisionId"
                  params={{ proposalId: proposal.id, revisionId: r.id }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <span className="h-7 w-7 shrink-0" />
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title={uiI18n.t("crm:quoteEditor.downloadPdf")}
              onClick={() => void downloadRevision(r)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
          );
        })}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
