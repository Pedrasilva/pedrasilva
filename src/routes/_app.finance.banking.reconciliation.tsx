import { createFileRoute } from "@tanstack/react-router";
import { BankReconciliationTab } from "@/components/finance/bank-reconciliation";

export const Route = createFileRoute("/_app/finance/banking/reconciliation")({
  head: () => ({ meta: [{"title": "Bank reconciliation | PSA Hub"}, {"name": "description", "content": "PSA Hub \u2014 bank reconciliation for Pedra Silva Architects."}, {"property": "og:title", "content": "Bank reconciliation | PSA Hub"}, {"property": "og:description", "content": "PSA Hub \u2014 bank reconciliation for Pedra Silva Architects."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: BankReconciliationTab,
});
