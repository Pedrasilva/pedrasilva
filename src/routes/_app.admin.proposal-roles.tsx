import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Archive, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { useProposalRoles, proposalRoleKeys, type ProposalRole } from "@/lib/proposal-roles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/admin/proposal-roles")({
  component: ProposalRolesAdminPage,
});

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ProposalRolesAdminPage() {
  const { i18n } = useTranslation();
  const isPt = i18n.language?.startsWith("pt");
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useProposalRoles({ includeArchived: true });

  const [labelEn, setLabelEn] = useState("");
  const [labelPt, setLabelPt] = useState("");
  const [seniority, setSeniority] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: proposalRoleKeys.all });

  const create = useMutation({
    mutationFn: async () => {
      const en = labelEn.trim();
      const pt = labelPt.trim() || en;
      if (!en) throw new Error("Label is required");
      const code = slug(en);
      if (!code) throw new Error("Invalid code");
      const maxSort = roles.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const sen = seniority.trim() === "" ? null : Number(seniority);
      if (sen != null && (Number.isNaN(sen) || sen < 0 || sen > 100))
        throw new Error("Seniority must be 0–100");
      const { error } = await supabase.from("proposal_roles").insert({
        code,
        label_en: en,
        label_pt: pt,
        default_seniority: sen,
        sort_order: maxSort + 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isPt ? "Título criado" : "Title created");
      setLabelEn("");
      setLabelPt("");
      setSeniority("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (r: ProposalRole) => {
      const { error } = await supabase
        .from("proposal_roles")
        .update({
          label_en: r.label_en,
          label_pt: r.label_pt,
          default_seniority: r.default_seniority,
          sort_order: r.sort_order,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isPt ? "Guardado" : "Saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("proposal_roles")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposal_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isPt ? "Eliminado" : "Deleted");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("foreign key")
          ? isPt
            ? "Em uso — arquive em vez de eliminar."
            : "In use — archive instead of deleting."
          : e.message,
      ),
  });

  return (
    <AdminOnly>
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              {isPt ? "Voltar à administração" : "Back to admin"}
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isPt ? "Títulos / Funções comerciais" : "Titles / Commercial Roles"}</CardTitle>
            <CardDescription>
              {isPt
                ? "Catálogo de títulos usados nas fichas dos colaboradores e nas propostas. As horas e valores no Quote Builder são apresentados por título, nunca pelo nome do colaborador."
                : "Catalog of titles used on team member profiles and in proposals. Hours and sale values in the Quote Builder are presented by title, never by collaborator name."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>{isPt ? "Título (EN)" : "Title (EN)"}</Label>
                <Input
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  placeholder="e.g. Project Lead"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? "Título (PT)" : "Title (PT)"}</Label>
                <Input
                  value={labelPt}
                  onChange={(e) => setLabelPt(e.target.value)}
                  placeholder={isPt ? "ex.: Líder de Projeto" : "e.g. Líder de Projeto"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? "Senioridade (0–100)" : "Seniority (0–100)"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  placeholder="50"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !labelEn.trim()}
                  className="w-full"
                >
                  <Plus className="h-4 w-4" />
                  {isPt ? "Adicionar título" : "Add title"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isPt ? "Catálogo" : "Catalog"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{isPt ? "Ordem" : "Order"}</TableHead>
                    <TableHead>{isPt ? "Título (EN)" : "Title (EN)"}</TableHead>
                    <TableHead>{isPt ? "Título (PT)" : "Title (PT)"}</TableHead>
                    <TableHead className="w-28">{isPt ? "Senioridade" : "Seniority"}</TableHead>
                    <TableHead className="w-40 text-right">{isPt ? "Ações" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r) => (
                    <RoleRow
                      key={r.id}
                      role={r}
                      onSave={(next) => update.mutate(next)}
                      onArchive={(archived) => archive.mutate({ id: r.id, archived })}
                      onDelete={() => remove.mutate(r.id)}
                    />
                  ))}
                  {roles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        {isPt ? "Sem títulos." : "No titles yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminOnly>
  );
}

function RoleRow({
  role,
  onSave,
  onArchive,
  onDelete,
}: {
  role: ProposalRole;
  onSave: (r: ProposalRole) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const { i18n } = useTranslation();
  const isPt = i18n.language?.startsWith("pt");
  const [draft, setDraft] = useState<ProposalRole>(role);
  const dirty =
    draft.label_en !== role.label_en ||
    draft.label_pt !== role.label_pt ||
    draft.default_seniority !== role.default_seniority ||
    draft.sort_order !== role.sort_order;
  const archived = !!role.archived_at;

  return (
    <TableRow className={archived ? "opacity-60" : undefined}>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-16 tabular-nums"
          value={draft.sort_order}
          onChange={(e) =>
            setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
          }
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          value={draft.label_en}
          onChange={(e) => setDraft({ ...draft, label_en: e.target.value })}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            className="h-8"
            value={draft.label_pt}
            onChange={(e) => setDraft({ ...draft, label_pt: e.target.value })}
          />
          {archived && (
            <Badge variant="secondary">{isPt ? "Arquivado" : "Archived"}</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          className="h-8 w-20 tabular-nums"
          value={draft.default_seniority ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              default_seniority:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!dirty}
            onClick={() => onSave(draft)}
            title={isPt ? "Guardar" : "Save"}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(!archived)}
            title={archived ? (isPt ? "Restaurar" : "Restore") : (isPt ? "Arquivar" : "Archive")}
          >
            {archived ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  isPt
                    ? "Eliminar definitivamente? Use Arquivar se o título estiver em uso."
                    : "Delete permanently? Use Archive if this title is in use.",
                )
              ) {
                onDelete();
              }
            }}
            title={isPt ? "Eliminar" : "Delete"}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
