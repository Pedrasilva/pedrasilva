import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
/**
 * Admin-only Excel import card for canonical `companies` (suppliers/clients).
 *
 * Used inside SuppliersMasterData / ClientsMasterData. Upload → preview →
 * commit. No documents/payments — master data only.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from '@/lib/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadAndPreviewCompanies,
  commitCompaniesImport,
  type ImportKind,
  type ImportPreview,
} from "@/lib/finance/imports/companies-importer";

const ACTION_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  create: { label: "finance:companyImport.actions.create", variant: "default" },
  update: { label: "finance:companyImport.actions.update", variant: "secondary" },
  skip: { label: "finance:companyImport.actions.skip", variant: "outline" },
  conflict: { label: "finance:companyImport.actions.conflict", variant: "destructive" },
  invalid: { label: "finance:companyImport.actions.invalid", variant: "destructive" },
};

export function CompaniesImportCard({ kind }: { kind: ImportKind }) {
  const { isAdmin } = useAuth();
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [includeConflicts, setIncludeConflicts] = useState(false);
  const [overwriteCodes, setOverwriteCodes] = useState(false);

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(uiI18n.t("finance:companyImport.selectFile"));
      return uploadAndPreviewCompanies(file, kind);
    },
    onSuccess: (p) => {
      setPreview(p);
      toast.success(uiI18n.t("finance:companyImport.parsed", { count: p.totals.rows }));
      if (p.storageWarning) toast.warning(uiI18n.t("finance:companyImport.storageWarning", { message: p.storageWarning }));
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error(uiI18n.t("finance:companyImport.previewFirst"));
      return commitCompaniesImport(preview, { includeConflicts, overwriteExistingCodes: overwriteCodes });
    },
    onSuccess: (r) => {
      toast.success(uiI18n.t("finance:companyImport.result", { created: r.created, updated: r.updated, skipped: r.skipped + r.conflicts, errors: r.invalid }));
      setPreview(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["finance", "suppliers-master"] });
      qc.invalidateQueries({ queryKey: ["finance", "clients-master"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  if (!isAdmin) return null;

  const title = kind === "supplier"
    ? uiI18n.t("finance:companyImport.supplierTitle")
    : uiI18n.t("finance:companyImport.clientTitle");
  const subtitle = kind === "supplier"
    ? uiI18n.t("finance:companyImport.hint")
    : uiI18n.t("finance:companyImport.hint");

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="size-4" /> {title}
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="grid w-full sm:max-w-sm items-center gap-1.5">
            <Label htmlFor={`file-${kind}`}> {uiI18n.t("finance:companyImport.file")} </Label>
            <Input
              id={`file-${kind}`}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
            />
          </div>
          <Button
            onClick={() => previewMut.mutate()}
            disabled={!file || previewMut.isPending}
            variant="secondary"
          >
            {previewMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
             {uiI18n.t("common:preview")} </Button>
        </div>

        {preview && (
          <>
            <div className="flex flex-wrap gap-3 text-xs">
              <Badge variant="outline">{t("finance:companyImport.rowsLabel", { count: preview.totals.rows })}</Badge>
              <Badge variant="default">{t("finance:companyImport.createLabel", { count: preview.totals.create })}</Badge>
              <Badge variant="secondary">{t("finance:companyImport.updateLabel", { count: preview.totals.update })}</Badge>
              <Badge variant="destructive">{t("finance:companyImport.conflictsLabel", { count: preview.totals.conflict })}</Badge>
              <Badge variant="destructive">{t("finance:companyImport.invalidLabel", { count: preview.totals.invalid })}</Badge>
            </div>

            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              <span className="font-medium"> {uiI18n.t("finance:companyImport.columns")} </span>
              {Object.entries(preview.detectedHeaders).map(([k, v]) => (
                <span key={k} className="ml-2">
                  {k}: <span className="font-mono">{v ?? "—"}</span>
                </span>
              ))}
            </div>

            <div className="border rounded-md max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-24"> {uiI18n.t("common:actions")} </TableHead>
                    <TableHead> {uiI18n.t("glossary:entity.company")} </TableHead>
                    <TableHead>NIF</TableHead>
                    <TableHead> {uiI18n.t("common:code")} </TableHead>
                    <TableHead> {uiI18n.t("finance:companyImport.match")} </TableHead>
                    <TableHead> {uiI18n.t("finance:companyImport.warnings")} </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((r) => {
                    const b = ACTION_BADGE[r.action];
                    return (
                      <TableRow key={r.parsed.rowNumber}>
                        <TableCell className="text-xs text-muted-foreground">{r.parsed.rowNumber}</TableCell>
                        <TableCell>
                          <Badge variant={b.variant} className="text-[10px]">{t(b.label)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.parsed.nome ?? "—"}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.parsed.nif ?? "—"}
                          {r.parsed.nif && !r.parsed.nifValid && (
                            <span className="ml-1 text-destructive">⚠</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.parsed.code ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.matchedCompany ? (
                            <>
                              {r.matchedCompany.nome}
                              <span className="text-muted-foreground"> {t("finance:companyImport.matchedBy", { method: r.matchedBy })}</span>
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.errors.length > 0 && (
                            <div className="text-destructive flex items-center gap-1">
                              <AlertTriangle className="size-3" /> {r.errors.join("; ")}
                            </div>
                          )}
                          {r.warnings.length > 0 && (
                            <div className="text-amber-600 dark:text-amber-400">{r.warnings.join("; ")}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-2">
              {preview.totals.conflict > 0 && (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={includeConflicts}
                    onCheckedChange={(v) => setIncludeConflicts(v === true)}
                  />
                   {uiI18n.t("finance:companyImport.includeConflicts")} </label>
              )}
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={overwriteCodes}
                  onCheckedChange={(v) => setOverwriteCodes(v === true)}
                />
                 {uiI18n.t("finance:companyImport.overwriteCodes")} </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setPreview(null); setFile(null); }}>
                 {uiI18n.t("common:cancel")} </Button>
              <Button
                onClick={() => commitMut.mutate()}
                disabled={commitMut.isPending || (preview.totals.create + preview.totals.update === 0 && !includeConflicts)}
              >
                {commitMut.isPending ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4 mr-1" />
                )}
                 {uiI18n.t("finance:companyImport.confirm")} </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
