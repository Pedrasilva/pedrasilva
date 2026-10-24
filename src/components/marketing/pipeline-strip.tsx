import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tabCounts } from "@/lib/marketing/planner-tabs";
import { cn } from "@/lib/utils";

export type PipelineStep = "inbox" | "planner" | "calendar" | "published";

/** Live counts for the four workflow steps; same sources as the Inbox and Planner tabs. */
export function usePipelineCounts() {
  return useQuery({
    queryKey: ["marketing-pipeline-counts"],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [st, dr] = await Promise.all([
        db.from("marketing_capture_stages").select("stage"),
        db.from("marketing_post_drafts").select("status, scheduled_at"),
      ]);
      if (st.error) throw st.error;
      if (dr.error) throw dr.error;
      const drafts = dr.data as { status: string; scheduled_at: string | null }[];
      const tabs = tabCounts(drafts);
      return {
        toCurate: (st.data as { stage: string }[]).filter((r) => r.stage === "to_curate").length,
        toReview: tabs.review,
        toPlace: tabs.approved,
        scheduled: tabs.scheduled,
        published: tabs.published,
      };
    },
  });
}

export function PipelineStrip({ current }: { current: PipelineStep }) {
  const { t } = useTranslation("marketing");
  const { data: c } = usePipelineCounts();
  const n = (v: number | undefined) => v ?? "…";
  const steps: { id: PipelineStep; to: string; label: string; detail: string }[] = [
    { id: "inbox", to: "/marketing", label: t("pipeline.inbox"), detail: t("pipeline.toCurate", { count: n(c?.toCurate) as number }) },
    { id: "planner", to: "/marketing/posts", label: t("pipeline.planner"), detail: t("pipeline.toReview", { count: n(c?.toReview) as number }) },
    { id: "calendar", to: "/marketing/calendar", label: t("pipeline.calendar"), detail: t("pipeline.calendarDetail", { place: n(c?.toPlace), scheduled: n(c?.scheduled) }) },
    { id: "published", to: "/marketing/published", label: t("pipeline.published"), detail: String(n(c?.published)) },
  ];
  return (
    <nav aria-label={t("pipeline.label")} className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-1">
      {steps.map((s, i) => (
        <div key={s.id} className="flex min-w-0 items-center gap-1">
          <Link
            to={s.to as never}
            aria-current={s.id === current ? "step" : undefined}
            className={cn(
              "min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors sm:flex-none",
              s.id === current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-semibold">{s.label}</span>
            <span className="truncate"> · {s.detail}</span>
          </Link>
          {i < steps.length - 1 && <ChevronRight aria-hidden className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />}
        </div>
      ))}
    </nav>
  );
}

/** One-line explanation under each step page title. */
export function StepHint({ step }: { step: PipelineStep }) {
  const { t } = useTranslation("marketing");
  return <p className="text-sm text-muted-foreground">{t(`pipeline.hint.${step}`)}</p>;
}
