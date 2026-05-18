import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  defaultQuoteTypeForCategory,
  type QuoteCategory,
} from "@/lib/crm/types";

type OppOption = {
  id: string;
  name: string;
  company_id: string | null;
  estimated_fee: number | null;
  company: { id: string; nome: string } | null;
};

/**
 * QuickQuoteDialog — global quick-create entry point for a Quote.
 *
 * A Quote requires an opportunity. The user picks an existing opportunity
 * (only those with a linked company can produce a quote, mirroring the
 * inline `NewQuoteDialog` constraint) and a category. A `fee_proposals` row
 * is inserted with safe defaults and the user is navigated into the
 * existing quote workspace — no quote-builder logic is touched.
 */
export function QuickQuoteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["crm", "projects"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [opportunityId, setOpportunityId] = useState<string>("");
  const [category, setCategory] = useState<QuoteCategory>("project");

  const { data: opps = [], isLoading } = useQuery({
    queryKey: ["crm_opportunities_for_quick_quote"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_opportunities")
        .select("id, name, company_id, estimated_fee, company:companies(id, nome)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OppOption[];
    },
    enabled: open,
  });

  const eligible = opps.filter((o) => !!o.company_id);
  const selected = eligible.find((o) => o.id === opportunityId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      if (!selected || !selected.company_id) {
        throw new Error(t("projects:quickCreate.quote.errorOpportunity"));
      }
      const quote_type = defaultQuoteTypeForCategory(category);
      const fee_structure_type = category === "project" ? "fixed" : "monthly";
      const { data, error } = await supabase
        .from("fee_proposals")
        .insert({
          titulo: selected.name,
          opportunity_id: selected.id,
          company_id: selected.company_id,
          valor: Number(selected.estimated_fee) || 0,
          fee_structure_type,
          quote_category: category,
          quote_type,
          quote_status: "draft",
          pipeline_status: "lead",
          data_proposta: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("crm:quotes.newQuoteDialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp", selected?.id] });
      setOpportunityId("");
      setCategory("project");
      onClose();
      navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("projects:quickCreate.quote.title")}</DialogTitle>
          <DialogDescription>
            {t("projects:quickCreate.quote.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("projects:quickCreate.quote.opportunityLabel")} *</Label>
            <Select
              value={opportunityId}
              onValueChange={setOpportunityId}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("projects:quickCreate.quote.opportunityPlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.company ? ` — ${o.company.nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && eligible.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("projects:quickCreate.quote.noEligibleHint")}
              </p>
            )}
          </div>

          <div>
            <Label>{t("crm:quotes.newQuoteDialog.title")}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as QuoteCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="project">
                  {t("crm:quotes.newQuoteDialog.category.project.title")}
                </SelectItem>
                <SelectItem value="time_based">
                  {t("crm:quotes.newQuoteDialog.category.time_based.title")}
                </SelectItem>
                <SelectItem value="retainer">
                  {t("crm:quotes.newQuoteDialog.category.retainer.title")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            {t("crm:common.cancel")}
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!selected || create.isPending}
          >
            {t("crm:quotes.newQuoteDialog.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
