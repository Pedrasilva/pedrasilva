import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type AccountRow = { id: string; name: string };

/**
 * AccountSuggestField — shared billing-account picker used at quote creation.
 *
 * Behaviour (purely additive, never blocking):
 *  - Loads the accounts belonging to the selected company.
 *  - If the company has exactly one account and nothing is picked yet, it is
 *    auto-suggested (pre-selected) and flagged with a "suggested" badge so the
 *    user sees why. Multiple accounts → no silent guess, just the list.
 *  - If the company has no accounts, an inline "add billing account" affordance
 *    is offered. It is optional — the caller can still create the quote with
 *    account_id = null exactly as before.
 */
export function AccountSuggestField({
  companyId,
  value,
  onChange,
  enabled = true,
}: {
  companyId: string | null;
  value: string;
  onChange: (accountId: string) => void;
  enabled?: boolean;
}) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [suggested, setSuggested] = useState(false);
  const suggestedForCompany = useRef<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["crm_accounts_by_company", companyId],
    queryFn: async () => {
      if (!companyId) return [] as AccountRow[];
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
    enabled: enabled && !!companyId,
  });

  // Auto-suggest the single existing account, once per company.
  useEffect(() => {
    if (!companyId || value || accounts.length !== 1) return;
    if (suggestedForCompany.current === companyId) return;
    suggestedForCompany.current = companyId;
    setSuggested(true);
    onChange(accounts[0].id);
  }, [companyId, accounts, value, onChange]);

  const createAccount = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error(t("accounts.dialog.errorCompany"));
      if (!newName.trim()) throw new Error(t("accounts.dialog.errorName"));
      const { data, error } = await supabase
        .from("crm_accounts")
        .insert({ name: newName.trim(), company_id: companyId })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("accounts.dialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      qc.invalidateQueries({ queryKey: ["crm_accounts_by_company", companyId] });
      setNewName("");
      setAdding(false);
      setSuggested(false);
      onChange(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasAccounts = accounts.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Label>{t("quotes.newQuoteDialog.accountOptional")}</Label>
        {suggested && value && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Sparkles className="h-3 w-3" />
            {t("quotes.accountField.suggestedBadge")}
          </Badge>
        )}
      </div>

      <Select
        value={value || "none"}
        onValueChange={(v) => {
          setSuggested(false);
          onChange(v === "none" ? "" : v);
        }}
        disabled={!companyId || isLoading}
      >
        <SelectTrigger className="mt-1">
          <SelectValue placeholder={t("common.noAccount")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("quotes.newQuoteDialog.noAccountSetBefore")}</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasAccounts ? (
        <p className="text-xs text-muted-foreground mt-1">
          {suggested && value
            ? t("quotes.accountField.suggestedHint")
            : t("quotes.accountField.pickHint", { count: accounts.length })}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">
          {t("quotes.newQuoteDialog.noAccountsHint")}
        </p>
      )}

      {companyId && !hasAccounts && !adding && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("quotes.accountField.addAccount")}
        </Button>
      )}

      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            autoFocus
            value={newName}
            placeholder={t("accounts.dialog.namePlaceholder")}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => createAccount.mutate()}
            disabled={createAccount.isPending || !newName.trim()}
          >
            {t("common.create")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setAdding(false); setNewName(""); }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
