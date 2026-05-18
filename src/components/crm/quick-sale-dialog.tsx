import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CompanyPicker } from "@/components/crm/company-picker";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/crm/types";

/**
 * QuickSaleDialog — global quick-create entry point for a CRM Sale / Opportunity.
 * Writes to the existing `crm_opportunities` table. Mirrors the canonical
 * NewOpportunityDialog inside the opportunities route but is safe to invoke
 * from anywhere (top nav). Company is optional; the snapshot contact_* fields
 * cover the "company unknown" case without requiring schema changes.
 */
export function QuickSaleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["crm", "common", "projects"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    company_id: "",
    stage: "lead" as OpportunityStage,
    estimated_fee: "",
    probability: "50",
    expected_start_date: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    notas: "",
  });

  const reset = () =>
    setForm({
      name: "",
      company_id: "",
      stage: "lead",
      estimated_fee: "",
      probability: "50",
      expected_start_date: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      notas: "",
    });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error(t("crm:opportunities.dialog.errorName"));
      const { data, error } = await supabase
        .from("crm_opportunities")
        .insert({
          name: form.name.trim(),
          company_id: form.company_id || null,
          stage: form.stage,
          estimated_fee: form.estimated_fee ? Number(form.estimated_fee) : 0,
          probability: Number(form.probability) || 0,
          expected_start_date: form.expected_start_date || null,
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          notas: form.notas || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("crm:opportunities.dialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      reset();
      onClose();
      navigate({
        to: "/crm/opportunities/$opportunityId",
        params: { opportunityId: data.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("crm:opportunities.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("crm:opportunities.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t("crm:common.name")} *</Label>
            <Input
              placeholder={t("crm:opportunities.dialog.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("crm:common.company")}</Label>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder={t("crm:opportunities.dialog.companyPlaceholder")}
            />
            {!form.company_id && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("projects:quickCreate.sale.unknownCompanyHint")}
              </p>
            )}
          </div>

          {!form.company_id && (
            <>
              <div className="sm:col-span-2">
                <Label>{t("projects:quickCreate.sale.contactName")}</Label>
                <Input
                  placeholder={t("projects:quickCreate.sale.contactNamePlaceholder")}
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("projects:quickCreate.sale.contactEmail")}</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("projects:quickCreate.sale.contactPhone")}</Label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
            </>
          )}

          <div>
            <Label>{t("crm:common.estimatedFee")}</Label>
            <Input
              type="number"
              step="0.01"
              value={form.estimated_fee}
              onChange={(e) => setForm((f) => ({ ...f, estimated_fee: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("crm:common.probability")}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("crm:common.stage")}</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => setForm((f) => ({ ...f, stage: v as OpportunityStage }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {t(`crm:stage.${s.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("crm:common.expectedStart")}</Label>
            <Input
              type="date"
              value={form.expected_start_date}
              onChange={(e) => setForm((f) => ({ ...f, expected_start_date: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("crm:common.notes")}</Label>
            <Textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("crm:common.cancel")}
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim()}
          >
            {t("crm:common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
