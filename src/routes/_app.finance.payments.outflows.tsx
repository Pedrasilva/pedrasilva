import { createFileRoute } from "@tanstack/react-router";
import { SettlementWorkspace } from "@/components/finance/settlement-workspace";

export const Route = createFileRoute("/_app/finance/payments/outflows")({
  component: () => <SettlementWorkspace direction="received" />,
});
