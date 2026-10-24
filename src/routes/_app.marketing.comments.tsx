import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old link kept working: now a sub-tab of Published. */
export const Route = createFileRoute("/_app/marketing/comments")({
  beforeLoad: ({ search }) => { throw redirect({ to: "/marketing/published/comments", search: search as never, replace: true }); },
});
