/**
 * "Eliminar" with a required reason (optionally saved as a deletion rule for
 * similar future documents) and the "Eliminados" panel with "Restaurar".
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { applyRemovalRule, findRuleMatches, removeQueueItem, restoreRemovedItem } from "@/lib/finance/intake-inbox.functions";

type Row = {
  id: string;
  status: string;
  sender_address: string | null;
  extracted_recipient_name: string | null;
  extracted_recipient_vat: string | null;
  extracted_supplier_name?: string | null;
  extracted_seller_name?: string | null;
  extracted_supplier_vat?: string | null;
  extracted_seller_vat?: string | null;
  removed_at?: string | null;
  removed_reason?: string | null;
  removed_source?: string | null;
  removed_tag?: string | null;
};

const TAGS = ["not_psa", "duplicate", "not_financial", "test", "other"] as const;
type Tag = (typeof TAGS)[number];
type Scope = "none" | "recipient" | "supplier" | "sender" | "sender_domain";
type Match = { id: string; title: string; date: string | null; intake_type: string | null };

export function RemoveButton({ row, onOpenRule }: { row: Row; onOpenRule: (id: string) => void }) {
  const { t } = useTranslation(["finance"]);
  const k = (x: string, o?: Record<string, unknown>) => t(`finance:intakeInbox.removal.${x}`, o);
  const qc = useQueryClient();
  const remove = useServerFn(removeQueueItem);
  const find = useServerFn(findRuleMatches);
  const apply = useServerFn(applyRemovalRule);
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<Scope>("none");
  const [rule, setRule] = useState<{ id: string; text: string } | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);

  const recipient = row.extracted_recipient_name || row.extracted_recipient_vat;
  const supName = row.extracted_supplier_name ?? row.extracted_seller_name ?? null;
  const supVat = row.extracted_supplier_vat ?? row.extracted_seller_vat ?? null;
  const domain = row.sender_address?.split("@")[1] ?? null;
  const scopes: Array<{ v: Scope; label: string; ok: boolean }> = [
    { v: "none", label: k("scope.none"), ok: true },
    { v: "recipient", label: k("scope.recipient", { name: row.extracted_recipient_name ?? "—", nif: row.extracted_recipient_vat ?? "—" }), ok: !!row.extracted_recipient_vat },
    { v: "supplier", label: k("scope.supplier", { name: supName ?? "—", nif: supVat ?? "—" }), ok: !!supVat },
    { v: "sender", label: k("scope.sender", { v: row.sender_address ?? "—" }), ok: !!row.sender_address },
    { v: "sender_domain", label: k("scope.senderDomain", { v: domain ?? "—" }), ok: !!domain },
  ];
  void recipient;

  const reset = () => { setTag(null); setReason(""); setScope("none"); setRule(null); setMatches(null); };
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });

  const removeM = useMutation({
    mutationFn: () => remove({ data: { id: row.id, reason: reason.trim(), tag: tag ?? "other", scope } }),
    onSuccess: async (r) => {
      toast.success(k("removed"));
      refresh();
      if (r.instruction) {
        setRule({ id: r.instruction.id, text: r.instruction.text });
        const m = await find({ data: { instructionId: r.instruction.id, excludeId: row.id } });
        setMatches(m.items as Match[]);
      } else { setOpen(false); reset(); }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const applyM = useMutation({
    mutationFn: () => apply({ data: { instructionId: rule!.id, ids: (matches ?? []).map((m) => m.id) } }),
    onSuccess: (r) => { toast.success(k("applied", { count: r.removed })); refresh(); setOpen(false); reset(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (row.status === "approved" || row.status === "removed") return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 mr-1.5" />{k("button")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{rule ? k("savedTitle") : k("title")}</DialogTitle></DialogHeader>
          {!rule ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((x) => (
                  <Button key={x} size="sm" variant={tag === x ? "default" : "outline"}
                    onClick={() => { setTag(x); if (!reason.trim() || TAGS.some((y) => k(`tag.${y}`) === reason)) setReason(k(`tag.${x}`)); }}>
                    {k(`tag.${x}`)}
                  </Button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{k("reason")}</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{k("future")}</Label>
                <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)}>
                  {scopes.map((s) => (
                    <label key={s.v} className={`flex items-start gap-2 text-sm ${s.ok ? "" : "opacity-50"}`}>
                      <RadioGroupItem value={s.v} disabled={!s.ok} className="mt-0.5" />{s.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>{k("ruleSaved")}: <span className="font-medium">{rule.text}</span></p>
              <Button size="sm" variant="link" className="px-0 h-auto" onClick={() => { setOpen(false); onOpenRule(rule.id); }}>{k("viewRule")}</Button>
              {matches == null ? <Loader2 className="h-4 w-4 animate-spin" /> : matches.length === 0 ? (
                <p className="text-muted-foreground">{k("noSimilar")}</p>
              ) : (
                <>
                  <p>{k("similar", { count: matches.length })}</p>
                  <ul className="max-h-48 overflow-auto text-xs space-y-1">
                    {matches.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate">{m.title}</span>
                        <span className="text-muted-foreground tabular-nums">{m.date ?? "—"} · {t(`finance:intakeInbox.types.${m.intake_type ?? "desconhecido"}`)} → {k("removedState")}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {!rule ? (
              <Button variant="destructive" disabled={!reason.trim() || removeM.isPending} onClick={() => removeM.mutate()}>
                {removeM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{k("confirm")}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>{k("close")}</Button>
                {!!matches?.length && (
                  <Button variant="destructive" disabled={applyM.isPending} onClick={() => applyM.mutate()}>
                    {applyM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{k("applyN", { count: matches.length })}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemovedPanel({ row }: { row: Row }) {
  const { t } = useTranslation(["finance"]);
  const k = (x: string, o?: Record<string, unknown>) => t(`finance:intakeInbox.removal.${x}`, o);
  const qc = useQueryClient();
  const restore = useServerFn(restoreRemovedItem);
  const m = useMutation({
    mutationFn: () => restore({ data: { id: row.id } }),
    onSuccess: () => { toast.success(k("restored")); qc.invalidateQueries({ queryKey: ["finance", "review-queue"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const at = row.removed_at ? new Date(row.removed_at) : null;
  const left = at ? Math.max(0, 30 - Math.floor((Date.now() - at.getTime()) / 86400000)) : null;
  const by = row.removed_source === "manual" ? k("by.manual") : row.removed_source?.startsWith("rule:") ? k("by.rule") : k("by.recipient");
  return (
    <Card className="border-destructive/40">
      <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">{k("removedTitle")}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
          <Undo2 className="h-4 w-4 mr-1.5" />{k("restore")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p className="font-medium">{row.removed_reason ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {by}{at ? ` · ${at.toLocaleDateString()}` : ""}{left != null ? ` · ${k("daysLeft", { count: left })}` : ""}
        </p>
        {row.removed_tag && <Badge variant="secondary" className="text-[10px]">{TAGS.includes(row.removed_tag as Tag) ? k(`tag.${row.removed_tag}`) : row.removed_tag === "rule" ? k("by.rule") : row.removed_tag}</Badge>}
      </CardContent>
    </Card>
  );
}
