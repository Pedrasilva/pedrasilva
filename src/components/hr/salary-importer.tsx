// HR-owned salary Excel importer (admin-only).
//
// Flow: upload → parse → preview headers + matches + skipped → confirm → result.
// All writes go through `importSalarySnapshots`, which appends new rows to
// `salary_snapshots` (immutability trigger blocks updates server-side).
//
// Salary is HR-owned. Payroll cash rows in the monthly finance sheets remain
// skipped — see src/lib/finance/import-reference.md §7.

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  RotateCcw,
} from "lucide-react";
import {
  DEFAULT_SALARY_HEADER_ALIASES,
  importSalarySnapshots,
  previewSalaryImport,
  type SalaryColumnKey,
  type SalaryPreviewResult,
  type SalaryImportResult,
} from "@/lib/finance/import-salary";

type ParsedFile = {
  file: File;
  workbook: XLSX.WorkBook;
};

const HEADER_KEYS_ORDER: SalaryColumnKey[] = [
  "nome",
  "email",
  "numero_colaborador",
  "valor_base",
  "subsidio_alimentacao_diario",
  "ss_atelier_pct",
  "ss_colaborador_pct",
  "irs_pct",
  "meses_pagos",
  "ajudas_custo_anual",
  "beneficio_carro",
  "beneficio_ticket",
  "premio_associado",
  "outros_beneficios",
  "beneficio_variavel",
  "effective_from",
  "notas",
];

