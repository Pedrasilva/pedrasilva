import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { senderDomain } from "@/lib/finance/sender-rules";
import { currentEntityId } from "@/lib/finance/current-entity";

type Action = "ignore" | "process";
const KEY = ["finance", "sender-rules"];

/** Message id from "intake/email/<id>-file.pdf". */
function messageIdOf(path: string | null) {
  const m = path?.match(/^intake\/email\/([^-/]+)-/);
  return m ? m[1] : null;
}

export function SenderRulesPanel() {
  const { t } = useTranslation(["finance"]);
  const k = (s: string, o?: Record<string, unknown>) => t(`finance:intakeInbox.senderRules.${s}`, o);
  const qc = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [address, setAddress] = useState("");

  const settingsQ = useQuery({
    queryKey: [...KEY, "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_intake_settings").select("finance_address").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (settingsQ.data) setAddress(settingsQ.data.finance_address); }, [settingsQ.data]);

  const rulesQ = useQuery({
    queryKey: [...KEY, "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_sender_rules").select("id, pattern, action").order("pattern");
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggestionsQ = useQuery({
    queryKey: [...KEY, "suggestions"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("financial_document_review_queue").select("source_file_url")
        .eq("intake_route", "ignored").eq("source", "email_ingestion");
      if (error) throw error;
      const ids = [...new Set((rows ?? []).map((r) => messageIdOf(r.source_file_url)).filter(Boolean) as string[])];
      const counts = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error: e2 } = await supabase
          .from("financial_email_processed_messages").select("message_id, from_address").in("message_id", ids.slice(i, i + 100));
        if (e2) throw e2;
        for (const m of data ?? []) {
          const d = senderDomain(m.from_address);
          if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
        }
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    },
  });

  const saveAddress = useMutation({
    mutationFn: async () => {
      const a = address.trim().toLowerCase();
      if (!a.includes("@")) throw new Error(k("invalid"));
      const { error } = await supabase.from("finance_intake_settings").update({ finance_address: a, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(k("saved")); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRule = useMutation({
    mutationFn: async ({ p, action }: { p: string; action: Action }) => {
      const v = p.trim().toLowerCase().replace(/^@/, "");
      if (!v || !v.includes(".")) throw new Error(k("invalid"));
      const { error } = await supabase.from("finance_sender_rules").upsert({ entity_id: await currentEntityId(),  pattern: v, action }, { onConflict: "pattern" });
      if (error) throw error;
    },
    onSuccess: () => { setPattern(""); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_sender_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.error(e.message),
  });

  const ruled = useMemo(() => new Set((rulesQ.data ?? []).map((r) => r.pattern)), [rulesQ.data]);
  const suggestions = (suggestionsQ.data ?? []).filter(([d]) => !ruled.has(d));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">{k("title")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{k("hint")}</p>
          <div className="space-y-1.5">
            <Label>{k("address")}</Label>
            <div className="flex gap-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              <Button onClick={() => saveAddress.mutate()} disabled={saveAddress.isPending}>{k("save")}</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{k("pattern")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input className="flex-1 min-w-[200px]" placeholder={k("patternPh")} value={pattern} onChange={(e) => setPattern(e.target.value)} />
              <Button variant="outline" onClick={() => addRule.mutate({ p: pattern, action: "ignore" })}>{k("ignore")}</Button>
              <Button variant="outline" onClick={() => addRule.mutate({ p: pattern, action: "process" })}>{k("process")}</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {rulesQ.isLoading && <Skeleton className="h-10 w-full" />}
            {!rulesQ.isLoading && (rulesQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{k("none")}</p>}
            {(rulesQ.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="truncate font-medium">{r.pattern}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={r.action === "ignore" ? "destructive" : "secondary"}>{k(r.action)}</Badge>
                  <Button size="icon" variant="ghost" aria-label={k("remove")} onClick={() => removeRule.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{k("suggestions")}</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 max-h-[560px] overflow-auto">
          {suggestionsQ.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          {!suggestionsQ.isLoading && suggestions.length === 0 && <p className="text-sm text-muted-foreground">{k("suggestionsEmpty")}</p>}
          {suggestions.map(([d, n]) => (
            <div key={d} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span className="truncate">{d} <span className="text-muted-foreground">· {k("count", { count: n })}</span></span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => addRule.mutate({ p: d, action: "ignore" })}>{k("ignore")}</Button>
                <Button size="sm" variant="ghost" onClick={() => addRule.mutate({ p: d, action: "process" })}>{k("process")}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
