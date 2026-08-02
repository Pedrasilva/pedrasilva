import { createFileRoute } from "@tanstack/react-router";
import { VatReportSection } from "@/components/finance/vat-report";

export const Route = createFileRoute("/_app/finance/reports/vat")({
  component: () => <VatReportSection />,
});
