import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Trash2, Archive, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/admin/quotes-trash")({
  head: () => ({ meta: [{ title: "Proposal recovery | PSA Hub" }, { name: "description", content: "Recover archived and deleted proposals in PSA Hub." }, { property: "og:title", content: "Proposal recovery | PSA Hub" }, { property: "og:description", content: "Recover archived and deleted proposals in PSA Hub." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: QuotesTrashPage,
});

type TrashRow = {
  id: string;
  titulo: string | null;
  proposal_number: string | null;
  revision_number: number | null;
  valor: number | null;
  updated_at: string | null;
  deleted_at: string | null;
  archived_at: string | null;
  opportunity_id: string | null;
  opportunity: { id: string; name: string | null } | null;
  company: { id: string; nome: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(uiI18n.language); } catch { return iso; }
}

function QuotesTrashPage() {
  useTranslation();
  const qc = useQueryClient();
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);
  const [purgeText, setPurgeText] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin_quotes_trash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select(
          "id, titulo, proposal_number, revision_number, valor, updated_at, deleted_at, archived_at, opportunity_id, opportunity:crm_opportunities(id, name), company:companies(id, nome)"
        )
        .or("deleted_at.not.is.null,archived_at.not.is.null")
        .order("deleted_at", { ascending: false, nullsFirst: false })
        .order("archived_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as TrashRow[];
    },
  });

  const restoreDeleted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("restore_fee_proposal", { _proposal_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("crm:quoteEditor.quoteRestored"));
      qc.invalidateQueries({ queryKey: ["admin_quotes_trash"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unarchive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fee_proposals")
        .update({ archived_at: null, archived_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("crm:quoteEditor.unarchived"));
      qc.invalidateQueries({ queryKey: ["admin_quotes_trash"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("hard_purge_fee_proposal", {
        _proposal_id: id,
        _note: "Purged from admin trash UI",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("crm:quoteEditor.quotePurged"));
      setPurgeTarget(null);
      setPurgeText("");
      qc.invalidateQueries({ queryKey: ["admin_quotes_trash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleted = rows.filter((r) => r.deleted_at);
  const archived = rows.filter((r) => !r.deleted_at && r.archived_at);

  const renderRow = (r: TrashRow, kind: "deleted" | "archived") => (
    <div
      key={r.id}
      className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{r.titulo ?? uiI18n.t("common:untitled")}</span>
          {r.proposal_number && (
            <Badge variant="outline" className="text-[10px]">
              {r.proposal_number}{r.revision_number ? uiI18n.t("crm:quoteEditor.revisionSuffix", { value1: r.revision_number }) : ""}
            </Badge>
          )}
          {kind === "deleted" ? (
            <Badge variant="destructive" className="text-[10px]"><Trash2 className="mr-1 h-3 w-3" /> {uiI18n.t("common:deleted")} </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]"><Archive className="mr-1 h-3 w-3" /> {uiI18n.t("common:archived")} </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {r.company?.nome ?? "—"}
          {r.opportunity?.name ? ` · ${r.opportunity.name}` : ""}
          {" · "}
          {kind === "deleted"
            ? uiI18n.t("crm:quoteEditor.deletedOn", { value1: fmtDate(r.deleted_at) })
            : uiI18n.t("crm:quoteEditor.archivedOn", { value1: fmtDate(r.archived_at) })}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => (kind === "deleted" ? restoreDeleted.mutate(r.id) : unarchive.mutate(r.id))}
          disabled={restoreDeleted.isPending || unarchive.isPending}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("common:restore")} </Button>
        {kind === "deleted" && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { setPurgeTarget(r); setPurgeText(""); }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.deletePermanently")} </Button>
        )}
      </div>
    </div>
  );

  return (
    <AdminOnly>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="space-y-2">
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />  {uiI18n.t("common:administration")} </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trash2 className="h-6 w-6" />  {uiI18n.t("crm:quoteEditor.quoteTrash")} </h1>
          <p className="text-sm text-muted-foreground">
             {uiI18n.t("crm:quoteEditor.quoteTrashHint")} </p>
        </div>

        <Tabs defaultValue="deleted">
          <TabsList>
            <TabsTrigger value="deleted">
               {uiI18n.t("crm:quoteEditor.deletedPlural")} <Badge variant="secondary" className="ml-2">{deleted.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="archived">
               {uiI18n.t("crm:quoteEditor.archivedPlural")} <Badge variant="secondary" className="ml-2">{archived.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deleted" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base"> {uiI18n.t("crm:quoteEditor.deletedQuotes")} </CardTitle>
                <CardDescription>
                   {uiI18n.t("crm:quoteEditor.restoreQuoteHint")} </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>
                ) : deleted.length === 0 ? (
                  <div className="text-sm text-muted-foreground"> {uiI18n.t("crm:quoteEditor.noDeletedQuotes")} </div>
                ) : (
                  deleted.map((r) => renderRow(r, "deleted"))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base"> {uiI18n.t("crm:quoteEditor.archivedQuotes")} </CardTitle>
                <CardDescription>
                   {uiI18n.t("crm:quoteEditor.archivedQuotesHint")} </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>
                ) : archived.length === 0 ? (
                  <div className="text-sm text-muted-foreground"> {uiI18n.t("crm:quoteEditor.noArchivedQuotes")} </div>
                ) : (
                  archived.map((r) => renderRow(r, "archived"))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!purgeTarget} onOpenChange={(o) => { if (!o) { setPurgeTarget(null); setPurgeText(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />  {uiI18n.t("crm:quoteEditor.purgePrompt")} </AlertDialogTitle>
              <AlertDialogDescription>
                 {uiI18n.t("crm:quoteEditor.purgePrefix")} <strong>{purgeTarget?.titulo ?? ""}</strong>  {uiI18n.t("crm:quoteEditor.purgeSuffix")} <div className="mt-1 font-mono text-xs">{purgeTarget?.titulo ?? ""}</div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={purgeText}
              onChange={(e) => setPurgeText(e.target.value)}
              placeholder={uiI18n.t("crm:quoteEditor.exactTitleHint")}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={purge.isPending}> {uiI18n.t("common:cancel")} </AlertDialogCancel>
              <AlertDialogAction
                disabled={purge.isPending || purgeText.trim() !== (purgeTarget?.titulo ?? "").trim() || !purgeTarget}
                onClick={() => purgeTarget && purge.mutate(purgeTarget.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                 {uiI18n.t("crm:quoteEditor.deletePermanently")} </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminOnly>
  );
}
