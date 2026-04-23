import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Rocket, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  formatEUR, QUOTE_STATUSES, FEE_STRUCTURE_TYPES,
  type FeeProposal, type QuoteStatus, type FeeStructureType,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/quotes/$quoteId")({
  component: QuoteDetail,
});

type FullQuote = FeeProposal & {
  opportunity: { id: string; name: string; stage: string; company_id: string } | null;
  account: { id: string; name: string } | null;
  company: { id: string; nome: string } | null;
};

function QuoteDetail() {
  const { t } = useTranslation("crm");
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["fee_proposal", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select(`
          *,
          opportunity:crm_opportunities(id, name, stage, company_id),
          account:crm_accounts(id, name),
          company:companies(id, nome)
        `)
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as FullQuote;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["crm_accounts_by_company", quote?.company_id],
    queryFn: async () => {
      if (!quote?.company_id) return [];
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", quote.company_id)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!quote?.company_id,
  });

  const [form, setForm] = useState({
    titulo: "",
    valor: "",
    fee_structure_type: "fixed" as FeeStructureType,
    account_id: "",
    quote_status: "draft" as QuoteStatus,
    notas: "",
  });

  useEffect(() => {
    if (quote) {
      setForm({
        titulo: quote.titulo,
        valor: String(quote.valor),
        fee_structure_type: quote.fee_structure_type,
        account_id: quote.account_id ?? "",
        quote_status: quote.quote_status,
        notas: quote.notas ?? "",
      });
    }
  }, [quote]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.quote_status === "approved" && !form.account_id) {
        throw new Error(t("quotes.approveAccountRequired"));
      }
      const { error } = await supabase
        .from("fee_proposals")
        .update({
          titulo: form.titulo.trim(),
          valor: form.valor ? Number(form.valor) : 0,
          fee_structure_type: form.fee_structure_type,
          account_id: form.account_id || null,
          quote_status: form.quote_status,
          notas: form.notas || null,
        })
        .eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.savedToast"));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_proposals").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.deletedToast"));
      if (quote?.opportunity_id) {
        navigate({
          to: "/crm/opportunities/$opportunityId",
          params: { opportunityId: quote.opportunity_id },
        });
      } else {
        navigate({ to: "/crm/opportunities" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error(t("quotes.loadError"));
      if (quote.quote_status !== "approved") {
        throw new Error(t("quotes.convertOnlyApproved"));
      }
      if (quote.pm_project_id) {
        return { id: quote.pm_project_id, alreadyExisted: true };
      }

      // Create empty pm_project (no placeholder stages, per spec)
      const { data: project, error: projErr } = await supabase
        .from("pm_projects")
        .insert({
          name: quote.titulo,
          status: "active",
          start_date: new Date().toISOString().slice(0, 10),
          company_id: quote.company_id,
          account_id: quote.account_id,
          quote_id: quote.id,
          opportunity_id: quote.opportunity_id,
          notes: `Created from quote "${quote.titulo}"`,
        })
        .select("id")
        .single();
      if (projErr) throw projErr;

      // Link project back to fee_proposal (legacy compatibility column)
      const { error: linkErr } = await supabase
        .from("fee_proposals")
        .update({ pm_project_id: project.id })
        .eq("id", quote.id);
      if (linkErr) throw linkErr;

      // Move opportunity to "won" if not already
      if (quote.opportunity_id) {
        await supabase
          .from("crm_opportunities")
          .update({ stage: "won" })
          .eq("id", quote.opportunity_id);
      }

      return { id: project.id, alreadyExisted: false };
    },
    onSuccess: (res) => {
      toast.success(res.alreadyExisted ? t("quotes.convertExisting") : t("quotes.convertCreated"));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!quote) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  const status = QUOTE_STATUSES.find((s) => s.value === quote.quote_status);
  const canApprove = !!form.account_id;
  const canConvert = quote.quote_status === "approved";

  return (
    <div className="space-y-6">
      {quote.opportunity ? (
        <Link
          to="/crm/opportunities/$opportunityId"
          params={{ opportunityId: quote.opportunity.id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunity")}
        </Link>
      ) : (
        <Link
          to="/crm/opportunities"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunities")}
        </Link>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{quote.titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {quote.company?.nome ?? "—"}
            {quote.opportunity && (
              <>
                {" · "}
                <Link
                  to="/crm/opportunities/$opportunityId"
                  params={{ opportunityId: quote.opportunity.id }}
                  className="hover:underline"
                >
                  {quote.opportunity.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${status?.color}`} />
            {status ? t(`quoteStatus.${status.value}`) : ""}
          </span>
          {quote.pm_project_id && (
            <Link
              to="/projects/$projectId"
              params={{ projectId: quote.pm_project_id }}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-muted/50"
            >
              <ExternalLink className="h-3 w-3" /> {t("quotes.openProject")}
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(t("quotes.deleteConfirm"))) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("quotes.feeDetails")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("common.title")}</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("common.estimatedFee")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("common.feeStructure")}</Label>
              <Select
                value={form.fee_structure_type}
                onValueChange={(v) => setForm((f) => ({ ...f, fee_structure_type: v as FeeStructureType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEE_STRUCTURE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{t(`feeStructure.${s.value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.account")} {form.quote_status === "approved" && "*"}</Label>
              <Select
                value={form.account_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, account_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder={t("common.noAccount")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.noAccount")}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.status")}</Label>
              <Select
                value={form.quote_status}
                onValueChange={(v) => setForm((f) => ({ ...f, quote_status: v as QuoteStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTE_STATUSES.map((s) => (
                    <SelectItem
                      key={s.value}
                      value={s.value}
                      disabled={s.value === "approved" && !canApprove}
                    >
                      {t(`quoteStatus.${s.value}`)}{s.value === "approved" && !canApprove ? t("quotes.setAccountFirst") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>{t("common.notes")}</Label>
              <Textarea
                rows={3}
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("quotes.convertSection")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("quotes.convertHint")}</p>
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div><span className="text-muted-foreground">{t("quotes.statusValue")}</span>{status ? t(`quoteStatus.${status.value}`) : ""}</div>
              <div><span className="text-muted-foreground">{t("quotes.accountValue")}</span>{quote.account?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">{t("quotes.feeValue")}</span>{formatEUR(Number(quote.valor))}</div>
              {quote.pm_project_id && (
                <div className="text-emerald-600 dark:text-emerald-400 mt-2">
                  {t("quotes.projectAlreadyCreated")}
                </div>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => convert.mutate()}
              disabled={!canConvert || convert.isPending}
            >
              <Rocket className="h-4 w-4 mr-1" />
              {quote.pm_project_id ? t("quotes.openProjectButton") : t("quotes.convertButton")}
            </Button>
            {!canConvert && (
              <p className="text-xs text-muted-foreground">
                {t("quotes.approveFirstHint")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
