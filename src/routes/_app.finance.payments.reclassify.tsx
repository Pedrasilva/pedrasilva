import { createFileRoute } from "@tanstack/react-router";
import { ReclassReview } from "@/components/finance/reclass-review";

export const Route = createFileRoute("/_app/finance/payments/reclassify")({
  head: () => ({
    meta: [
      { title: "To reclassify — PSA Hub Finance" },
      { name: "description", content: "Records still on a group code: accept the suggested category in one click." },
      { property: "og:title", content: "To reclassify — PSA Hub Finance" },
      { property: "og:description", content: "Records still on a group code: accept the suggested category in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReclassReview,
});
