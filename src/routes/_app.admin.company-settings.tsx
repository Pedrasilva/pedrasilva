import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { normalizePortugueseNif, isValidPortugueseNif, formatPortugueseNif } from "@/lib/finance/nif";

export const Route = createFileRoute("/_app/admin/company-settings")({
  component: CompanySettingsPage,
});

function CompanySettingsPage() {
  const { t } = useTranslation(["hr"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyNif, setCompanyNif] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("pm_invoice_settings")
        .select("id, company_name, company_nif, singleton")
        .order("singleton", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setRowId((data as { id: string }).id);
        setCompanyName((data as { company_name: string | null }).company_name ?? "");
        setCompanyNif((data as { company_nif: string | null }).company_nif ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const normalized = normalizePortugueseNif(companyNif);
  const nifValid = !normalized || isValidPortugueseNif(normalized);

  async function save() {
    if (!rowId) return;
    if (companyNif && !nifValid) {
      toast.error(t("hr:companySettings.errors.invalidNif"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("pm_invoice_settings")
      .update({
        company_name: companyName.trim() || null,
        company_nif: normalized,
      })
      .eq("id", rowId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (normalized) setCompanyNif(normalized);
    toast.success(t("hr:companySettings.saved"));
  }

  return (
    <AdminOnly>
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {t("hr:companySettings.title")}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/hr/beneficios">
              <ArrowLeft className="h-4 w-4" /> {t("hr:companySettings.backToBenefits")}
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hr:companySettings.cardTitle")}</CardTitle>
            <CardDescription>{t("hr:companySettings.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("hr:companySettings.loading")}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>{t("hr:companySettings.companyName")}</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Pedra Silva Atelier"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("hr:companySettings.companyNif")}</Label>
                  <Input
                    value={companyNif}
                    onChange={(e) => setCompanyNif(e.target.value)}
                    placeholder="9 dígitos"
                    inputMode="numeric"
                  />
                  {companyNif && !nifValid && (
                    <div className="flex items-center gap-1 text-[12px] text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {t("hr:companySettings.errors.invalidNif")}
                    </div>
                  )}
                  {normalized && nifValid && (
                    <div className="flex items-center gap-1 text-[12px] text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("hr:companySettings.nifValid", { value: formatPortugueseNif(normalized) })}
                    </div>
                  )}
                  <p className="text-[12px] text-muted-foreground">
                    {t("hr:companySettings.nifHelper")}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving ? t("hr:companySettings.saving") : t("hr:companySettings.save")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminOnly>
  );
}
