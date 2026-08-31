import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { SignatureProjectsSection } from "@/components/home/signature-projects";

export const Route = createFileRoute("/_app/portfolio")({
  head: () => ({
    meta: [
      { title: "Signature Projects — PSA Hub" },
      {
        name: "description",
        content:
          "Curated Pedra Silva Architects imagery, shared with the proposal builder image library.",
      },
      { property: "og:title", content: "Signature Projects — PSA Hub" },
      {
        property: "og:description",
        content:
          "Curated Pedra Silva Architects imagery, shared with the proposal builder image library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="py-2">
      <SignatureProjectsSection isAdmin={isAdmin} />
    </div>
  );
}
