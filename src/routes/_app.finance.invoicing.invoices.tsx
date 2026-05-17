import { createFileRoute } from "@tanstack/react-router";
import { InvoicesWorkspace } from "@/components/finance/invoices-workspace";

export const Route = createFileRoute("/_app/finance/invoicing/invoices")({
  component: InvoicesWorkspace,
});
