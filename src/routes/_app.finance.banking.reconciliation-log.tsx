import { createFileRoute } from "@tanstack/react-router";
import { ReconcileAuditRegister } from "@/components/finance/reconcile-audit";

export const Route = createFileRoute("/_app/finance/banking/reconciliation-log")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reconciliation register — PSA Hub Finance" },
      { name: "description", content: "Searchable history of every bank reconciliation change, linked to movements and documents." },
      { property: "og:title", content: "Reconciliation register — PSA Hub Finance" },
      { property: "og:description", content: "Searchable history of every bank reconciliation change, linked to movements and documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconcileAuditRegister,
});
