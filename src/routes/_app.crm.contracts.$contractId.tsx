/**
 * Stage 5A — Contract Generator Foundation
 * Read-only contract detail shell. Editable clause content (draft only).
 * No PDF / e-sign / project bootstrap in this milestone.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useContract, useUpdateClauseContent } from "@/lib/contracts";

export const Route = createFileRoute("/_app/crm/contracts/$contractId")({
  component: ContractDetailPage,
});

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const { t } = useTranslation("crm");
  const { data, isLoading } = useContract(contractId);
  const updateClause = useUpdateClauseContent();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;
  }

  const { contract, clauses, exhibits, events } = data;
  const isDraft = contract.status === "draft";

  return (
    <div className="space-y-6">
      {contract.source_quote_id ? (
        <Link
          to="/crm/quotes/$quoteId"
          params={{ quoteId: contract.source_quote_id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> {t("contracts.detail.backToQuote")}
        </Link>
      ) : null}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{contract.title}</h2>
          <p className="text-sm text-muted-foreground">
            {contract.contract_number ?? t("contracts.detail.noNumber")} ·{" "}
            {t(`contracts.status.${contract.status}`)} ·{" "}
            {t(`contracts.kind.${contract.contract_kind}`)}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
          {contract.language} · {contract.currency}
        </span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("contracts.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="clauses">
            {t("contracts.tabs.clauses")} ({clauses.length})
          </TabsTrigger>
          <TabsTrigger value="exhibits">
            {t("contracts.tabs.exhibits")} ({exhibits.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            {t("contracts.tabs.events")} ({events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("contracts.detail.snapshotSummary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t("contracts.detail.generatedAt")} value={fmtDate(contract.generated_at)} />
              <Row
                label={t("contracts.detail.sourceQuote")}
                value={contract.source_quote_id ?? "—"}
              />
              <Row
                label={t("contracts.detail.sourceCompany")}
                value={contract.source_company_id ?? "—"}
              />
              <Row
                label={t("contracts.detail.resolverVersion")}
                value={contract.resolver_version}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clauses" className="mt-4 space-y-3">
          {clauses.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    {c.title}
                    {c.manual_override && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        · {t("contracts.clauses.manualBadge")}
                      </span>
                    )}
                  </CardTitle>
                  {isDraft && !isEditing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(c.id);
                        setDraftText(c.content);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={6}
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            updateClause.mutate(
                              {
                                contractId: contract.id,
                                clauseId: c.id,
                                content: draftText,
                              },
                              {
                                onSuccess: () => {
                                  toast.success(t("contracts.clauses.savedToast"));
                                  setEditingId(null);
                                },
                                onError: (e: Error) => toast.error(e.message),
                              },
                            );
                          }}
                          disabled={updateClause.isPending}
                        >
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {clauses.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("contracts.clauses.empty")}</p>
          )}
        </TabsContent>

        <TabsContent value="exhibits" className="mt-4 space-y-3">
          {exhibits.map((e) => (
            <Card key={e.id}>
              <CardHeader>
                <CardTitle className="text-sm">{e.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 rounded p-2 overflow-auto max-h-64">
                  {JSON.stringify(e.content_json, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
          {exhibits.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("contracts.exhibits.empty")}</p>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("contracts.events.empty")}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((ev) => (
                    <li key={ev.id} className="flex justify-between border-b pb-2">
                      <span>{t(`contracts.events.types.${ev.event_type}`, ev.event_type)}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(ev.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-PT");
  } catch {
    return iso;
  }
}
