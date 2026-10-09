import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PSA_ENTITY_ID = "00000000-0000-4000-a000-000000000001";

/** HR settings: each benefit category → exactly one PSA Pessoal category. */
export function BenefitPessoalMapping() {
  const { t, i18n } = useTranslation(["hr"]);
  const isPt = i18n.language.startsWith("pt");
  const qc = useQueryClient();
  const catsQ = useQuery({
    queryKey: ["benefit-categories", "mapping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefit_categories")
        .select("id, label_pt, label_en, classification_id, active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pesQ = useQuery({
    queryKey: ["finance", "pessoal-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select("id, code, name_pt, name_en")
        .eq("entity_id", PSA_ENTITY_ID)
        .eq("level", "category")
        .eq("active", true)
        .like("code", "PES.%")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function save(id: string, classification_id: string) {
    const { error } = await supabase.from("benefit_categories").update({ classification_id }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("hr:beneficios.pessoalMap.saved"));
    qc.invalidateQueries({ queryKey: ["benefit-categories"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hr:beneficios.pessoalMap.title")}</CardTitle>
        <CardDescription>{t("hr:beneficios.pessoalMap.sub")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3 text-xs font-medium text-muted-foreground">
          <span>{t("hr:beneficios.pessoalMap.col")}</span>
          <span>{t("hr:beneficios.pessoalMap.pick")}</span>
        </div>
        {(catsQ.data ?? []).map((c) => (
          <div key={c.id} className="grid grid-cols-2 items-center gap-3 text-sm">
            <span className={c.active ? "" : "text-muted-foreground"}>{isPt ? c.label_pt : c.label_en}</span>
            <Select value={c.classification_id ?? ""} onValueChange={(v) => save(c.id, v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder={t("hr:beneficios.pessoalMap.pick")} /></SelectTrigger>
              <SelectContent>
                {(pesQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{isPt ? p.name_pt : p.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
