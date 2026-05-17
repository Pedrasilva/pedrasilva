import { createFileRoute } from "@tanstack/react-router";
import { SuppliersMasterData } from "@/components/finance/suppliers-master-data";

export const Route = createFileRoute("/_app/finance/payments/suppliers")({
  component: SuppliersMasterData,
});
