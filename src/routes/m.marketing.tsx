import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { listMyPendingNudges } from "@/lib/marketing/nudges.functions";

export const Route = createFileRoute("/m/marketing")({
  component: MobileMarketing,
  head: () => ({
    meta: [
      { title: "Perguntas de marketing — Portal Pedra Silva" },
      { name: "description", content: "Your pending marketing questions, answerable by voice from your phone." },
      { property: "og:title", content: "Perguntas de marketing — Portal Pedra Silva" },
      { property: "og:description", content: "Your pending marketing questions, answerable by voice from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MobileMarketing() {
  const { t } = useTranslation("common");
  const fn = useServerFn(listMyPendingNudges);
  const { data, isLoading } = useQuery({ queryKey: ["home-my-nudges"], queryFn: () => fn(), staleTime: 60_000 });

  return (
    <div className="flex flex-col gap-4">
      <Link to="/m" className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />{t("mobile.back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("mobile.marketing")}</h1>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      ) : !data?.length ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{t("mobile.noQuestions")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((n) => (
            <li key={n.id}>
              <Link to="/nudges/$nudgeId" params={{ nudgeId: n.id }}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">
                    {n.senderFirstName}{n.projectName ? ` · ${n.projectName}` : ""}
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-sm">{n.question}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
