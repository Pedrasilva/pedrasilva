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
  const { data, error } = await supabase.storage
    .from("proposal-pdfs")
    .createSignedUrl(sig.signed_pdf_storage_path, 300);
  if (error || !data) {
    toast.error("Não foi possível obter o PDF assinado.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
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
