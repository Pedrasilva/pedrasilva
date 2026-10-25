import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy proposal detail retired — redirect to the quote editor.
export const Route = createFileRoute("/_app/crm/pipeline/$proposalId")({
  head: () => ({ meta: [{ title: "crm / pipeline / proposalId — PSA Hub" }, { name: "description", content: "PSA Hub crm / pipeline / proposalId workspace." }, { property: "og:title", content: "crm / pipeline / proposalId — PSA Hub" }, { property: "og:description", content: "PSA Hub crm / pipeline / proposalId workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/crm/quotes/$quoteId", params: { quoteId: params.proposalId } });
  },
});
