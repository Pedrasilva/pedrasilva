/**
 * Finance → Inbox → Instruções: free-text rules for the document reader,
 * global or scoped to a supplier NIF or a sender address/domain.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Scope = "global" | "supplier_nif" | "sender" | "recipient_nif" | "document";
type Row = {
  id: string; text: string; scope_type: Scope; scope_value: string | null;
  active: boolean; created_at: string;
};

const KEY = ["finance", "intake-instructions"];

function normScope(scope: Scope, v: string) {
  const s = v.trim().toLowerCase();
  if (scope === "supplier_nif" || scope === "recipient_nif") return s.replace(/[^a-z0-9]/g, "").replace(/^pt/, "");
  return s.replace(/^@/, "");
}

export function IntakeInstructionsPanel({ highlightId }: { highlightId?: string | null }) {
  const { t, i18n } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_intake_instructions")
        .select("id, text, scope_type, scope_value, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("global");
  const [value, setValue] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("finance_intake_instructions").insert({
        text: text.trim(),
        scope_type: scope,
        scope_value: scope === "global" ? null : normScope(scope, value),
      });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); setValue(""); toast.success(t("finance:intakeInbox.instructions.saved")); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{t("finance:intakeInbox.instructions.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("finance:intakeInbox.instructions.hint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">{t("finance:intakeInbox.instructions.text")}</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000}
              placeholder={t("finance:intakeInbox.learn.explainPlaceholder")} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[220px_1fr_auto] items-end">
            <div>
              <Label className="text-xs">{t("finance:intakeInbox.instructions.scope")}</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["global", "supplier_nif", "recipient_nif", "sender"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{t(`finance:intakeInbox.instructions.scopes.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("finance:intakeInbox.instructions.scopeValue")}</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} disabled={scope === "global"} />
            </div>
            <Button size="sm" disabled={!text.trim() || (scope !== "global" && !normScope(scope, value)) || add.isPending}
              onClick={() => add.mutate()}>
              {t("finance:intakeInbox.instructions.add")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          {q.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          {!q.isLoading && (q.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.instructions.empty")}</p>
          )}
          {(q.data ?? []).map((r) => (
            <InstructionRow key={r.id} row={r} highlight={r.id === highlightId} locale={i18n.language} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function InstructionRow({ row, highlight, locale }: { row: Row; highlight: boolean; locale: string }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(highlight);
  const [text, setText] = useState(row.text);
  const [value, setValue] = useState(row.scope_value ?? "");
  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ block: "center" }); }, [highlight]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Row>) => {
      const { error } = await supabase
        .from("finance_intake_instructions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("finance_intake_instructions").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("finance:intakeInbox.instructions.deleted")); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div ref={ref} className={`rounded-md border p-3 space-y-2 ${highlight ? "border-primary" : ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{t(`finance:intakeInbox.instructions.scopes.${row.scope_type}`)}</Badge>
          {row.scope_value && <span className="text-xs tabular-nums">{row.scope_value}</span>}
          <span className="text-[11px] text-muted-foreground">
            {t("finance:intakeInbox.instructions.createdBy", { date: new Date(row.created_at).toLocaleDateString(locale) })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={row.active} onCheckedChange={(v) => save.mutate({ active: v })} aria-label={t("finance:intakeInbox.instructions.active")} />
          <span className="text-xs text-muted-foreground">
            {row.active ? t("finance:intakeInbox.instructions.active") : t("finance:intakeInbox.instructions.inactive")}
          </span>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("finance:intakeInbox.instructions.edit")}</Button>
          )}
          <Button size="icon" variant="ghost" aria-label={t("finance:intakeInbox.instructions.delete")}
            onClick={() => { if (confirm(t("finance:intakeInbox.instructions.deleteConfirm"))) del.mutate(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} />
          {row.scope_type !== "global" && <Input value={value} onChange={(e) => setValue(e.target.value)} />}
          <div className="flex gap-2">
            <Button size="sm" disabled={!text.trim() || save.isPending}
              onClick={() => save.mutate({ text: text.trim(), ...(row.scope_type !== "global" ? { scope_value: normScope(row.scope_type, value) } : {}) })}>
              {t("finance:intakeInbox.instructions.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(row.text); setValue(row.scope_value ?? ""); }}>
              {t("finance:intakeInbox.instructions.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{row.text}</p>
      )}
    </div>
  );
}
