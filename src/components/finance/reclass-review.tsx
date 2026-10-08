import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClassificationPicker } from "@/components/finance/classification-picker";

type Row = {
  record_table: string; record_id: string; record_date: string | null; amount: number | null;
  counterparty: string | null; description: string | null; old_code: string | null;
  suggested_id: string | null; suggested_name: string | null; suggested_group: string | null;
};

export function ReclassReview() {
  const { t, i18n } = useTranslation("finance");
  const isPt = i18n.language.startsWith("pt");
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const listQ = useQuery({
    queryKey: ["fin-reclass-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fin_reclass_list" as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const optsQ = useQuery({
    queryKey: ["fin-reclass-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications").select("id, code, name_pt, name_en").eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const accept = useMutation({
    mutationFn: async (v: { table: string; id: string; cls: string }) => {
      const { error } = await supabase.rpc("fin_accept_reclass" as never, {
        _table: v.table, _record: v.id, _classification: v.cls,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("reclass.done")); qc.invalidateQueries({ queryKey: ["fin-reclass-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = listQ.data ?? [];
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("reclass.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reclass.sub", { count: rows.length })}</p>
      </div>
      {rows.length === 0 && !listQ.isLoading && <Card className="p-6 text-sm text-muted-foreground">{t("reclass.empty")}</Card>}
      {rows.map((r) => {
        const cur = picked[r.record_id] ?? r.suggested_id;
        return (
          <Card key={r.record_id} className="grid gap-3 p-4 md:grid-cols-[1fr_320px_auto] md:items-center">
            <div className="min-w-0 text-sm">
              <div className="font-medium truncate">{r.counterparty || "—"} · {Number(r.amount ?? 0).toFixed(2)} €</div>
              <div className="text-xs text-muted-foreground truncate">
                {r.record_date} · {r.record_table === "financial_documents" ? t("reclass.doc") : t("reclass.bank")} · {r.old_code} · {r.description}
              </div>
              {r.suggested_name && (
                <div className="text-xs text-muted-foreground">{t("reclass.suggested")}: {r.suggested_group} › {r.suggested_name}</div>
              )}
            </div>
            <ClassificationPicker value={cur} isPt={isPt} options={optsQ.data ?? []}
              onChange={(id) => setPicked((p) => ({ ...p, [r.record_id]: id }))} />
            <Button size="sm" disabled={!cur || accept.isPending}
              onClick={() => cur && accept.mutate({ table: r.record_table, id: r.record_id, cls: cur })}>
              {t("reclass.accept")}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
