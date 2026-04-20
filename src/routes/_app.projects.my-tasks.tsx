import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/projects/app-shell";

export const Route = createFileRoute("/_app/projects/my-tasks")({
  component: () => (
    <AppShell active="tasks">
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
        My Tasks — em construção.
      </div>
    </AppShell>
  ),
});
