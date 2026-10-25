import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy pipeline retired — all proposals now live under Opportunities.
export const Route = createFileRoute("/_app/crm/pipeline")({
  head: () => ({ meta: [{ title: "crm / pipeline — PSA Hub" }, { name: "description", content: "PSA Hub crm / pipeline workspace." }, { property: "og:title", content: "crm / pipeline — PSA Hub" }, { property: "og:description", content: "PSA Hub crm / pipeline workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/crm/opportunities" });
  },
});
