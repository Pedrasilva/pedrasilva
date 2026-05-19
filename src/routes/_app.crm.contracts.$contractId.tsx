/**
 * Stage 5A — Contract Generator Foundation
 * Stage 5B — Lifecycle + Revision Safety (UI hookup)
 *
 * Read-only by default. Clause edits + lifecycle actions are status-gated:
 *  - draft   → regenerate, issue, void; clauses editable
 *  - issued  → mark signed, create revision; clauses locked
 *  - signed  → create revision; clauses locked
 *  - superseded/void → no actions
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowLeft, FileSignature, RefreshCw, Send, Trash2, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useContract,
  useUpdateClauseContent,
  useRegenerateDraftContract,
  useIssueContract,
  useSignContract,
  useVoidContract,
  useCreateRevisionContract,
} from "@/lib/contracts";
import type { ContractRow } from "@/lib/contracts";

export const Route = createFileRoute("/_app/crm/contracts/$contractId")({
  component: ContractDetailPage,
});

function statusBadgeVariant(status: ContractRow["status"]) {
  switch (status) {
    case "draft":
      return "secondary" as const;
    case "issued":
      return "default" as const;
    case "signed":
      return "default" as const;
    case "superseded":
      return "outline" as const;
    case "void":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const { data, isLoading } = useContract(contractId);
  const updateClause = useUpdateClauseContent();
  const regenerate = useRegenerateDraftContract();
  const issue = useIssueContract();
  const sign = useSignContract();
  const voidIt = useVoidContract();
  const createRevision = useCreateRevisionContract();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;
  }

  const { contract, clauses, exhibits, events, lineage } = data;
  const isDraft = contract.status === "draft";
  const isIssued = contract.status === "issued";
  const isSigned = contract.status === "signed";
  const replacementId = contract.superseded_by_contract_id ?? null;
  const parentId = contract.parent_contract_id ?? null;

  const handleAction = (
    label: string,
    fn: () => Promise<{ contractId: string }>,
    confirmKey?: string,
    redirectToResult = false,
  ) => {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    fn()
      .then((res) => {
        toast.success(label);
        if (redirectToResult && res.contractId !== contract.id) {
          navigate({
            to: "/crm/contracts/$contractId",
            params: { contractId: res.contractId },
          });
        }
      })
      .catch((e: Error) => toast.error(e.message));
  };

  const busy =
    regenerate.isPending ||
    issue.isPending ||
    sign.isPending ||
    voidIt.isPending ||
    createRevision.isPending;

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
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-semibold tracking-tight">{contract.title}</h2>
            <Badge variant="outline">
              {t("contracts.detail.revisionBadge", { n: contract.revision_number ?? 1 })}
            </Badge>
            <Badge variant={statusBadgeVariant(contract.status)}>
              {t(`contracts.status.${contract.status}`)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {contract.contract_number ?? t("contracts.detail.noNumber")} ·{" "}
            {t(`contracts.kind.${contract.contract_kind}`)}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t("contracts.detail.generatedAt")}: {fmtDate(contract.generated_at)}
            </span>
            {contract.issued_at && (
              <span>
                {t("contracts.detail.issuedAt")}: {fmtDate(contract.issued_at)}
              </span>
            )}
            {contract.signed_at && (
              <span>
                {t("contracts.detail.signedAt")}: {fmtDate(contract.signed_at)}
              </span>
            )}
          </div>
          {(parentId || replacementId || (lineage && lineage.length > 1)) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {parentId && (
                <Link
                  to="/crm/contracts/$contractId"
                  params={{ contractId: parentId }}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  <GitBranch className="h-3 w-3" /> {t("contracts.detail.viewParent")}
                </Link>
              )}
              {replacementId && (
                <Link
                  to="/crm/contracts/$contractId"
                  params={{ contractId: replacementId }}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  <GitBranch className="h-3 w-3" /> {t("contracts.detail.viewReplacement")}
                </Link>
              )}
              {lineage && lineage.length > 1 && (
                <span className="text-muted-foreground">
                  {t("contracts.detail.lineageCount", { n: lineage.length })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Lifecycle actions */}
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  handleAction(
                    t("contracts.actions.regeneratedToast"),
                    () => regenerate.mutateAsync({ contractId: contract.id }),
                  )
                }
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {t("contracts.actions.regenerate")}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  handleAction(
                    t("contracts.actions.issuedToast"),
                    () => issue.mutateAsync({ contractId: contract.id }),
                    "contracts.actions.issueConfirm",
                  )
                }
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                {t("contracts.actions.issue")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  handleAction(
                    t("contracts.actions.voidedToast"),
                    () => voidIt.mutateAsync({ contractId: contract.id }),
                    "contracts.actions.voidConfirm",
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("contracts.actions.void")}
              </Button>
            </>
          )}
          {isIssued && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  handleAction(
                    t("contracts.actions.signedToast"),
                    () => sign.mutateAsync({ contractId: contract.id }),
                    "contracts.actions.signConfirm",
                  )
                }
              >
                <FileSignature className="h-3.5 w-3.5 mr-1" />
                {t("contracts.actions.sign")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  handleAction(
                    t("contracts.actions.revisionCreatedToast"),
                    () => createRevision.mutateAsync({ contractId: contract.id }),
                    undefined,
                    true,
                  )
                }
              >
                <GitBranch className="h-3.5 w-3.5 mr-1" />
                {t("contracts.actions.createRevision")}
              </Button>
            </>
          )}
          {isSigned && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                handleAction(
                  t("contracts.actions.revisionCreatedToast"),
                  () => createRevision.mutateAsync({ contractId: contract.id }),
                  undefined,
                  true,
                )
              }
            >
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              {t("contracts.actions.createRevision")}
            </Button>
          )}
        </div>
      </div>

      {!isDraft && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {isSigned
            ? t("contracts.detail.lockedSigned")
            : contract.status === "issued"
              ? t("contracts.detail.lockedIssued")
              : contract.status === "superseded"
                ? t("contracts.detail.lockedSuperseded")
                : t("contracts.detail.lockedVoid")}
        </div>
      )}

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
              <Row label={t("contracts.detail.issuedAt")} value={fmtDate(contract.issued_at)} />
              <Row label={t("contracts.detail.signedAt")} value={fmtDate(contract.signed_at)} />
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
              <Row
                label={t("contracts.detail.revision")}
                value={String(contract.revision_number ?? 1)}
              />
            </CardContent>
          </Card>

          {lineage && lineage.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("contracts.detail.lineageTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {lineage.map((rev) => (
                    <li key={rev.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-b-0">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">
                          {t("contracts.detail.revisionBadge", { n: rev.revision_number ?? 1 })}
                        </Badge>
                        <Badge variant={statusBadgeVariant(rev.status)}>
                          {t(`contracts.status.${rev.status}`)}
                        </Badge>
                        {rev.id === contract.id && (
                          <span className="text-xs text-muted-foreground">
                            · {t("contracts.detail.currentRevision")}
                          </span>
                        )}
                      </span>
                      {rev.id === contract.id ? (
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(rev.generated_at)}
                        </span>
                      ) : (
                        <Link
                          to="/crm/contracts/$contractId"
                          params={{ contractId: rev.id }}
                          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        >
                          {t("contracts.detail.openRevision")}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
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
