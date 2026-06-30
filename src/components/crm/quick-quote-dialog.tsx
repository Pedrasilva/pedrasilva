import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Briefcase, Clock, Repeat2 } from "lucide-react";
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

  // Three first-class proposal types: standard project, hourly time-based,
  // and pure retainer (simplified workspace, monthly schedule only).
  const categoryCards: { value: QuoteCategory; icon: typeof Briefcase }[] = [
    { value: "project", icon: Briefcase },
    { value: "time_based", icon: Clock },
    { value: "retainer", icon: Repeat2 },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("projects:quickCreate.quote.title")}</DialogTitle>
          <DialogDescription>
            {t("crm:quotes.newQuoteDialog.categoryChooserDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Step 1 — proposal type (first-class architectural choice) */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("crm:quotes.newQuoteDialog.quoteTypeLabel")}
            </Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {categoryCards.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors ${
                    category === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">
                      {t(`crm:quotes.newQuoteDialog.category.${value}.title`)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(`crm:quotes.newQuoteDialog.category.${value}.hint`)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — opportunity */}
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
