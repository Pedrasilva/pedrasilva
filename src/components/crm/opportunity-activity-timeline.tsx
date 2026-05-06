import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Mail, Calendar, StickyNote, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  OPPORTUNITY_ACTIVITY_TYPES,
  type OpportunityActivity,
  type OpportunityActivityType,
} from "@/lib/crm/types";

const ICONS: Record<OpportunityActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: StickyNote,
};

function relativeTime(iso: string, t: (k: string, opts?: Record<string, unknown>) => string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("opportunities.activity.justNow");
  if (m < 60) return t("opportunities.activity.minAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("opportunities.activity.hourAgo", { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("opportunities.activity.dayAgo", { count: d });
  return new Date(iso).toLocaleDateString();
}

export function OpportunityActivityTimeline({ opportunityId }: { opportunityId: string }) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [type, setType] = useState<OpportunityActivityType>("note");
  const [content, setContent] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const queryKey = ["opportunity_activities", opportunityId];

  const { data: activities = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_activities")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpportunityActivity[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = content.trim();
      if (!trimmed) throw new Error(t("opportunities.activity.errorEmpty"));
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("opportunity_activities").insert({
        opportunity_id: opportunityId,
        type,
        content: trimmed,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent("");
      setType("note");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["crm_opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      ref.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("opportunity_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {OPPORTUNITY_ACTIVITY_TYPES.map((tp) => {
            const Icon = ICONS[tp.value];
            const active = type === tp.value;
            return (
              <button
                key={tp.value}
                type="button"
                onClick={() => setType(tp.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                <Icon className="h-3 w-3" />
                {t(`opportunities.activity.type.${tp.value}`)}
              </button>
            );
          })}
        </div>
        <Textarea
          ref={ref}
          rows={2}
          placeholder={t("opportunities.activity.placeholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (content.trim()) create.mutate();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {t("opportunities.activity.shortcut")}
          </span>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={!content.trim() || create.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("opportunities.activity.add")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">{t("common.loading")}</p>}
        {!isLoading && activities.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {t("opportunities.activity.empty")}
          </p>
        )}
        {activities.map((a) => {
          const Icon = ICONS[a.type];
          return (
            <div key={a.id} className="group flex gap-3 rounded-md border bg-card p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`opportunities.activity.type.${a.type}`)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(a.created_at, t)}
                  </span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{a.content}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(a.id)}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
