import { createFileRoute } from "@tanstack/react-router";
import { PurchasesWorkspace } from "@/components/finance/purchases-workspace";

export const Route = createFileRoute("/_app/finance/payments/purchases")({
  component: PurchasesWorkspace,
});
