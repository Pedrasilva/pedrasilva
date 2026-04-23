import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";
import { NewCollaboratorDialog } from "@/components/NewCollaboratorDialog";
import {
  CollaboratorsTable,
  type CollabSortKey,
  type SortDir,
} from "@/components/hr/collaborators-table";
import { ArchiveCollaboratorDialog } from "@/components/hr/archive-collaborator-dialog";
import {
  useCollaboratorsList,
  useArchiveCollaborator,
  useRestoreCollaborator,
  type ArchiveStatus,
} from "@/lib/hr/use-collaborators";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, AlertTriangle } from "lucide-react";
import type { Collaborator } from "@/lib/salary";

export const Route = createFileRoute("/_app/hr/colaboradores")({
  component: () => (
    <PermissionGate permission="hr.colaboradores">
      <CollaboratorsListPage />
    </PermissionGate>
  ),
});

function CollaboratorsListPage() {
  const { t } = useTranslation(["hr", "glossary", "common"]);
  const [status, setStatus] = useState<ArchiveStatus>("active");
  const [department, setDepartment] = useState<"all" | "Projecto" | "Backoffice">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CollabSortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [archiveTarget, setArchiveTarget] = useState<Collaborator | null>(null);

  const list = useCollaboratorsList({ status });
  const archiveMut = useArchiveCollaborator();
  const restoreMut = useRestoreCollaborator();

  const filteredSorted = useMemo(() => {
    const all = list.data ?? [];
    const q = search.trim().toLowerCase();
    let rows = all.filter((c) => {
      if (department !== "all" && c.departamento !== department) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.numero_colaborador ?? "").toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const cmpStr = (av: string, bv: string) =>
        av.localeCompare(bv, "pt", { sensitivity: "base", numeric: true }) * dir;
      switch (sortKey) {
        case "nome":
          return cmpStr(a.nome, b.nome);
        case "departamento":
          return cmpStr(a.departamento, b.departamento) || a.nome.localeCompare(b.nome, "pt");
        case "numero": {
          const av = a.numero_colaborador ?? "";
          const bv = b.numero_colaborador ?? "";
          if (!av && !bv) return a.nome.localeCompare(b.nome, "pt");
          if (!av) return 1;
          if (!bv) return -1;
          return cmpStr(av, bv);
        }
        case "situacao": {
          const av = a.situacao_contractual ?? "";
          const bv = b.situacao_contractual ?? "";
          if (!av && !bv) return a.nome.localeCompare(b.nome, "pt");
          if (!av) return 1;
          if (!bv) return -1;
          return cmpStr(av, bv);
        }
        case "status": {
          const av = a.archived_at ? 1 : 0;
          const bv = b.archived_at ? 1 : 0;
          return (av - bv) * dir || a.nome.localeCompare(b.nome, "pt");
        }
      }
    });
    return rows;
  }, [list.data, department, search, sortKey, sortDir]);

  const handleSort = (k: CollabSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const handleArchive = (c: Collaborator) => setArchiveTarget(c);
  const handleRestore = (c: Collaborator) => {
    restoreMut.mutate(c.id, {
      onSuccess: () =>
        toast.success(t("hr:colaboradores.toast.restored", { name: c.nome })),
      onError: (e: Error) =>
        toast.error(e.message || t("hr:colaboradores.toast.error")),
    });
  };

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    archiveMut.mutate(
      { id: archiveTarget.id, reason },
      {
        onSuccess: () => {
          toast.success(
            t("hr:colaboradores.toast.archived", { name: archiveTarget.nome }),
          );
          setArchiveTarget(null);
        },
        onError: (e: Error) =>
          toast.error(e.message || t("hr:colaboradores.toast.error")),
      },
    );
  };

  const total = list.data?.length ?? 0;
  const isFiltered =
    department !== "all" || search.trim().length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("hr:colaboradores.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("hr:colaboradores.subtitle")}
          </p>
        </div>
        <NewCollaboratorDialog />
      </header>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t("hr:colaboradores.cardTitle")}
              </CardTitle>
              <CardDescription>
                {list.isPending
                  ? t("common:loading")
                  : t("hr:colaboradores.count", { count: total })}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("hr:colaboradores.filters.searchPlaceholder")}
                  className="h-9 w-[200px] pl-7"
                />
              </div>
              <Select
                value={department}
                onValueChange={(v) =>
                  setDepartment(v as typeof department)
                }
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("hr:colaboradores.filters.allDepartments")}
                  </SelectItem>
                  <SelectItem value="Projecto">
                    {t("hr:enums.department.Projecto")}
                  </SelectItem>
                  <SelectItem value="Backoffice">
                    {t("hr:enums.department.Backoffice")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ArchiveStatus)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {t("hr:colaboradores.filters.statusActive")}
                  </SelectItem>
                  <SelectItem value="archived">
                    {t("hr:colaboradores.filters.statusArchived")}
                  </SelectItem>
                  <SelectItem value="all">
                    {t("hr:colaboradores.filters.statusAll")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {list.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="flex items-center gap-2 p-6 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {(list.error as Error)?.message ?? t("common:errorTitle")}
            </div>
          ) : filteredSorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {total === 0
                ? t("hr:colaboradores.empty")
                : isFiltered
                  ? t("hr:colaboradores.noResults")
                  : t("hr:colaboradores.empty")}
            </div>
          ) : (
            <CollaboratorsTable
              rows={filteredSorted}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSort}
              onArchive={handleArchive}
              onRestore={handleRestore}
              busyId={
                archiveMut.isPending
                  ? archiveTarget?.id
                  : restoreMut.isPending
                    ? (restoreMut.variables as string | undefined) ?? null
                    : null
              }
            />
          )}
        </CardContent>
      </Card>

      <ArchiveCollaboratorDialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        collaborator={archiveTarget}
        pending={archiveMut.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
