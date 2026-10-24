import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old link kept working: now a sub-tab of Published. */
export const Route = createFileRoute("/_app/marketing/insights")({
  beforeLoad: ({ search }) => { throw redirect({ to: "/marketing/published/insights", search: search as never, replace: true }); },
});
