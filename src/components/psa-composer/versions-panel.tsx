/**
 * Revision history — the primary surface for sent revisions.
 *
 * Each sent revision can be viewed as a frozen, read-only document (exactly
 * what was sent) or downloaded as the archived PDF. Nothing here writes to
 * the live quote.
 */
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
    toast.error("Esta revisão não tem PDF anexado.");
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

export function VersionsPanel({ proposal }: { proposal: PsaProposal }) {
  const { data: revisions = [], nextRev } = useNextRevNumber(proposal.id);
  useProposalRevisions(proposal.id); // ensure prefetched
  const isLocked = !!proposal.locked_at;
  const workingLabel = isLocked
    ? `Rev ${String(nextRev - 1).padStart(2, "0")} · bloqueada`
    : `Rev ${String(nextRev).padStart(2, "0")} · edição`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" title="Histórico de revisões">
          <History className="mr-1 h-3.5 w-3.5" /> {workingLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide">
          Histórico de revisões
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isLocked && (
          <DropdownMenuItem disabled className="flex items-center gap-2 opacity-100">
            <Pencil className="h-3.5 w-3.5 text-blue-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                Rev {String(nextRev).padStart(2, "0")} — cópia editável
              </div>
              <div className="text-[11px] text-muted-foreground">
                Em edição neste momento
              </div>
            </div>
          </DropdownMenuItem>
        )}
        {revisions.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Ainda não foi enviada nenhuma revisão.
          </div>
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
                Rev {String(r.rev_number).padStart(2, "0")} — enviada
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {formatDate(r.created_at)} · {r.pdf_filename ?? "sem ficheiro"}
              </div>
              {basedOn && (
                <div className="text-[11px] text-indigo-600">
                  baseada na Rev {String(basedOn.rev_number).padStart(2, "0")}
                </div>
              )}
              {!revisionIsViewable(r) && (
                <div className="text-[11px] text-amber-700">
                  Sem dados arquivados — só PDF
                </div>
              )}
            </div>
            {revisionIsViewable(r) ? (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                title="Ver revisão (só leitura)"
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
              title="Descarregar PDF"
              onClick={() => void downloadRevision(r)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
