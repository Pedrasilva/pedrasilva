import { createFileRoute } from "@tanstack/react-router";
import { LibraryBrowser } from "@/components/products/library-browser";

export const Route = createFileRoute("/_app/products/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "PSA product library — reusable products" },
      {
        name: "description",
        content:
          "Browse the practice-wide catalogue of furniture and interior products used across PSA projects.",
      },
      { property: "og:title", content: "PSA product library — reusable products" },
      {
        property: "og:description",
        content:
          "Browse the practice-wide catalogue of furniture and interior products used across PSA projects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LibraryPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          Reusable PSA product knowledge. It grows organically as projects are specified.
        </p>
      </header>
      <LibraryBrowser />
    </div>
  );
}
