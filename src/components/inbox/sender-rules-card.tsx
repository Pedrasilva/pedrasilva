/**
 * Sender rules — deterministic pre-AI classification for the inbox poller.
 * Admin-managed (RLS enforces it); the poller reads active rules and skips
 * the AI call entirely on a match.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  "new_enquiry",
  "project_correspondence",
  "supplier_invoice",
  "admin_finance",
  "recruitment",
  "newsletter_marketing",
] as const;

const MATCH_TYPES = ["exact_address", "domain"] as const;
const ACTIONS = ["archive", "label_only", "trash"] as const;

type MatchType = (typeof MATCH_TYPES)[number];
type RuleAction = (typeof ACTIONS)[number];

export function SenderRulesCard() {
  const { t } = useTranslation(["inbox"]);
  const qc = useQueryClient();

  const [matchType, setMatchType] = useState<MatchType>("exact_address");
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState<string>("newsletter_marketing");
  const [action, setAction] = useState<RuleAction>("label_only");

  const rulesQ = useQuery({
    queryKey: ["email-sender-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_sender_rules")
        .select("id, match_type, sender_pattern, category, action, is_active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["email-sender-rules"] });

  const onError = (e: unknown) =>
    toast.error(t("inbox:rules.error"), {
      description: e instanceof Error ? e.message : undefined,
    });

  const addM = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("email_sender_rules").insert({
        match_type: matchType,
        sender_pattern: pattern.trim().toLowerCase().replace(/^@/, ""),
        category,
        action,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:rules.added"));
      setPattern("");
      void invalidate();
    },
    onError,
  });

  const toggleM = useMutation({
    mutationFn: async (vars: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("email_sender_rules")
        .update({ is_active: vars.is_active })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:rules.updated"));
      void invalidate();
    },
    onError,
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_sender_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:rules.removed"));
      void invalidate();
    },
    onError,
  });

  const rows = rulesQ.data ?? [];

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {t("inbox:rules.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("inbox:rules.subtitle")}
      </p>

      <div className="mt-5 space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("inbox:rules.empty")}
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid gap-3 rounded-md border px-4 py-3 md:flex md:flex-wrap md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all font-medium">
                  {r.match_type === "domain"
                    ? `@${r.sender_pattern}`
                    : r.sender_pattern}
                </span>
                <Badge variant="secondary">
                  {t(`inbox:category.${r.category}`, {
                    defaultValue: r.category,
                  })}
                </Badge>
                <Badge variant="outline">
                  {t(`inbox:rules.action.${r.action}`, {
                    defaultValue: r.action,
                  })}
                </Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t(`inbox:rules.match.${r.match_type}`)}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 md:justify-end">
              <Switch
                checked={!!r.is_active}
                onCheckedChange={(v) =>
                  toggleM.mutate({ id: r.id, is_active: v })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeM.mutate(r.id)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("inbox:rules.remove")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>{t("inbox:rules.matchType")}</Label>
          <Select
            value={matchType}
            onValueChange={(v) => setMatchType(v as MatchType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_TYPES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`inbox:rules.match.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rule-pattern">{t("inbox:rules.pattern")}</Label>
          <Input
            id="rule-pattern"
            value={pattern}
            placeholder={
              matchType === "domain"
                ? t("inbox:rules.patternDomainPlaceholder")
                : t("inbox:rules.patternAddressPlaceholder")
            }
            onChange={(e) => setPattern(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("inbox:rules.category")}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`inbox:category.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("inbox:rules.actionLabel")}</Label>
          <Select
            value={action}
            onValueChange={(v) => setAction(v as RuleAction)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`inbox:rules.action.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        <Button
          disabled={!pattern.trim() || addM.isPending}
          onClick={() => addM.mutate()}
        >
          {t("inbox:rules.add")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("inbox:rules.note")}
      </p>
    </Card>
  );
}
