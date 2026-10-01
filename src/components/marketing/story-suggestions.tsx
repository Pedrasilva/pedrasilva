import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { StoryField } from "@/lib/marketing/projects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Suggestion = {
  id: string;
  field: StoryField;
  suggested_text: string;
  source: "ai" | "architect_answer" | "architect_briefing" | "press_kit";
  capture_id: string | null;
  marketing_captures: { marketing_capture_assets: { storage_path: string; mime_type: string }[] } | null;
};

/** Pending AI story suggestions for one profile. Renders nothing when there are none. */
export function StorySuggestions({ profileId, thumbs, current = {}, onAccepted }: {
  profileId: string;
  thumbs: Record<string, string>;
  /** Saved content of each story field, shown so overlaps are visible before accepting. */
  current?: Partial<Record<StoryField, string | null>>;
  onAccepted: () => void;
}) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const key = ["marketing-story-suggestions", profileId];
  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db
        .from("marketing_project_story_suggestions")
        .select("id, field, suggested_text, source, capture_id, marketing_captures(marketing_capture_assets(storage_path, mime_type))")
        .eq("profile_id", profileId)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });
  if (data.length === 0) return null;

  return (
    <Card className="space-y-3 border-dashed p-4">
      <div>
        <h2 className="font-semibold">{t("ai.suggestionsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("ai.suggestionsHint")}</p>
      </div>
      {data.map((s) => (
        <SuggestionRow key={s.id} s={s} thumbs={thumbs} fieldText={current[s.field] ?? ""}
          onDone={(accepted) => { qc.invalidateQueries({ queryKey: key }); if (accepted) onAccepted(); }} />
      ))}
    </Card>
  );
}

function SuggestionRow({ s, thumbs, fieldText, onDone }: { s: Suggestion; thumbs: Record<string, string>; fieldText: string; onDone: (accepted: boolean) => void }) {
  const { t } = useTranslation("marketing");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.suggested_text);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const hasField = fieldText.trim().length > 0;
  const img = s.marketing_captures?.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"));
  const url = img ? thumbs[img.storage_path] : undefined;

  const review = async (accept: boolean) => {
    if (accept && hasField && mode === "replace" && !confirm(t("ai.replaceConfirm"))) return;
    setBusy(true);
    const { error } = accept
      ? await db.rpc("marketing_accept_story_suggestion", { _id: s.id, _text: editing ? text : null, _mode: hasField ? mode : "append" })
      : await db.from("marketing_project_story_suggestions").update({ status: "rejected" }).eq("id", s.id);
    setBusy(false);
    if (error) { toast.error(t("profiles.error")); return; }
    toast.success(accept ? t("ai.suggestionAccepted") : t("ai.suggestionRejected"));
    onDone(accept);
  };

  return (
    <div className="flex gap-3 rounded-md border p-3">
      {s.capture_id && (
        <Link to="/marketing" search={{ capture: s.capture_id }} title={t("ai.sourceCapture")}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
        </Link>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-1"><Badge variant="outline">{t(`profile.fields.${s.field}`)}</Badge><Badge variant="secondary">{t(`ai.source.${s.source}`)}</Badge></div>
        {editing ? (
          <>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="rounded bg-muted/50 p-2">
              <p className="text-xs font-medium text-muted-foreground">{t("ai.original")}</p>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{s.suggested_text}</p>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{s.suggested_text}</p>
        )}
        {hasField && (
          <details className="rounded bg-muted/30 p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t("ai.currentField")}</summary>
            <p className="mt-1 whitespace-pre-wrap">{fieldText}</p>
          </details>
        )}
        {hasField && (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "append" | "replace")} className="flex gap-4">
            <div className="flex items-center gap-1.5"><RadioGroupItem id={`${s.id}-a`} value="append" /><Label htmlFor={`${s.id}-a`} className="text-xs">{t("ai.modeAppend")}</Label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem id={`${s.id}-r`} value="replace" /><Label htmlFor={`${s.id}-r`} className="text-xs">{t("ai.modeReplace")}</Label></div>
          </RadioGroup>
        )}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={() => review(true)} disabled={busy || !text.trim()}>{t("ai.saveAccept")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setText(s.suggested_text); }} disabled={busy}>{t("ai.cancelEdit")}</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => review(true)} disabled={busy}>{t("ai.accept")}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>{t("ai.edit")}</Button>
              <Button size="sm" variant="outline" onClick={() => review(false)} disabled={busy}>{t("ai.reject")}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
