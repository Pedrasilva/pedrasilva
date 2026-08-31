import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InventoryTopNav } from "@/components/inventory/inventory-top-nav";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryLayout,
  head: () => ({
    meta: [
      { title: "Inventory — PSA Hub asset register" },
      {
        name: "description",
        content:
          "Track studio equipment: asset codes, custody, depreciation, warranties and insurance register.",
      },
      { property: "og:title", content: "Inventory — PSA Hub asset register" },
      {
        property: "og:description",
        content:
          "Track studio equipment: asset codes, custody, depreciation, warranties and insurance register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function InventoryLayout() {
  const { t } = useTranslation(["inventory"]);
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col">
      <InventoryTopNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">{t("inventory:module.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("inventory:module.subtitle")}</p>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
