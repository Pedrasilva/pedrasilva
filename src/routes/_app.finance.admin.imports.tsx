import { createFileRoute } from "@tanstack/react-router";
import { ImportLogsSection } from "@/components/finance/sections/legacy-sections";

export const Route = createFileRoute("/_app/finance/admin/imports")({
  component: ImportLogsSection,
});
