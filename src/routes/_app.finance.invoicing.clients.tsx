import { createFileRoute } from "@tanstack/react-router";
import { ClientsMasterData } from "@/components/finance/clients-master-data";

export const Route = createFileRoute("/_app/finance/invoicing/clients")({
  component: ClientsMasterData,
});
