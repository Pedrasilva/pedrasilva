import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/projects/app-shell";

export const Route = createFileRoute("/_app/projects/timesheet")({
  component: () => (
    <AppShell active="timesheet">
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
        Timesheet — em construção.
      </div>
    </AppShell>
  ),
});
