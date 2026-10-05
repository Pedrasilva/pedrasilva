import { createFileRoute } from "@tanstack/react-router";
import { DriveArchivePage } from "@/components/finance/drive-archive-page";

export const Route = createFileRoute("/_app/finance/admin/drive-archive")({
  head: () => ({
    meta: [
      { title: "Drive archive — PSA Hub Finance" },
      { name: "description", content: "Google Drive copy status of filed finance documents, with retries." },
      { property: "og:title", content: "Drive archive — PSA Hub Finance" },
      { property: "og:description", content: "Google Drive copy status of filed finance documents, with retries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriveArchivePage,
});
