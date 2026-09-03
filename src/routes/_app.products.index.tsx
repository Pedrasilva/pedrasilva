import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProductProjects } from "@/lib/products/use-products";
import { formatMoney } from "@/lib/products/types";

export const Route = createFileRoute("/_app/products/")({
  component: ProductProjectsPage,
  head: () => ({
    meta: [
      { title: "Product Library projects — PSA Hub" },
      {
        name: "description",
        content: "Choose a PSA project to specify furniture and interior products.",
      },
      { property: "og:title", content: "Product Library projects — PSA Hub" },
      {
        property: "og:description",
        content: "Choose a PSA project to specify furniture and interior products.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProductProjectsPage() {
  const { data: projects = [], isLoading } = useProductProjects();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? projects.filter((p) =>
          [p.name, p.client].filter(Boolean).some((v) => v!.toLowerCase().includes(needle)),
        )
      : projects;
    return [...list].sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }, [projects, q]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Product Library</h1>
        <p className="text-sm text-muted-foreground">
          Specify products on a project, reuse the studio library, issue datasheets and schedules.
        </p>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Link key={p.id} to={"/products/project/" + p.id} className="block">
              <Card className="h-full p-4 transition-colors hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{p.name}</p>
                  <Badge variant={p.itemCount > 0 ? "secondary" : "outline"} className="shrink-0">
                    {p.itemCount} {p.itemCount === 1 ? "item" : "items"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.client ?? "—"}</p>
                <p className="mt-3 text-sm tabular-nums">
                  {p.itemCount > 0 ? formatMoney(p.itemsValue) : "Ready to specify"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
