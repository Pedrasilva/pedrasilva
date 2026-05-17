import { createFileRoute } from "@tanstack/react-router";
import { FinancialClassificationsAdmin } from "@/components/finance/financial-classifications-admin";

export const Route = createFileRoute("/_app/finance/data/classifications")({
  component: FinancialClassificationsAdmin,
});
