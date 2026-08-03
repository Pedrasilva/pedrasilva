/**
 * Statement view — one component for bank accounts, clients and suppliers.
 *
 * Shape: opening balance -> dated entries in order -> running balance ->
 * closing balance, driven by `useStatement` (see use-statement.ts).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateInputWithPreview } from "@/components/finance/date-input-with-preview";
import {
  currentMonthRange,
  useStatement,
  useStatementEntities,
  type StatementEntityType,
} from "@/lib/finance/use-statement";

const ENTITY_TYPES: StatementEntityType[] = [
  "bank_account",
  "client",
  "supplier",
];

export type StatementViewProps = {
  /** Lock the statement to one entity (company detail pages). */
  lockedEntityType?: StatementEntityType;
  lockedEntityId?: string;
  lockedEntityLabel?: string;
  /** Start with the full ledger instead of the current month. */
  fullHistoryByDefault?: boolean;
};

/** Earliest sensible ledger start — covers all imported history. */
const FULL_HISTORY_START = "2000-01-01";

export function StatementView({
  lockedEntityType,
  lockedEntityId,
  lockedEntityLabel,
  fullHistoryByDefault,
}: StatementViewProps = {}) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const locked = !!(lockedEntityType && lockedEntityId);
  const initialRange = useMemo(
    () =>
      fullHistoryByDefault
        ? { from: FULL_HISTORY_START, to: new Date().toISOString().slice(0, 10) }
        : currentMonthRange(),
    [fullHistoryByDefault],
  );

  const [entityType, setEntityType] = useState<StatementEntityType>(
    lockedEntityType ?? "bank_account",
  );
  const [entityId, setEntityId] = useState<string | null>(
    lockedEntityId ?? null,
  );
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const entitiesQ = useStatementEntities(entityType);
  const entities = locked ? [] : (entitiesQ.data ?? []);
  const selectedId = locked
    ? lockedEntityId!
    : entityId && entities.some((e) => e.id === entityId)
      ? entityId
      : (entities[0]?.id ?? null);
  const selected = locked
    ? { id: lockedEntityId!, label: lockedEntityLabel ?? "" }
    : (entities.find((e) => e.id === selectedId) ?? null);

  const statementQ = useStatement(entityType, selectedId, from, to);
  const st = statementQ.data;

  const currency = st?.currency || "EUR";
  const fmt = (n: number) =>
    new Intl.NumberFormat(dateLocale, { style: "currency", currency }).format(n);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso + "T00:00:00"));

  const exportCsv = () => {
    if (!st) return;
    const head = [
      t("finance:statements.columns.date"),
      t("finance:statements.columns.reference"),
      t("finance:statements.columns.description"),
      t("finance:statements.columns.amount"),
      t("finance:statements.columns.balance"),
    ];
    const lines = [
      head.join(";"),
      ["", "", t("finance:statements.openingBalance"), "", st.openingBalance]
        .join(";"),
      ...st.entries.map((e) =>
        [e.date, e.reference, e.description.replace(/;/g, ","), e.amount, e.running].join(
          ";",
        ),
      ),
      ["", "", t("finance:statements.closingBalance"), "", st.closingBalance]
        .join(";"),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${selected?.label ?? "entity"}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("finance:statements.title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("finance:statements.subtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <div
            className={
              "grid gap-3 " + (locked ? "md:grid-cols-2" : "md:grid-cols-4")
            }
          >
            {!locked && (
              <>
                <div className="space-y-1">
                  <Label>{t("finance:statements.entityType")}</Label>
                  <Select
                    value={entityType}
                    onValueChange={(v) => {
                      setEntityType(v as StatementEntityType);
                      setEntityId(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`finance:statements.types.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>{t(`finance:statements.types.${entityType}`)}</Label>
                  <Select
                    value={selectedId ?? ""}
                    onValueChange={(v) => setEntityId(v)}
                    disabled={entities.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("finance:statements.selectEntity")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}


            <div className="space-y-1">
              <Label>{t("finance:statements.from")}</Label>
              <DateInputWithPreview
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("finance:statements.to")}</Label>
              <DateInputWithPreview
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const r = currentMonthRange();
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {t("finance:statements.thisMonth")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const y = new Date().getFullYear();
                setFrom(`${y}-01-01`);
                setTo(`${y}-12-31`);
              }}
            >
              {t("finance:statements.thisYear")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(FULL_HISTORY_START);
                setTo(new Date().toISOString().slice(0, 10));
              }}
            >
              {t("finance:statements.fullHistory")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!st}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("finance:statements.exportCsv")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {statementQ.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {(statementQ.error as Error).message}
          </CardContent>
        </Card>
      )}

      {st && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryTile
              label={t("finance:statements.openingBalance")}
              value={fmt(st.openingBalance)}
            />
            <SummaryTile
              label={t(
                entityType === "bank_account"
                  ? "finance:statements.totalIn"
                  : entityType === "client"
                    ? "finance:statements.invoiced"
                    : "finance:statements.purchased",
              )}
              value={fmt(st.totalIn)}
            />
            <SummaryTile
              label={t(
                entityType === "bank_account"
                  ? "finance:statements.totalOut"
                  : "finance:statements.settled",
              )}
              value={fmt(st.totalOut)}
            />
            <SummaryTile
              label={t("finance:statements.closingBalance")}
              value={fmt(st.closingBalance)}
              strong
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selected?.label} · {fmtDate(from)} – {fmtDate(to)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">
                      {t("finance:statements.columns.date")}
                    </TableHead>
                    <TableHead className="w-[140px]">
                      {t("finance:statements.columns.reference")}
                    </TableHead>
                    <TableHead>
                      {t("finance:statements.columns.description")}
                    </TableHead>
                    <TableHead className="w-[140px] text-right">
                      {t("finance:statements.columns.amount")}
                    </TableHead>
                    <TableHead className="w-[150px] text-right">
                      {t("finance:statements.columns.balance")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={4} className="font-medium">
                      {t("finance:statements.openingBalance")}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmt(st.openingBalance)}
                    </TableCell>
                  </TableRow>

                  {st.entries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {t("finance:statements.empty")}
                      </TableCell>
                    </TableRow>
                  )}

                  {st.entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="tabular-nums">
                        {fmtDate(e.date)}
                      </TableCell>
                      <TableCell>
                        {e.documentId ? (
                          <Link
                            to="/finance/documents/$documentId"
                            params={{ documentId: e.documentId }}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {e.reference || t("finance:statements.document")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {e.reference || "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[420px] truncate">
                        <span className="mr-2">
                          <Badge variant="outline" className="text-[10px]">
                            {t(`finance:statements.kind.${e.kind}`)}
                          </Badge>
                        </span>
                        {e.description}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right tabular-nums " +
                          (e.amount < 0 ? "text-destructive" : "")
                        }
                      >
                        {fmt(e.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(e.running)}
                      </TableCell>
                    </TableRow>
                  ))}

                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={4} className="font-semibold">
                      {t("finance:statements.closingBalance")}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(st.closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={
            "mt-1 tabular-nums " +
            (strong ? "text-xl font-semibold" : "text-lg font-medium")
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
