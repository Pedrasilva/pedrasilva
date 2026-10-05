/** Finance → Inbox → Regras: known other entities (documents addressed to them never become PSA records). */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Action = "archive" | "ignore" | "forward";
const KEY = ["finance", "other-entities"];
const nifKey = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^pt/, "");

export function OtherEntitiesPanel() {
  const { t } = useTranslation(["finance"]);
  const k = (s: string, o?: Record<string, unknown>) => t(`finance:intakeInbox.otherEntities.${s}`, o);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [action, setAction] = useState<Action>("archive");
  const [email, setEmail] = useState("");

  const listQ = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_other_entities").select("id, name, nif, action, forward_email").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("finance_other_entities").insert({
        name: name.trim(), nif: nifKey(nif), action, forward_email: action === "forward" ? email.trim().toLowerCase() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setName(""); setNif(""); setEmail(""); setAction("archive"); toast.success(k("saved")); invalidate(); },
    onError: err,
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; action: Action; forward_email: string | null }) => {
      const { error } = await supabase.from("finance_other_entities")
        .update({ action: v.action, forward_email: v.forward_email, updated_at: new Date().toISOString() }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(k("saved")); invalidate(); },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_other_entities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: err,
  });

  const valid = name.trim() && nifKey(nif).length >= 6 && (action !== "forward" || email.includes("@"));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{k("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{k("hint")}</p>
        <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr_1.2fr_auto] items-end">
          <div><Label className="text-xs">{k("name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-xs">{k("nif")}</Label><Input value={nif} onChange={(e) => setNif(e.target.value)} /></div>
          <div>
            <Label className="text-xs">{k("action")}</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["archive", "ignore", "forward"] as const).map((a) => <SelectItem key={a} value={a}>{k(`actions.${a}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{k("email")}</Label><Input type="email" disabled={action !== "forward"} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Button onClick={() => add.mutate()} disabled={!valid || add.isPending}>{k("add")}</Button>
        </div>
        <div className="space-y-1.5">
          {listQ.isLoading && <Skeleton className="h-10 w-full" />}
          {!listQ.isLoading && (listQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{k("none")}</p>}
          {(listQ.data ?? []).map((r) => (
            <EntityRow key={r.id} r={r as { id: string; name: string; nif: string; action: Action; forward_email: string | null }}
              onSave={(a, e) => update.mutate({ id: r.id, action: a, forward_email: a === "forward" ? e : null })}
              onRemove={() => remove.mutate(r.id)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EntityRow({ r, onSave, onRemove }: {
  r: { id: string; name: string; nif: string; action: Action; forward_email: string | null };
  onSave: (a: Action, email: string | null) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation(["finance"]);
  const k = (s: string) => t(`finance:intakeInbox.otherEntities.${s}`);
  const [email, setEmail] = useState(r.forward_email ?? "");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <span className="min-w-0 truncate"><span className="font-medium">{r.name}</span> <span className="tabular-nums text-muted-foreground">({r.nif})</span></span>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={r.action} onValueChange={(v) => (v === "forward" && !email.includes("@") ? toast.error(k("emailNeeded")) : onSave(v as Action, email.trim().toLowerCase() || null))}>
          <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["archive", "ignore", "forward"] as const).map((a) => <SelectItem key={a} value={a}>{k(`actions.${a}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-8 w-[200px]" type="email" placeholder={k("email")} value={email} onChange={(e) => setEmail(e.target.value)}
          onBlur={() => { if (r.action === "forward" && email.includes("@") && email !== r.forward_email) onSave("forward", email.trim().toLowerCase()); }} />
        <Button size="icon" variant="ghost" aria-label={k("remove")} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
