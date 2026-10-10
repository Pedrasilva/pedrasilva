/**
 * Finance › Bancos › Cartões: the current entity's payment cards (list, add,
 * edit, deactivate). Only the last 4 digits are ever stored. Credit-card
 * accounts can name the current account that settles them.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_CARDS_KEY, devicesToText, textToDevices, useAccountsLite, usePaymentCards, type PaymentCard } from "@/lib/finance/use-payment-cards";
import { Checkbox } from "@/components/ui/checkbox";
import { currentEntityId } from "@/lib/finance/current-entity";

type Draft = Omit<PaymentCard, "id" | "entity_id"> & { id?: string };
const EMPTY: Draft = {
  holder_name: "", collaborator_id: null, last4: "", network: "mastercard", card_type: "debit",
  bank: "", bank_account_id: null, bank_refs: [], active: true, notes: "", device_last4: [], is_personal: false, nickname: "",
};

export function PaymentCardsList() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const cards = usePaymentCards();
  const accounts = useAccountsLite();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refsText, setRefsText] = useState("");
  const [devText, setDevText] = useState("");
  const accName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.account_name ?? "—";

  const open = (c?: PaymentCard) => {
    setDraft(c ? { ...c } : { ...EMPTY });
    setRefsText((c?.bank_refs ?? []).join(", "));
    setDevText(devicesToText(c?.device_last4 ?? []));
  };

  const save = async () => {
    if (!draft) return;
    const last4 = (draft.last4 ?? "").replace(/\D/g, "");
    if (last4 && last4.length !== 4) return toast.error(t("finance:cards.last4Invalid"));
    const row = {
      holder_name: draft.holder_name?.trim() || null,
      last4: last4 || null,
      network: draft.network,
      card_type: draft.card_type,
      bank: draft.bank?.trim() || null,
      bank_account_id: draft.is_personal ? null : draft.bank_account_id,
      bank_refs: refsText.split(",").map((s) => s.trim()).filter(Boolean),
      active: draft.active,
      notes: draft.notes?.trim() || null,
      device_last4: textToDevices(devText),
      is_personal: draft.is_personal,
      nickname: draft.nickname?.trim() || null,
    };
    const res = draft.id
      ? await supabase.from("payment_cards").update(row).eq("id", draft.id)
      : await supabase.from("payment_cards").insert({ ...row, entity_id: await currentEntityId() });
    if (res.error) return toast.error(res.error.message);
    toast.success(t("finance:cards.saved"));
    setDraft(null);
    qc.invalidateQueries({ queryKey: PAYMENT_CARDS_KEY });
  };

  const setActive = async (c: PaymentCard, active: boolean) => {
    const { error } = await supabase.from("payment_cards").update({ active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: PAYMENT_CARDS_KEY });
  };

  const setSettles = async (accountId: string, from: string | null) => {
    const { error } = await supabase.from("bank_accounts").update({ settles_from_account_id: from }).eq("id", accountId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["finance", "accounts-lite"] });
  };

  const netName = (n: string) => t(`finance:cards.network.${n}`);
  const suggestNickname = (c: Pick<Draft, "network" | "card_type" | "is_personal" | "bank_account_id">) => {
    const typ = t(`finance:cards.cardType.${c.card_type}`).toLowerCase();
    const where = c.is_personal ? t("finance:paidWith.personal").toLowerCase() : c.bank_account_id ? accName(c.bank_account_id) : "";
    return [c.network === "other" ? "" : netName(c.network), typ, where].filter(Boolean).join(" ");
  };

  const creditAccounts = (accounts.data ?? []).filter((a) => a.account_kind === "credit_card" && !a.archived_at);
  const currentAccounts = (accounts.data ?? []).filter((a) => a.account_kind === "bank" && !a.archived_at);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("finance:cards.title")}</CardTitle>
          <Button size="sm" onClick={() => open()}>{t("finance:cards.add")}</Button>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{t("finance:cards.subtitle")}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:cards.nickname")}</TableHead>
                <TableHead>{t("finance:cards.holder")}</TableHead>
                <TableHead>{t("finance:cards.last4")}</TableHead>
                <TableHead>{t("finance:cards.type")}</TableHead>
                <TableHead>{t("finance:cards.account")}</TableHead>
                <TableHead>{t("finance:cards.settledBy")}</TableHead>
                <TableHead>{t("finance:cards.bankRefs")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cards.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">{t("finance:cards.empty")}</TableCell></TableRow>
              )}
              {(cards.data ?? []).map((c) => {
                const acc = accounts.data?.find((a) => a.id === c.bank_account_id);
                return (
                  <TableRow key={c.id} className={c.active ? "" : "opacity-60"}>
                    <TableCell>{c.nickname || <span className="text-xs text-muted-foreground">{t("finance:cards.suggested")}: {suggestNickname(c)}</span>}</TableCell>
                    <TableCell>{c.holder_name || <span className="text-muted-foreground">{t("finance:cards.unknownHolder")}</span>}</TableCell>
                    <TableCell className="tabular-nums">{c.last4 ? `…${c.last4}` : <Badge variant="outline">{t("finance:cards.last4Missing")}</Badge>}</TableCell>
                    <TableCell>{t(`finance:cards.network.${c.network}`)} · {t(`finance:cards.cardType.${c.card_type}`)}</TableCell>
                    <TableCell>{accName(c.bank_account_id)}</TableCell>
                    <TableCell>{c.card_type === "credit" ? accName(acc?.settles_from_account_id ?? null) : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {[c.bank_refs.join(", "), (c.device_last4 ?? []).map((d) => `…${d.last4}`).join(" ")].filter(Boolean).join(" · ") || "—"}
                      {c.is_personal && <Badge variant="secondary" className="ml-2">{t("finance:cards.personalBadge")}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => open(c)}>{t("common:edit")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setActive(c, !c.active)}>
                        {c.active ? t("finance:cards.deactivate") : t("finance:cards.reactivate")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {creditAccounts.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("finance:cards.settlementTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("finance:cards.settlementHint")}</p>
            {creditAccounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="w-56 text-sm">{a.account_name}</span>
                <Select value={a.settles_from_account_id ?? "none"} onValueChange={(v) => setSettles(a.id, v === "none" ? null : v)}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("finance:paidWith.none")}</SelectItem>
                    {currentAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? t("finance:cards.edit") : t("finance:cards.add")}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.nickname")}</Label>
                <Input value={draft.nickname ?? ""} placeholder={suggestNickname(draft)} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} />
                {!draft.nickname && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDraft({ ...draft, nickname: suggestNickname(draft) })}>
                    {t("finance:cards.useSuggestion", { name: suggestNickname(draft) })}
                  </Button>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.holder")}</Label>
                <Input value={draft.holder_name ?? ""} onChange={(e) => setDraft({ ...draft, holder_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t("finance:cards.last4")}</Label>
                <Input value={draft.last4 ?? ""} inputMode="numeric" maxLength={4}
                  onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                <p className="text-xs text-muted-foreground">{t("finance:cards.last4Hint")}</p>
              </div>
              <div className="space-y-1">
                <Label>{t("finance:cards.bank")}</Label>
                <Input value={draft.bank ?? ""} onChange={(e) => setDraft({ ...draft, bank: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t("finance:cards.networkLabel")}</Label>
                <Select value={draft.network} onValueChange={(v) => setDraft({ ...draft, network: v as Draft["network"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["visa", "mastercard", "other"] as const).map((n) => <SelectItem key={n} value={n}>{t(`finance:cards.network.${n}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("finance:cards.type")}</Label>
                <Select value={draft.card_type} onValueChange={(v) => setDraft({ ...draft, card_type: v as Draft["card_type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["debit", "credit"] as const).map((n) => <SelectItem key={n} value={n}>{t(`finance:cards.cardType.${n}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.account")}</Label>
                <Select value={draft.bank_account_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, bank_account_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("finance:paidWith.none")}</SelectItem>
                    {(accounts.data ?? []).filter((a) => !a.archived_at).map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("finance:cards.accountHint")}</p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.bankRefs")}</Label>
                <Input value={refsText} onChange={(e) => setRefsText(e.target.value)} placeholder="MDB8022" />
                <p className="text-xs text-muted-foreground">{t("finance:cards.bankRefsHint")}</p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.devices")}</Label>
                <Input value={devText} onChange={(e) => setDevText(e.target.value)} placeholder="1742:iPhone" />
                <p className="text-xs text-muted-foreground">{t("finance:cards.devicesHint")}</p>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={draft.is_personal} onCheckedChange={(v) => setDraft({ ...draft, is_personal: !!v, bank_account_id: v ? null : draft.bank_account_id })} />
                {t("finance:cards.isPersonal")}
              </label>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("finance:cards.notes")}</Label>
                <Textarea value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t("common:cancel")}</Button>
            <Button onClick={save}>{t("common:save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
