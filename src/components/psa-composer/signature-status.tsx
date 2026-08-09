/**
 * Signature status for a proposal — shown next to the send actions.
 * Compact badge with per-signer detail and a link to the signed PDF.
 */
import { toast } from "sonner";
import { FileSignature, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  describeSignature,
  useProposalSignatures,
  type ProposalSignature,
} from "@/lib/psa-proposal/use-proposal-signatures";

async function openSignedPdf(sig: ProposalSignature) {
  if (!sig.signed_pdf_storage_path) return;
  // Blob download instead of a signed URL — storage URLs get blocked by ad-blockers.
  const { data, error } = await supabase.storage
    .from("proposal-pdfs")
    .download(sig.signed_pdf_storage_path);
  if (error || !data) {
    toast.error("Não foi possível obter o PDF assinado.");
    return;
  }
  const url = URL.createObjectURL(data.slice(0, data.size, "application/pdf"));
  const a = document.createElement("a");
  a.href = url;
  a.download = sig.signed_pdf_storage_path.split("/").pop() ?? "proposal-signed.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}


export function ProposalSignatureStatus({ proposalId }: { proposalId: string }) {
  const { data: signatures = [] } = useProposalSignatures(proposalId);
  const latest = signatures[0];
  if (!latest) return null;

  const { tone, label } = describeSignature(latest);
  const variant =
    tone === "success" ? "default" : tone === "warning" ? "destructive" : "secondary";

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className="gap-1 whitespace-nowrap">
            <FileSignature className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div>Cliente: {latest.client_signer_name ?? "—"} ({latest.client_signer_email ?? "—"})</div>
          <div>PSA: {latest.psa_signer_name ?? "—"} ({latest.psa_signer_email ?? "—"})</div>
          {latest.client_signed_at && (
            <div>Cliente assinou: {new Date(latest.client_signed_at).toLocaleString("pt-PT")}</div>
          )}
          {latest.psa_signed_at && (
            <div>PSA assinou: {new Date(latest.psa_signed_at).toLocaleString("pt-PT")}</div>
          )}
        </TooltipContent>
      </Tooltip>
      {latest.signed_pdf_storage_path && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Descarregar PDF assinado"
          onClick={() => void openSignedPdf(latest)}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
