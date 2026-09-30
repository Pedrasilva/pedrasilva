import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyPendingNudges } from "@/lib/marketing/nudges.functions";

/** Home strip: the signed-in architect's pending, unexpired questions. Hidden when empty. */
export function QuestionsForYou() {
  const { t } = useTranslation("home");
  const fn = useServerFn(listMyPendingNudges);
  const { data } = useQuery({ queryKey: ["home-my-nudges"], queryFn: () => fn(), staleTime: 60_000 });
  if (!data?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion className="h-4 w-4" />
          {t("questionsForYou.title")}
        </h2>
        <ul className="divide-y">
          {data.map((n) => (
            <li key={n.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="shrink-0 font-medium">{n.senderFirstName}</span>
              {n.projectName && <span className="shrink-0 text-muted-foreground">· {n.projectName}</span>}
              <span className="min-w-0 flex-1 truncate text-foreground/80">{n.question}</span>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to="/nudges/$nudgeId" params={{ nudgeId: n.id }}>
                  {n.kind === "briefing" ? t("questionsForYou.record") : t("questionsForYou.answer")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
