import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Archive, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from '@/lib/toast';
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
  head: () => ({ meta: [{ title: "Commercial titles | PSA Hub" }, { name: "description", content: "Manage commercial titles used in proposals in PSA Hub." }, { property: "og:title", content: "Commercial titles | PSA Hub" }, { property: "og:description", content: "Manage commercial titles used in proposals in PSA Hub." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
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
      if (!en) throw new Error(uiI18n.t("crm:quoteEditor.labelRequired"));
      const code = slug(en);
      if (!code) throw new Error(uiI18n.t("crm:quoteEditor.invalidCode"));
      const maxSort = roles.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const sen = seniority.trim() === "" ? null : Number(seniority);
      if (sen != null && (Number.isNaN(sen) || sen < 0 || sen > 100))
        throw new Error(uiI18n.t("crm:quoteEditor.seniorityInvalid"));
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
      toast.success(uiI18n.t("crm:quoteEditor.titleCreated"));
      setLabelEn("");
      setLabelPt("");
      setSeniority("");
      invalidate();
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  const update = useMutation({
    mutationFn: async (r: ProposalRole) => {
      const { error } = await supabase
        .from("proposal_roles")
        .update({
          label_en: r.label_en,
          label_pt: r.label_pt,
          default_seniority: r.default_seniority,
          hourly_rate: r.hourly_rate,
          sort_order: r.sort_order,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("common:saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
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
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposal_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("common:deleted"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        translateError(e.message).includes("foreign key")
          ? isPt
            ? uiI18n.t("crm:quoteEditor.titleInUse")
            : uiI18n.t("crm:quoteEditor.titleInUse")
          : translateError(e.message),
      ),
  });

  return (
    <AdminOnly>
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              {uiI18n.t("crm:quoteEditor.backAdmin")}
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{uiI18n.t("crm:quoteEditor.commercialTitles")}</CardTitle>
            <CardDescription>
              {isPt
                ? uiI18n.t("crm:quoteEditor.commercialTitlesHint")
                : uiI18n.t("crm:quoteEditor.commercialTitlesHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>{uiI18n.t("crm:quoteEditor.titleEn")}</Label>
                <Input
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  placeholder={uiI18n.t("crm:quoteEditor.titleEnHint")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{uiI18n.t("crm:quoteEditor.titlePt")}</Label>
                <Input
                  value={labelPt}
                  onChange={(e) => setLabelPt(e.target.value)}
                  placeholder={uiI18n.t("crm:quoteEditor.titlePtHint")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{uiI18n.t("crm:quoteEditor.seniorityRange")}</Label>
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
                  {uiI18n.t("crm:quoteEditor.addTitle")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiI18n.t("crm:quoteEditor.catalogue")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{uiI18n.t("common:order")}</TableHead>
                    <TableHead>{uiI18n.t("crm:quoteEditor.titleEn")}</TableHead>
                    <TableHead>{uiI18n.t("crm:quoteEditor.titlePt")}</TableHead>
                    <TableHead className="w-28">{uiI18n.t("crm:quoteEditor.seniority")}</TableHead>
                    <TableHead className="w-32 text-right">{uiI18n.t("glossary:financial.costRate")}</TableHead>
                    <TableHead className="w-40 text-right">{uiI18n.t("common:actions")}</TableHead>
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
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        {uiI18n.t("crm:quoteEditor.noTitlesYet")}
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
    Number(draft.hourly_rate) !== Number(role.hourly_rate) ||
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
            <Badge variant="secondary">{uiI18n.t("common:archived")}</Badge>
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
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            min={0}
            step="0.01"
            className="h-8 w-24 tabular-nums text-right"
            value={draft.hourly_rate ?? 0}
            onChange={(e) =>
              setDraft({
                ...draft,
                hourly_rate: Number(e.target.value) || 0,
              })
            }
          />
          <span className="text-muted-foreground text-xs">€</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!dirty}
            onClick={() => onSave(draft)}
            title={uiI18n.t("common:save")}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(!archived)}
            title={archived ? (uiI18n.t("common:restore")) : (uiI18n.t("common:archive"))}
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
                    ? uiI18n.t("crm:quoteEditor.deleteTitlePrompt")
                    : uiI18n.t("crm:quoteEditor.deleteTitlePrompt"),
                )
              ) {
                onDelete();
              }
            }}
            title={uiI18n.t("common:delete")}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
