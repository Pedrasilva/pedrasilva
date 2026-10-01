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
export function StorySuggestions({ profileId, thumbs, onAccepted }: { profileId: string; thumbs: Record<string, string>; onAccepted: () => void }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
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

  const review = async (s: Suggestion, accept: boolean) => {
    setBusy(s.id);
    const { error } = accept
      ? await db.rpc("marketing_accept_story_suggestion", { _id: s.id })
      : await db.from("marketing_project_story_suggestions").update({ status: "rejected" }).eq("id", s.id);
    setBusy(null);
    if (error) { toast.error(t("profiles.error")); return; }
    toast.success(accept ? t("ai.suggestionAccepted") : t("ai.suggestionRejected"));
    qc.invalidateQueries({ queryKey: key });
    if (accept) onAccepted();
  };

  return (
    <Card className="space-y-3 border-dashed p-4">
      <div>
        <h2 className="font-semibold">{t("ai.suggestionsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("ai.suggestionsHint")}</p>
      </div>
      {data.map((s) => {
        const img = s.marketing_captures?.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"));
        const url = img ? thumbs[img.storage_path] : undefined;
        return (
          <div key={s.id} className="flex gap-3 rounded-md border p-3">
            {s.capture_id && (
              <Link to="/marketing" search={{ capture: s.capture_id }} title={t("ai.sourceCapture")}
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
              </Link>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-1"><Badge variant="outline">{t(`profile.fields.${s.field}`)}</Badge><Badge variant="secondary">{t(`ai.source.${s.source}`)}</Badge></div>
              <p className="whitespace-pre-wrap text-sm">{s.suggested_text}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review(s, true)} disabled={busy === s.id}>{t("ai.accept")}</Button>
                <Button size="sm" variant="outline" onClick={() => review(s, false)} disabled={busy === s.id}>{t("ai.reject")}</Button>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
