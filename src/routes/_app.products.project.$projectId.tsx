import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LibraryBrowser } from "@/components/products/library-browser";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProjectItemsTable } from "@/components/products/project-items-table";
import { DatasheetPrintView } from "@/components/products/datasheet-sheet";
import {
  useAddLibraryProductToProject,
  useCreateProjectItem,
  useProductCategories,
  useProductProjects,
  useProjectItems,
} from "@/lib/products/use-products";
import { exportSchedule } from "@/lib/products/exports";
import { formatMoney, itemTotal } from "@/lib/products/types";

export const Route = createFileRoute("/_app/products/project/$projectId")({
  component: ProjectWorkspace,
  head: () => ({
    meta: [
      { title: "Project specification — PSA Product Library" },
      {
        name: "description",
        content:
          "Specify furniture and interior products for a PSA project and issue datasheets and a consolidated schedule.",
      },
      { property: "og:title", content: "Project specification — PSA Product Library" },
      {
        property: "og:description",
        content:
          "Specify furniture and interior products for a PSA project and issue datasheets and a consolidated schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProjectWorkspace() {
  const { projectId } = Route.useParams();
  const { data: items = [], isLoading } = useProjectItems(projectId);
  const { data: projects = [] } = useProductProjects();
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const { data: categories = [] } = useProductCategories();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const addFromLibrary = useAddLibraryProductToProject();
  const createItem = useCreateProjectItem();

  const [browseOpen, setBrowseOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const total = items.reduce((s, i) => s + itemTotal(i), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/products"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All projects
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            {project?.name ?? "Project specification"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[project?.client, `${items.length} items`, formatMoney(total)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add item
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setBrowseOpen(true)}>
                <Search className="mr-2 h-4 w-4" />
                Browse PSA library
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNewOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create new product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            onClick={() => {
              setPrinting(true);
              setTimeout(() => {
                window.print();
                setPrinting(false);
              }, 600);
            }}
          >
            <FileText className="mr-1.5 h-4 w-4" />
            Export datasheets
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            onClick={() => {
              try {
                exportSchedule(items, catMap, project?.name ?? "project");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            Export schedule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : (
        <ProjectItemsTable items={items} projectId={projectId} />
      )}

      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Browse PSA library</DialogTitle>
          </DialogHeader>
          <LibraryBrowser
            compact
            selectLabel="Add to project"
            onSelect={(product) =>
              addFromLibrary
                .mutateAsync({ product, projectId })
                .then(() => {
                  toast.success(`${product.name} added`);
                  setBrowseOpen(false);
                })
                .catch((e) => toast.error(String(e)))
            }
          />
        </DialogContent>
      </Dialog>

      <ProductFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        mode="project"
        onCreated={async (draft, saved) => {
          await createItem.mutateAsync({
            project_id: projectId,
            source_library_product_id: saved?.id ?? null,
            name: draft.name.trim(),
            category_id: draft.category_id,
            manufacturer: draft.manufacturer || null,
            designer: draft.designer || null,
            material_spec: draft.material_spec || null,
            dimensions: draft.dimensions || null,
            unit_price: draft.indicative_unit_price ? Number(draft.indicative_unit_price) : null,
            product_url: draft.product_url || null,
            primary_image_path: draft.primary_image_path,
            finish_image_path: draft.finish_image_path,
            notes: draft.notes || null,
            quantity: 1,
          });
          toast.success("Item added to the project");
        }}
      />

      {printing && (
        <div className="fixed inset-0 z-[100] overflow-auto bg-neutral-200 p-6">
          <DatasheetPrintView
            items={items}
            projectName={project?.name ?? ""}
            clientName={project?.client}
          />
        </div>
      )}
    </div>
  );
}
