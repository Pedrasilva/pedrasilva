import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/crm/companies")({
  head: () => ({ meta: [{ title: "crm / companies — PSA Hub" }, { name: "description", content: "PSA Hub crm / companies workspace." }, { property: "og:title", content: "crm / companies — PSA Hub" }, { property: "og:description", content: "PSA Hub crm / companies workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <Outlet />,
});
