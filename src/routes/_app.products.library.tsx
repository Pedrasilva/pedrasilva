import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
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
  useTranslation();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight"> {uiI18n.t("common:library")} </h1>
        <p className="text-sm text-muted-foreground">
           {uiI18n.t("crm:products.librarySub")} </p>
      </header>
      <LibraryBrowser />
    </div>
  );
}
