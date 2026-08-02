import { createFileRoute } from "@tanstack/react-router";
import { StatementView } from "@/components/finance/statement-view";

export const Route = createFileRoute("/_app/finance/banking/statements")({
  component: StatementView,
});
