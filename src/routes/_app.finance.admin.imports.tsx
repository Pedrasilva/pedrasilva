import { createFileRoute } from "@tanstack/react-router";
import { DriveIntakeCard } from "@/components/finance/drive-intake-card";
import { ImportLogsSection } from "@/components/finance/sections/legacy-sections";

function ImportsAdminPage() {
  return (
    <div className="space-y-6">
      <DriveIntakeCard />
      <ImportLogsSection />
    </div>
  );
}

export const Route = createFileRoute("/_app/finance/admin/imports")({
  component: ImportsAdminPage,
});
