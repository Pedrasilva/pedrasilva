/**
 * Spending policy for one record: document override → supplier default (current
 * entity) → category default. Shows where the effective policy comes from and
 * lets finance set the override and the supplier's default for this entity.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Policy = "mandatory" | "discretionary" | "pass_through";
const POLICIES: Policy[] = ["mandatory", "discretionary", "pass_through"];
const AUTO = "__auto__";

export function PolicyControl({
  table, recordId, classificationId, supplierId, disabled, compact,
}: {
  table: "financial_documents" | "bank_transaction_classifications";
  recordId: string;
  classificationId: string | null | undefined;
  supplierId: string | null | undefined;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation("finance");
  const qc = useQueryClient();
  const key = ["finance", "policy", table, recordId, classificationId ?? null, supplierId ?? null];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const sb = supabase as never as { from: (t: string) => any; rpc: (f: string, a: unknown) => any };
      const rec = await sb.from(table).select("spending_policy_override").eq("id", recordId).maybeSingle();
      const cat = classificationId
        ? await supabase.from("financial_classifications").select("spending_policy").eq("id", classificationId).maybeSingle()
        : { data: null };
      const sup = supplierId ? await sb.rpc("fin_supplier_policy", { _company: supplierId }) : { data: null };
      return {
        override: (rec.data?.spending_policy_override ?? null) as Policy | null,
        supplier: (sup.data ?? null) as Policy | null,
        category: ((cat.data as { spending_policy?: Policy } | null)?.spending_policy ?? null) as Policy | null,
      };
    },
  });
  const d = q.data;
  const effective = d?.override ?? d?.supplier ?? d?.category ?? null;
  const source = d?.override ? "document" : d?.supplier ? "supplier" : d?.category ? "category" : null;

  async function setOverride(v: string) {
    const { error } = await (supabase as never as { from: (t: string) => any })
      .from(table).update({ spending_policy_override: v === AUTO ? null : v }).eq("id", recordId);
    if (error) return toast.error(error.message);
    toast.success(t("policyControl.saved"));
    qc.invalidateQueries({ queryKey: ["finance", "policy"] });
  }
  async function setSupplier(v: string) {
    if (!supplierId) return;
    const { error } = await (supabase as never as { rpc: (f: string, a: unknown) => any })
      .rpc("fin_set_supplier_policy", { _company: supplierId, _policy: v === AUTO ? null : v });
    if (error) return toast.error(error.message);
    toast.success(t("policyControl.saved"));
    qc.invalidateQueries({ queryKey: ["finance", "policy"] });
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2 text-xs" : "space-y-2 text-sm"}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("policyControl.label")}:</span>
        {effective ? (
          <Badge variant="secondary">{t(`policies.${effective}`)}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {source && <span className="text-xs text-muted-foreground">{t(`policyControl.from.${source}`)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={d?.override ?? AUTO} onValueChange={setOverride} disabled={disabled || !d}>
          <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>{t("policyControl.followDefault")}</SelectItem>
            {POLICIES.map((p) => (
              <SelectItem key={p} value={p}>{t("policyControl.onlyThis", { policy: t(`policies.${p}`) })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {supplierId && (
          <Select value={d?.supplier ?? AUTO} onValueChange={setSupplier} disabled={disabled || !d}>
            <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{t("policyControl.supplierNone")}</SelectItem>
              {POLICIES.map((p) => (
                <SelectItem key={p} value={p}>{t("policyControl.supplierDefault", { policy: t(`policies.${p}`) })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
