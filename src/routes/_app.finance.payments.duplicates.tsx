import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDuplicatesReview } from "@/components/finance/purchase-duplicates-review";

export const Route = createFileRoute("/_app/finance/payments/duplicates")({
  head: () => ({
    meta: [
      { title: "Suspected duplicate purchases — PSA Hub Finance" },
      { name: "description", content: "Review suspected duplicate supplier invoices side by side and decide which to keep." },
      { property: "og:title", content: "Suspected duplicate purchases — PSA Hub Finance" },
      { property: "og:description", content: "Review suspected duplicate supplier invoices side by side and decide which to keep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseDuplicatesReview,
});
