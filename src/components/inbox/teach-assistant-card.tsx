/**
 * "Teach the assistant" — natural-language sender-rule creation.
 * Parse → preview (with pending-backlog counts) → explicit confirm → save,
 * which also executes the rule over everything already in the queue.
 * Admin-only, matching the RLS on `email_sender_rules`.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  createSenderRulesWithBackfill,
  parseSenderRuleInstruction,
  type RulePreview,
} from "@/lib/inbox/inbox.functions";

export function TeachAssistantCard() {
  const { t } = useTranslation(["inbox"]);
  const qc = useQueryClient();
  const parseFn = useServerFn(parseSenderRuleInstruction);
  const saveFn = useServerFn(createSenderRulesWithBackfill);

  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseM = useMutation({
    mutationFn: () => parseFn({ data: { instruction: instruction.trim() } }),
    onMutate: () => {
      setError(null);
      setPreview(null);
    },
    onSuccess: (res) => setPreview(res),
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
  });

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          rules: (preview?.rules ?? []).map(
            ({ pendingMatches: _ignored, ...rule }) => rule,
          ),
        },
      }),
    onMutate: () => setError(null),
    onSuccess: (res) => {
      toast.success(
        t("inbox:teach.saved", {
          created: res.created,
          applied: res.applied,
        }),
        {
          description: res.failed
            ? t("inbox:teach.savedFailed", { count: res.failed })
            : undefined,
        },
      );
      setPreview(null);
      setInstruction("");
      void qc.invalidateQueries({ queryKey: ["email-events"] });
      void qc.invalidateQueries({ queryKey: ["email-sender-rules"] });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
  });

  const busy = parseM.isPending || saveM.isPending;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("inbox:teach.title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("inbox:teach.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={instruction}
          disabled={busy}
          placeholder={t("inbox:teach.placeholder")}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && instruction.trim() && !busy) {
              parseM.mutate();
            }
          }}
        />
        <Button
          disabled={busy || instruction.trim().length < 3}
          onClick={() => parseM.mutate()}
        >
          {parseM.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-4 w-4" />
          )}
          {t("inbox:teach.parse")}
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-md border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("inbox:teach.previewTitle")}
          </p>

          {preview.rules.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {preview.notes ?? t("inbox:teach.noRules")}
            </p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {preview.rules.map((r) => (
                  <li
                    key={`${r.match_type}:${r.sender_pattern}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="break-all font-medium">
                      {r.match_type === "domain"
                        ? `@${r.sender_pattern}`
                        : r.sender_pattern}
                    </span>
                    <Badge variant="outline">
                      {t(`inbox:rules.match.${r.match_type}`)}
                    </Badge>
                    <Badge variant="secondary">
                      {t(`inbox:category.${r.category}`, {
                        defaultValue: r.category,
                      })}
                    </Badge>
                    <Badge>
                      {t(`inbox:rules.action.${r.action}`, {
                        defaultValue: r.action,
                      })}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("inbox:teach.pendingMatches", {
                        count: r.pendingMatches,
                      })}
                    </span>
                  </li>
                ))}
              </ul>

              {preview.notes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {preview.notes}
                </p>
              )}

              <Separator className="my-3" />
              <p className="text-sm">
                {t("inbox:teach.impact", {
                  count: preview.totalPendingMatches,
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => saveM.mutate()}>
                  {saveM.isPending && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {t("inbox:teach.confirm")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  {t("inbox:teach.cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
