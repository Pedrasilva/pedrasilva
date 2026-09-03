import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ProductsTopNav } from "@/components/products/products-top-nav";

export const Route = createFileRoute("/_app/products")({
  component: ProductsLayout,
  head: () => ({
    meta: [
      { title: "Product Library — PSA Hub specifications" },
      {
        name: "description",
        content:
          "Specify furniture and interior products on PSA projects, reuse the studio library and issue datasheets and schedules.",
      },
      { property: "og:title", content: "Product Library — PSA Hub specifications" },
      {
        property: "og:description",
        content:
          "Specify furniture and interior products on PSA projects, reuse the studio library and issue datasheets and schedules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProductsLayout() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col">
      <ProductsTopNav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
