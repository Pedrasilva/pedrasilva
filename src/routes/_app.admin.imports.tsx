import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  uploadAndPreviewAccelo,
  commitAcceloImport,
  listImportJobs,
  type ImportPreview,
} from "@/lib/imports/accelo-importer";

export const Route = createFileRoute("/_app/admin/imports")({
  component: ImportsPage,
});

type ImportTypeKey = "accelo_activity_timesheet" | "companies_clients_suppliers";

function ImportsPage() {
  return (
    <AdminOnly>
      <ImportsContent />
    </AdminOnly>
  );
}

function ImportsContent() {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const [importType, setImportType] = useState<ImportTypeKey>("accelo_activity_timesheet");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [createMissingProjects, setCreateMissingProjects] = useState(false);
  const [createMissingCompanies, setCreateMissingCompanies] = useState(true);

  const jobsQuery = useQuery({ queryKey: ["import-jobs"], queryFn: listImportJobs });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      if (importType !== "accelo_activity_timesheet") {
        throw new Error("This import type is not implemented yet");
      }
      return uploadAndPreviewAccelo(file);
    },
    onSuccess: (p) => {
      setPreview(p);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      toast.success(t("admin.imports.toastPreviewed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview");
      return commitAcceloImport(preview, { createMissingProjects, createMissingCompanies });
    },
    onSuccess: (r) => {
      toast.success(
        t("admin.imports.toastImported", {
          imported: r.imported,
          skipped: r.skipped,
          errors: r.errors,
        }),
      );
      setPreview(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasErrors = preview && preview.totals.error > 0;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.imports.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.imports.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> {t("admin.imports.newImport")}
          </CardTitle>
          <CardDescription>{t("admin.imports.newImportSub")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.imports.importType")}</Label>
              <Select value={importType} onValueChange={(v) => setImportType(v as ImportTypeKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="accelo_activity_timesheet">
                    {t("admin.imports.types.acceloActivity")}
                  </SelectItem>
                  <SelectItem value="companies_clients_suppliers" disabled>
                    {t("admin.imports.types.companies")} ({t("admin.imports.comingSoon")})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.imports.file")}</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
            </div>
          </div>
          <Button
            onClick={() => previewMutation.mutate()}
            disabled={!file || previewMutation.isPending}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {previewMutation.isPending ? t("admin.imports.parsing") : t("admin.imports.preview")}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.imports.previewTitle")}</CardTitle>
            <CardDescription>{preview.filename}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <Stat label={t("admin.imports.stats.rows")} value={preview.totals.rows} />
              <Stat label={t("admin.imports.stats.valid")} value={preview.totals.valid} tone="success" />
              <Stat label={t("admin.imports.stats.warnings")} value={preview.totals.warning} tone="warning" />
              <Stat label={t("admin.imports.stats.errors")} value={preview.totals.error} tone="error" />
              <Stat label={t("admin.imports.stats.duplicates")} value={preview.totals.duplicates} />
            </div>

            {preview.unmatched.collaborators.length > 0 && (
              <Section
                tone="error"
                title={t("admin.imports.unmatched.collaborators", {
                  count: preview.unmatched.collaborators.length,
                })}
                hint={t("admin.imports.unmatched.collaboratorsHint")}
              >
                <ul className="text-sm list-disc pl-5">
                  {preview.unmatched.collaborators.slice(0, 20).map((c) => (
                    <li key={c.email ?? c.name}>
                      {c.name} {c.email ? <span className="text-muted-foreground">&lt;{c.email}&gt;</span> : null}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {preview.unmatched.projects.length > 0 && (
              <Section
                tone="warning"
                title={t("admin.imports.unmatched.projects", { count: preview.unmatched.projects.length })}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-projects"
                    checked={createMissingProjects}
                    onCheckedChange={(v) => setCreateMissingProjects(!!v)}
                  />
                  <Label htmlFor="create-projects" className="text-sm">
                    {t("admin.imports.createMissingProjects")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {preview.unmatched.projects.slice(0, 30).join(", ")}
                  {preview.unmatched.projects.length > 30 ? "…" : ""}
                </p>
              </Section>
            )}

            {preview.unmatched.companies.length > 0 && (
              <Section
                tone="warning"
                title={t("admin.imports.unmatched.companies", { count: preview.unmatched.companies.length })}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-companies"
                    checked={createMissingCompanies}
                    onCheckedChange={(v) => setCreateMissingCompanies(!!v)}
                  />
                  <Label htmlFor="create-companies" className="text-sm">
                    {t("admin.imports.createMissingCompanies")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {preview.unmatched.companies.slice(0, 30).join(", ")}
                  {preview.unmatched.companies.length > 30 ? "…" : ""}
                </p>
              </Section>
            )}

            <RowsPreviewTable preview={preview} />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                {t("admin.imports.cancel")}
              </Button>
              <Button onClick={() => commitMutation.mutate()} disabled={!!hasErrors || commitMutation.isPending}>
                {commitMutation.isPending ? t("admin.imports.importing") : t("admin.imports.confirmImport")}
              </Button>
            </div>
            {hasErrors && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {t("admin.imports.fixErrorsHint")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.imports.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("admin.imports.loading")}</p>
          ) : (jobsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.imports.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.imports.cols.date")}</TableHead>
                  <TableHead>{t("admin.imports.cols.type")}</TableHead>
                  <TableHead>{t("admin.imports.cols.file")}</TableHead>
                  <TableHead>{t("admin.imports.cols.status")}</TableHead>
                  <TableHead className="text-right">{t("admin.imports.cols.rows")}</TableHead>
                  <TableHead className="text-right">{t("admin.imports.cols.imported")}</TableHead>
                  <TableHead className="text-right">{t("admin.imports.cols.skipped")}</TableHead>
                  <TableHead className="text-right">{t("admin.imports.cols.errors")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(jobsQuery.data ?? []).map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs">{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{j.import_type}</TableCell>
                    <TableCell className="text-xs">{j.original_filename}</TableCell>
                    <TableCell><Badge variant="outline">{j.status}</Badge></TableCell>
                    <TableCell className="text-right text-xs">{j.row_count}</TableCell>
                    <TableCell className="text-right text-xs">{j.imported_count}</TableCell>
                    <TableCell className="text-right text-xs">{j.skipped_count}</TableCell>
                    <TableCell className="text-right text-xs">{j.error_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "error" }) {
  const color =
    tone === "success" ? "text-emerald-600" :
    tone === "warning" ? "text-amber-600" :
    tone === "error" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Section({
  title, hint, tone, children,
}: { title: string; hint?: string; tone: "warning" | "error"; children: React.ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : AlertTriangle;
  const color = tone === "error" ? "text-destructive" : "text-amber-600";
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className={`flex items-center gap-2 text-sm font-medium ${color}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function RowsPreviewTable({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation("common");
  const sample = preview.rows.slice(0, 30);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">
        {t("admin.imports.sampleHint", { shown: sample.length, total: preview.rows.length })}
      </p>
      <div className="border rounded-md max-h-96 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("admin.imports.cols.date")}</TableHead>
              <TableHead>{t("admin.imports.cols.from")}</TableHead>
              <TableHead>{t("admin.imports.cols.project")}</TableHead>
              <TableHead>{t("admin.imports.cols.company")}</TableHead>
              <TableHead className="text-right">h</TableHead>
              <TableHead>{t("admin.imports.cols.status")}</TableHead>
              <TableHead>{t("admin.imports.cols.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sample.map((v) => (
              <TableRow key={v.row.rowIndex}>
                <TableCell className="text-xs">{v.row.rowIndex}</TableCell>
                <TableCell className="text-xs">{v.row.entry_date}</TableCell>
                <TableCell className="text-xs">{v.row.from_email ?? v.row.from_name}</TableCell>
                <TableCell className="text-xs">{v.row.reference}</TableCell>
                <TableCell className="text-xs">{v.row.company}</TableCell>
                <TableCell className="text-right text-xs">{v.row.billable_hours}</TableCell>
                <TableCell>
                  {v.status === "valid" && <Badge variant="outline" className="text-emerald-600 border-emerald-600/40"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
                  {v.status === "warning" && <Badge variant="outline" className="text-amber-600 border-amber-600/40">!</Badge>}
                  {v.status === "error" && <Badge variant="destructive">err</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[...v.errors, ...v.warnings].join("; ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
