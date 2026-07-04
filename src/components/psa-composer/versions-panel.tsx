/**
 * Versions panel — dropdown listing every "sent" revision of a proposal
 * with download links to the frozen PDF. The current editable working copy
 * is shown at the top for reference.
 */
import { toast } from "sonner";
import { Download, History, Lock, Pencil } from "lucide-react";
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
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide">
          Revisões
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
        {revisions.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onSelect={(e) => {
              e.preventDefault();
              void downloadRevision(r);
            }}
            className="flex items-center gap-2"
          >
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                Rev {String(r.rev_number).padStart(2, "0")} — enviada
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatDate(r.created_at)} · {r.pdf_filename ?? "sem ficheiro"}
              </div>
            </div>
            <Download className="h-3.5 w-3.5" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
