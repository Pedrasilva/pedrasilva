/**
 * Documents on the opportunity — every revision that was actually sent, plus
 * whatever came back signed. The data already exists (psa_proposal_snapshots
 * for sent PDFs, psa_proposal_signatures for the countersigned copy); this is
 * the surface that makes it visible where the deal lives.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, FileSignature, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PDF_BUCKET = "proposal-pdfs";

type SignatureRow = {
  id: string;
  proposal_id: string;
  snapshot_id: string | null;
  status: string;
  client_signer_name: string | null;
  client_signer_email: string | null;
  client_signed_at: string | null;
  psa_signer_name: string | null;
  psa_signer_email: string | null;
  psa_signed_at: string | null;
  signed_pdf_storage_path: string | null;
};

type DocumentRow = {
  snapshotId: string;
  proposalId: string;
  quoteId: string;
  quoteTitle: string;
  revNumber: number;
  createdAt: string;
  pdfPath: string | null;
  pdfFilename: string | null;
  outcome: string | null;
  signature: SignatureRow | null;
};

async function openStoredPdf(path: string, filename?: string | null) {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    toast.error(error?.message ?? "PDF");
    return;
  }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = filename ?? path.split("/").pop() ?? "proposal.pdf";
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function useOpportunityDocuments(opportunityId: string) {
  return useQuery({
    queryKey: ["crm-opportunity-documents", opportunityId],
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data: quotes, error: qErr } = await sb
        .from("fee_proposals")
        .select("id, titulo, archived_at, deleted_at")
        .eq("opportunity_id", opportunityId);
      if (qErr) throw new Error(qErr.message);
      const activeQuotes = ((quotes ?? []) as {
        id: string; titulo: string | null; archived_at: string | null; deleted_at: string | null;
      }[]).filter((q) => !q.archived_at && !q.deleted_at);
      if (activeQuotes.length === 0) return [];

      const { data: proposals, error: pErr } = await sb
        .from("psa_proposals")
        .select("id, quote_id, outcome")
        .in("quote_id", activeQuotes.map((q) => q.id));
      if (pErr) throw new Error(pErr.message);
      const proposalList = (proposals ?? []) as { id: string; quote_id: string; outcome: string | null }[];
      if (proposalList.length === 0) return [];
      const proposalIds = proposalList.map((p) => p.id);

      const [snapRes, sigRes] = await Promise.all([
        sb
          .from("psa_proposal_snapshots")
          .select("id, proposal_id, rev_number, created_at, pdf_storage_path, pdf_filename")
          .in("proposal_id", proposalIds)
          .eq("kind", "sent")
          .order("created_at", { ascending: false }),
        sb
          .from("psa_proposal_signatures")
          .select(
            "id, proposal_id, snapshot_id, status, client_signer_name, client_signer_email, client_signed_at, psa_signer_name, psa_signer_email, psa_signed_at, signed_pdf_storage_path",
          )
          .in("proposal_id", proposalIds)
          .order("created_at", { ascending: false }),
      ]);
      if (snapRes.error) throw new Error(snapRes.error.message);
      if (sigRes.error) throw new Error(sigRes.error.message);

      const signatures = (sigRes.data ?? []) as SignatureRow[];
      const quoteById = new Map(activeQuotes.map((q) => [q.id, q]));
      const proposalById = new Map(proposalList.map((p) => [p.id, p]));

      return ((snapRes.data ?? []) as {
        id: string; proposal_id: string; rev_number: number | null; created_at: string;
        pdf_storage_path: string | null; pdf_filename: string | null;
      }[]).map((s) => {
        const proposal = proposalById.get(s.proposal_id);
        const quote = proposal ? quoteById.get(proposal.quote_id) : undefined;
        const signature =
          signatures.find((sig) => sig.snapshot_id === s.id) ??
          signatures.find((sig) => sig.proposal_id === s.proposal_id && !sig.snapshot_id) ??
          null;
        return {
          snapshotId: s.id,
          proposalId: s.proposal_id,
          quoteId: proposal?.quote_id ?? "",
          quoteTitle: quote?.titulo ?? "",
          revNumber: s.rev_number ?? 0,
          createdAt: s.created_at,
          pdfPath: s.pdf_storage_path,
          pdfFilename: s.pdf_filename,
          outcome: proposal?.outcome ?? null,
          signature,
        };
      });
    },
  });
}

export function OpportunityDocumentsCard({ opportunityId }: { opportunityId: string }) {
  const { t } = useTranslation("crm");
  const { data: docs = [], isLoading } = useOpportunityDocuments(opportunityId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("opportunities.documents.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading ? (
          <div className="py-3 text-xs text-muted-foreground">{t("common.loading")}</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground">
            <FileText className="h-5 w-5 opacity-50" />
            <span>{t("opportunities.documents.empty")}</span>
          </div>
        ) : (
          <ul className="divide-y">
            {docs.map((d) => {
              const sig = d.signature;
              const statusKey = sig
                ? sig.status
                : d.outcome === "won"
                  ? "accepted"
                  : d.outcome === "lost"
                    ? "declined"
                    : "sent";
              return (
                <li key={d.snapshotId} className="space-y-1 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Send className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {d.quoteTitle} · {t("opportunities.documents.revision", {
                            n: String(d.revNumber).padStart(2, "0"),
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString("pt-PT")}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t(`opportunities.documents.status.${statusKey}`, {
                        defaultValue: statusKey,
                      })}
                    </Badge>
                  </div>

                  {sig && (
                    <div className="space-y-0.5 pl-5 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FileSignature className="h-3 w-3" />
                        {t("opportunities.documents.clientSigner")}:{" "}
                        {sig.client_signer_name ?? sig.client_signer_email ?? "—"}
                        {sig.client_signed_at
                          ? ` · ${new Date(sig.client_signed_at).toLocaleDateString("pt-PT")}`
                          : ` · ${t("opportunities.documents.awaiting")}`}
                      </div>
                      <div className="flex items-center gap-1">
                        <FileSignature className="h-3 w-3" />
                        {t("opportunities.documents.psaSigner")}:{" "}
                        {sig.psa_signer_name ?? sig.psa_signer_email ?? "—"}
                        {sig.psa_signed_at
                          ? ` · ${new Date(sig.psa_signed_at).toLocaleDateString("pt-PT")}`
                          : ` · ${t("opportunities.documents.awaiting")}`}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 pl-5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!d.pdfPath}
                      onClick={() => d.pdfPath && void openStoredPdf(d.pdfPath, d.pdfFilename)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      {t("opportunities.documents.downloadSent")}
                    </Button>
                    {sig?.signed_pdf_storage_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => void openStoredPdf(sig.signed_pdf_storage_path!)}
                      >
                        <FileSignature className="mr-1 h-3 w-3" />
                        {t("opportunities.documents.downloadSigned")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
