import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GripVertical, Palette, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProductProjects } from "@/lib/products/use-products";
import { formatMoney } from "@/lib/products/types";
import { cn } from "@/lib/utils";
import {
  PROJECT_COLORS,
  PROJECT_COLOR_BORDER,
  PROJECT_COLOR_LABEL,
  PROJECT_COLOR_SWATCH,
  orderIds,
  useProjectBoard,
  type ProjectColor,
} from "@/lib/products/use-project-board";


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
  const board = useProjectBoard();
  const [dragId, setDragId] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const sorted = [...projects].sort(
      (a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name),
    );
    if (!board.hasCustomOrder) return sorted;
    const byId = new Map(sorted.map((p) => [p.id, p]));
    return orderIds(
      sorted.map((p) => p.id),
      board.order,
    )
      .map((id) => byId.get(id)!)
      .filter(Boolean);
  }, [projects, board.order, board.hasCustomOrder]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((p) =>
      [p.name, p.client].filter(Boolean).some((v) => v!.toLowerCase().includes(needle)),
    );
  }, [ordered, q]);


  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Product Library</h1>
        <p className="text-sm text-muted-foreground">
          Specify products on a project, reuse the studio library, issue datasheets and schedules.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects"
          />
        </div>
        {board.hasCustomOrder && (
          <Button variant="outline" size="sm" onClick={board.resetOrder}>
            Reset order
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const color = (board.colors[p.id] ?? "none") as ProjectColor;
            return (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) {
                    board.moveBefore(
                      rows.map((r) => r.id),
                      dragId,
                      p.id,
                    );
                  }
                  setDragId(null);
                }}
                className={cn("group relative", dragId === p.id && "opacity-50")}
              >
                <Card
                  className={cn(
                    "h-full border-l-4 p-4 transition-colors hover:border-primary/50",
                    PROJECT_COLOR_BORDER[color],
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={"/products/project/" + p.id}
                      className="min-w-0 flex-1 text-sm font-medium leading-tight hover:underline"
                    >
                      {p.name}
                    </Link>
                    <Badge variant={p.itemCount > 0 ? "secondary" : "outline"} className="shrink-0">
                      {p.itemCount} {p.itemCount === 1 ? "item" : "items"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.client ?? "—"}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <Link
                      to={"/products/project/" + p.id}
                      className="text-sm tabular-nums hover:underline"
                    >
                      {p.itemCount > 0 ? formatMoney(p.itemsValue) : "Ready to specify"}
                    </Link>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Colour">
                            <Palette className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {PROJECT_COLORS.map((c) => (
                            <DropdownMenuItem key={c} onSelect={() => board.setColor(p.id, c)}>
                              <span
                                className={cn(
                                  "mr-2 h-3 w-3 rounded-full border",
                                  PROJECT_COLOR_SWATCH[c],
                                )}
                              />
                              {PROJECT_COLOR_LABEL[c]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span
                        className="cursor-grab p-1.5 text-muted-foreground active:cursor-grabbing"
                        aria-label="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}