export function SalaryImporter() {
  const { t } = useTranslation("hr");
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRowNum, setHeaderRowNum] = useState<number>(1); // 1-based
  const [defaultEff, setDefaultEff] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [createMissing, setCreateMissing] = useState(false);
  const [preview, setPreview] = useState<SalaryPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SalaryImportResult | null>(null);

  const reset = () => {
    setParsed(null);
    setSheetName("");
    setHeaderRowNum(1);
    setPreview(null);
    setResult(null);
  };

  const onFile = async (file: File | null) => {
    setPreview(null);
    setResult(null);
    if (!file) {
      setParsed(null);
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      setParsed({ file, workbook: wb });
      setSheetName(wb.SheetNames[0] ?? "");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Extract header + data rows for the chosen sheet/header row
  const extracted = useMemo(() => {
    if (!parsed || !sheetName) return null;
    const ws = parsed.workbook.Sheets[sheetName];
    if (!ws) return null;
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headerIdx = Math.max(0, headerRowNum - 1);
    const headerRow = (aoa[headerIdx] ?? []).map((v) => String(v ?? "").trim());
    const dataRows = aoa.slice(headerIdx + 1);
    return { headerRow, dataRows };
  }, [parsed, sheetName, headerRowNum]);

  const runPreview = async () => {
    if (!parsed || !extracted) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await previewSalaryImport({
        fileName: parsed.file.name,
        fileBlob: parsed.file,
        headerRow: extracted.headerRow,
        dataRows: extracted.dataRows,
        defaultEffectiveFrom: defaultEff,
        createMissing,
      });
      setPreview(r);
      if (r.status === "error") toast.error(r.message);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!parsed || !extracted) return;
    setBusy(true);
    try {
      const r = await importSalarySnapshots({
        fileName: parsed.file.name,
        fileBlob: parsed.file,
        headerRow: extracted.headerRow,
        dataRows: extracted.dataRows,
        defaultEffectiveFrom: defaultEff,
        createMissing,
      });
      setResult(r);
      if (r.status === "completed") {
        toast.success(
          t("salaryImport.toasts.completed", {
            inserted: r.inserted,
            skipped: r.skipped.length,
          }),
        );
        qc.invalidateQueries({ queryKey: ["collaborators"] });
        qc.invalidateQueries({ queryKey: ["salary-snapshots"] });
      } else if (r.status === "duplicate") {
        toast.warning(r.message);
      } else if (r.status === "error") {
        toast.error(r.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4" />
                {t("salaryImport.title")}
              </CardTitle>
              <CardDescription>{t("salaryImport.subtitle")}</CardDescription>
            </div>
            <Badge variant="secondary">{t("salaryImport.hrOwnedBadge")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="salary-import-file">{t("salaryImport.fields.file")}</Label>
              <Input
                id="salary-import-file"
                type="file"
                accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {t("salaryImport.fields.fileHint")}
              </p>
            </div>
            {parsed && (
              <div className="self-end">
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> {t("salaryImport.reset")}
                </Button>
              </div>
            )}
          </div>

          {parsed && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("salaryImport.fields.sheet")}</Label>
                <Select value={sheetName} onValueChange={setSheetName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {parsed.workbook.SheetNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary-header-row">{t("salaryImport.fields.headerRow")}</Label>
                <Input
                  id="salary-header-row"
                  type="number"
                  min={1}
                  value={headerRowNum}
                  onChange={(e) =>
                    setHeaderRowNum(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary-default-eff">
                  {t("salaryImport.fields.defaultEffectiveFrom")}
                </Label>
                <Input
                  id="salary-default-eff"
                  type="date"
                  value={defaultEff}
                  onChange={(e) => setDefaultEff(e.target.value)}
                />
              </div>
              <div className="md:col-span-3 flex items-center gap-2">
                <Checkbox
                  id="salary-create-missing"
                  checked={createMissing}
                  onCheckedChange={(v) => setCreateMissing(Boolean(v))}
                />
                <Label htmlFor="salary-create-missing" className="text-sm font-normal">
                  {t("salaryImport.fields.createMissing")}
                </Label>
              </div>
              <div className="md:col-span-3">
                <Button onClick={runPreview} disabled={busy || !extracted}>
                  <Upload className="h-4 w-4" />{" "}
                  {busy && !preview
                    ? t("salaryImport.previewing")
                    : t("salaryImport.previewButton")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && preview.status === "ready" && (
        <PreviewSection
          preview={preview}
          createMissing={createMissing}
          onConfirm={runImport}
          busy={busy}
          result={result}
        />
      )}

      {result && result.status === "duplicate" && (
        <Card>
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              <div className="font-medium">{result.message}</div>
              <div className="text-xs text-muted-foreground">
                {t("salaryImport.duplicateInfo", {
                  file: result.existing_import.file_name,
                  date: new Date(result.existing_import.imported_at).toLocaleString(),
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewSection({
  preview,
  createMissing,
  onConfirm,
  busy,
  result,
}: {
  preview: Extract<SalaryPreviewResult, { status: "ready" }>;
  createMissing: boolean;
  onConfirm: () => void;
  busy: boolean;
  result: SalaryImportResult | null;
}) {
  const { t } = useTranslation("hr");
  const resolvedKeys = HEADER_KEYS_ORDER.filter((k) => preview.headers[k] != null);
  const unresolvedKeys = HEADER_KEYS_ORDER.filter((k) => preview.headers[k] == null);

  const completed = result?.status === "completed" ? result : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("salaryImport.preview.title")}</CardTitle>
        <CardDescription>{t("salaryImport.preview.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resolved headers */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            {t("salaryImport.preview.resolvedHeaders")}{" "}
            <span className="text-muted-foreground">
              ({resolvedKeys.length}/{HEADER_KEYS_ORDER.length})
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {resolvedKeys.map((k) => (
              <Badge key={k} variant="secondary" className="font-mono text-[11px]">
                {k} → {preview.headerRow[preview.headers[k]!]}
              </Badge>
            ))}
            {unresolvedKeys.map((k) => (
              <Badge key={k} variant="outline" className="font-mono text-[11px] opacity-60">
                {k} —
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("salaryImport.preview.aliasHint", {
              keys: Object.keys(DEFAULT_SALARY_HEADER_ALIASES).length,
            })}
          </p>
        </section>

        {preview.duplicateOfImport && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              <div className="font-medium">{t("salaryImport.preview.duplicateTitle")}</div>
              <div className="text-xs text-muted-foreground">
                {t("salaryImport.duplicateInfo", {
                  file: preview.duplicateOfImport.file_name,
                  date: new Date(preview.duplicateOfImport.imported_at).toLocaleString(),
                })}
              </div>
            </div>
          </div>
        )}

        {/* Counts */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryTile
            label={t("salaryImport.preview.matchedCount")}
            count={preview.matches.length}
            tone="ok"
          />
          <SummaryTile
            label={t("salaryImport.preview.willCreateCount")}
            count={preview.willCreate.length}
            tone={createMissing ? "warn" : "muted"}
          />
          <SummaryTile
            label={t("salaryImport.preview.skippedCount")}
            count={preview.skipped.length}
            tone={preview.skipped.length > 0 ? "warn" : "muted"}
          />
        </div>

        {/* Matched */}
        {preview.matches.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("salaryImport.preview.matchedTitle")}</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("salaryImport.preview.cols.row")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.identifier")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.matchedTo")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.matchedBy")}</TableHead>
                    <TableHead className="text-right">
                      {t("salaryImport.preview.cols.base")}
                    </TableHead>
                    <TableHead>{t("salaryImport.preview.cols.effectiveFrom")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.matches.map((m) => (
                    <TableRow key={`m-${m.rowIndex}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.rowIndex + 1}
                      </TableCell>
                      <TableCell>{m.identifier}</TableCell>
                      <TableCell>{m.matchedLabel}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {m.matchedBy}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.valor_base.toLocaleString("pt-PT", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{m.effective_from}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* Will create */}
        {preview.willCreate.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("salaryImport.preview.willCreateTitle")}
            </h3>
            {!createMissing && (
              <p className="text-xs text-muted-foreground">
                {t("salaryImport.preview.willCreateDisabled")}
              </p>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("salaryImport.preview.cols.row")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.name")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.email")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.number")}</TableHead>
                    <TableHead className="text-right">
                      {t("salaryImport.preview.cols.base")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.willCreate.map((c) => (
                    <TableRow key={`c-${c.rowIndex}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.rowIndex + 1}
                      </TableCell>
                      <TableCell>{c.nome}</TableCell>
                      <TableCell className="text-xs">{c.email ?? "—"}</TableCell>
                      <TableCell className="text-xs">{c.numero_colaborador ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.valor_base.toLocaleString("pt-PT", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* Skipped */}
        {preview.skipped.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("salaryImport.preview.skippedTitle")}</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("salaryImport.preview.cols.row")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.identifier")}</TableHead>
                    <TableHead>{t("salaryImport.preview.cols.reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.skipped.map((s) => (
                    <TableRow key={`s-${s.rowIndex}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.rowIndex + 1}
                      </TableCell>
                      <TableCell>{s.identifier}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* Confirm */}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {t("salaryImport.preview.confirmHint", {
              insert: preview.matches.length + (createMissing ? preview.willCreate.length : 0),
              skip:
                preview.skipped.length +
                (createMissing ? 0 : preview.willCreate.length),
            })}
          </p>
          <Button
            onClick={onConfirm}
            disabled={
              busy ||
              !!completed ||
              preview.matches.length + (createMissing ? preview.willCreate.length : 0) === 0
            }
          >
            {busy
              ? t("salaryImport.importing")
              : completed
                ? t("salaryImport.imported")
                : t("salaryImport.confirmButton")}
          </Button>
        </div>

        {/* Result */}
        {completed && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div className="space-y-1">
              <div className="font-medium">
                {t("salaryImport.result.completedTitle")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("salaryImport.result.summary", {
                  inserted: completed.inserted,
                  created: completed.createdCollaborators,
                  skipped: completed.skipped.length,
                })}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                log id: {completed.log.id}
              </div>
              {completed.log.notes && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  {completed.log.notes}
                </pre>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "ok" | "warn" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
        : "border-border bg-muted/30 text-muted-foreground";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-2xl font-semibold tabular-nums">{count}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}
