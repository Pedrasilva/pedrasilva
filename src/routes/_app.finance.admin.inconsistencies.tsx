import { createFileRoute } from "@tanstack/react-router";
import { FinanceInconsistencyReport } from "@/components/finance/finance-inconsistency-report";

export const Route = createFileRoute("/_app/finance/admin/inconsistencies")({
  component: FinanceInconsistencyReport,
});
