import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { usePendingApprovalsSummary } from "@/lib/projects/use-hour-approvals";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/projects/app-shell";
import { CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/projects/approvals")({
  component: ProjectsApprovalsQueue,
});

function ProjectsApprovalsQueue() {
  const { t } = useTranslation(["projects", "common"]);
  const { isAdmin } = useAuth();
  const { data, isLoading } = usePendingApprovalsSummary();

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          {t("common:accessDenied", { defaultValue: "Access denied." })}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("projects:approvals.queueTitle", { defaultValue: "Approve work" })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("projects:approvals.queueSubtitle", {
              defaultValue: "Projects with hours awaiting approval.",
            })}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{" "}
            {t("common:loading", { defaultValue: "Loading…" })}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">
              {t("projects:approvals.queueEmpty", {
                defaultValue: "All caught up. No pending hours.",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                search={{ tab: "approvals" } as never}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: p.color }}
                  />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.count}{" "}
                      {t("projects:approvals.pendingEntries", {
                        defaultValue: "pending entries",
                      })}{" "}
                      · {p.hours.toFixed(1)}h
                    </div>
                  </div>
                </div>
                <div className="text-xs font-medium text-primary">
                  {t("projects:approvals.review", { defaultValue: "Review →" })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
