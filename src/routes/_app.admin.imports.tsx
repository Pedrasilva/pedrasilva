import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import {
  AlertCircle,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Users,
  FolderTree,
  CalendarRange,
  PlayCircle,
  ListChecks,
} from "lucide-react";
import {
  uploadAndPreviewAccelo,
  commitAcceloImport,
  listImportJobs,
  listCollaboratorsForMapping,
  listProjectsForMapping,
  saveIdentityMapping,
  revalidatePreview,
  type ImportPreview,
  type ProjectMappingChoice,
  type CommitResult,
} from "@/lib/imports/accelo-importer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/admin/imports")({
  component: ImportsPage,
});

type ImportTypeKey = "accelo_activity_timesheet" | "companies_clients_suppliers";

type StepId = "upload" | "projects" | "people" | "stages" | "review" | "result";

const STEP_ORDER: StepId[] = ["upload", "projects", "people", "stages", "review", "result"];

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

  const [step, setStep] = useState<StepId>("upload");
  const [importType, setImportType] = useState<ImportTypeKey>("accelo_activity_timesheet");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [createMissingCompanies, setCreateMissingCompanies] = useState(true);
  const [projectMapping, setProjectMapping] = useState<Record<string, ProjectMappingChoice>>({});
  const [mappingTarget, setMappingTarget] = useState<{ email: string; name: string } | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

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
      setProjectMapping(seedProjectMapping(p));
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      toast.success(t("admin.imports.toastPreviewed"));
      if (p.storageWarning) {
        toast.warning(t("admin.imports.toastStorageWarning", { error: p.storageWarning }));
      }
      setStep("projects");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revalidateMutation = useMutation({
    mutationFn: async () => {
      if (!file || !preview) throw new Error("No file");
      return revalidatePreview(file, preview.jobId);
    },
    onSuccess: (p) => {
      setPreview(p);
      setProjectMapping((prev) => ({ ...seedProjectMapping(p), ...prev }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview");
      const createMissingProjects = Object.values(projectMapping).some((c) => c.mode === "create");
      return commitAcceloImport(preview, {
        createMissingProjects,
        createMissingCompanies,
        projectMapping,
      });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(
        t("admin.imports.toastImported", {
          imported: r.imported,
          skipped: r.skipped,
          errors: r.errors,
        }),
      );
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      setStep("result");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockingErrors = preview ? preview.totals.error : 0;
  const unmatchedCollabs = preview?.unmatched.collaborators.length ?? 0;
  const projectMappingComplete = preview
    ? preview.unmatched.projects.every((ref) => {
        const c = projectMapping[ref];
        return c && c.mode !== "skip" ? true : c?.mode === "skip";
      }) && preview.unmatched.projects.every((ref) => projectMapping[ref] != null)
    : false;
  const canCommit = !!preview && blockingErrors === 0 && unmatchedCollabs === 0 && projectMappingComplete;

  const reset = () => {
    setStep("upload");
    setPreview(null);
    setFile(null);
    setProjectMapping({});
    setResult(null);
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.imports.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.imports.subtitle")}</p>
      </div>

      <WizardNav step={step} preview={preview} />

      {step === "upload" && (
        <UploadStep
          importType={importType}
          setImportType={setImportType}
          file={file}
          setFile={(f) => {
            setFile(f);
            setPreview(null);
            setProjectMapping({});
            setResult(null);
          }}
          onParse={() => previewMutation.mutate()}
          isParsing={previewMutation.isPending}
          preview={preview}
        />
      )}

      {step === "projects" && preview && (
        <ProjectsStep
          preview={preview}
          mapping={projectMapping}
          setMapping={setProjectMapping}
          createMissingCompanies={createMissingCompanies}
          setCreateMissingCompanies={setCreateMissingCompanies}
          onBack={() => setStep("upload")}
          onNext={() => setStep("people")}
        />
      )}

      {step === "people" && preview && (
        <PeopleStep
          preview={preview}
          onMap={(t) => setMappingTarget(t)}
          onBack={() => setStep("projects")}
          onNext={() => setStep("stages")}
        />
      )}

      {step === "stages" && preview && (
        <StagesStep
          preview={preview}
          mapping={projectMapping}
          onBack={() => setStep("people")}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && preview && (
        <ReviewStep
          preview={preview}
          mapping={projectMapping}
          createMissingCompanies={createMissingCompanies}
          canCommit={canCommit}
          isCommitting={commitMutation.isPending}
          onBack={() => setStep("stages")}
          onCommit={() => commitMutation.mutate()}
          blockingErrors={blockingErrors}
          unmatchedCollabs={unmatchedCollabs}
          projectMappingComplete={projectMappingComplete}
        />
      )}

      {step === "result" && result && (
        <ResultStep
          result={result}
          onReset={reset}
        />
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

      <MappingDialog
        target={mappingTarget}
        onClose={() => setMappingTarget(null)}
        onSaved={() => {
          setMappingTarget(null);
          revalidateMutation.mutate();
        }}
      />
    </div>
  );
}

function seedProjectMapping(preview: ImportPreview): Record<string, ProjectMappingChoice> {
  const map: Record<string, ProjectMappingChoice> = {};
  // Auto-matched references → "existing" with the auto-matched id.
  const matchedByRef = new Map<string, string>();
  preview.rows.forEach((v) => {
    if (v.row.reference && v.matched.project_id) {
      matchedByRef.set(v.row.reference, v.matched.project_id);
    }
  });
  for (const [ref, project_id] of matchedByRef) {
    map[ref] = { mode: "existing", project_id };
  }
  // Unmatched references → leave undefined (user must choose).
  return map;
}

function WizardNav({ step, preview }: { step: StepId; preview: ImportPreview | null }) {
  const { t } = useTranslation("common");
  const labels: Record<StepId, { label: string; icon: typeof Upload }> = {
    upload: { label: t("admin.imports.wizard.steps.upload"), icon: Upload },
    projects: { label: t("admin.imports.wizard.steps.projects"), icon: FolderTree },
    people: { label: t("admin.imports.wizard.steps.people"), icon: Users },
    stages: { label: t("admin.imports.wizard.steps.stages"), icon: CalendarRange },
    review: { label: t("admin.imports.wizard.steps.review"), icon: ListChecks },
    result: { label: t("admin.imports.wizard.steps.result"), icon: CheckCircle2 },
  };
  const currentIndex = STEP_ORDER.indexOf(step);
  return (
    <div className="flex flex-wrap gap-2">
      {STEP_ORDER.map((s, i) => {
        const meta = labels[s];
        const Icon = meta.icon;
        const active = s === step;
        const done = i < currentIndex;
        const disabled = !preview && i > 0;
        return (
          <div
            key={s}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : done
                  ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                  : disabled
                    ? "text-muted-foreground"
                    : "text-foreground"
            }`}
          >
            <span className="font-mono opacity-60">{i + 1}</span>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  importType,
  setImportType,
  file,
  setFile,
  onParse,
  isParsing,
  preview,
}: {
  importType: ImportTypeKey;
  setImportType: (v: ImportTypeKey) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  onParse: () => void;
  isParsing: boolean;
  preview: ImportPreview | null;
}) {
  const { t } = useTranslation("common");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> {t("admin.imports.wizard.upload.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.wizard.upload.subtitle")}</CardDescription>
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
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        {preview && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Stat label={t("admin.imports.stats.rows")} value={preview.totals.rows} />
            <Stat label={t("admin.imports.stats.valid")} value={preview.totals.valid} tone="success" />
            <Stat label={t("admin.imports.stats.warnings")} value={preview.totals.warning} tone="warning" />
            <Stat label={t("admin.imports.stats.errors")} value={preview.totals.error} tone="error" />
            <Stat label={t("admin.imports.stats.duplicates")} value={preview.totals.duplicates} />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={onParse} disabled={!file || isParsing}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {isParsing ? t("admin.imports.parsing") : t("admin.imports.wizard.upload.parseAndContinue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectsStep({
  preview,
  mapping,
  setMapping,
  createMissingCompanies,
  setCreateMissingCompanies,
  onBack,
  onNext,
}: {
  preview: ImportPreview;
  mapping: Record<string, ProjectMappingChoice>;
  setMapping: (m: Record<string, ProjectMappingChoice>) => void;
  createMissingCompanies: boolean;
  setCreateMissingCompanies: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("common");
  const projects = useQuery({ queryKey: ["import-projects-list"], queryFn: listProjectsForMapping });

  // Build all distinct references used in the file.
  const refs = useMemo(() => {
    const set = new Set<string>();
    preview.rows.forEach((v) => {
      if (v.row.reference) set.add(v.row.reference);
    });
    return Array.from(set).sort();
  }, [preview]);

  const allMapped = refs.every((ref) => mapping[ref] != null);

  const update = (ref: string, choice: ProjectMappingChoice) => {
    setMapping({ ...mapping, [ref]: choice });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4" /> {t("admin.imports.wizard.projects.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.wizard.projects.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.unmatched.companies.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {t("admin.imports.unmatched.companies", {
                count: preview.unmatched.companies.length,
              })}
            </div>
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
          </div>
        )}

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.imports.wizard.projects.cols.reference")}</TableHead>
                <TableHead>{t("admin.imports.wizard.projects.cols.action")}</TableHead>
                <TableHead>{t("admin.imports.wizard.projects.cols.target")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refs.map((ref) => {
                const choice = mapping[ref];
                const mode = choice?.mode ?? "";
                return (
                  <TableRow key={ref}>
                    <TableCell className="text-xs font-medium">{ref}</TableCell>
                    <TableCell>
                      <Select
                        value={mode}
                        onValueChange={(v) => {
                          if (v === "existing") {
                            update(ref, { mode: "existing", project_id: choice?.mode === "existing" ? choice.project_id : "" });
                          } else if (v === "create") {
                            update(ref, { mode: "create", name: ref });
                          } else if (v === "skip") {
                            update(ref, { mode: "skip" });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue placeholder={t("admin.imports.wizard.projects.choose")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="existing">{t("admin.imports.wizard.projects.useExisting")}</SelectItem>
                          <SelectItem value="create">{t("admin.imports.wizard.projects.createNew")}</SelectItem>
                          <SelectItem value="skip">{t("admin.imports.wizard.projects.skipRef")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {choice?.mode === "existing" && (
                        <Select
                          value={choice.project_id}
                          onValueChange={(v) => update(ref, { mode: "existing", project_id: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder={t("admin.imports.wizard.projects.selectProject")} />
                          </SelectTrigger>
                          <SelectContent>
                            {(projects.data ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                                {p.external_id ? ` — ${p.external_id}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {choice?.mode === "create" && (
                        <Input
                          className="h-8"
                          value={choice.name ?? ref}
                          onChange={(e) => update(ref, { mode: "create", name: e.target.value })}
                          placeholder={t("admin.imports.wizard.projects.newName")}
                        />
                      )}
                      {choice?.mode === "skip" && (
                        <span className="text-xs text-muted-foreground">
                          {t("admin.imports.wizard.projects.skippedHint")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <StepFooter
          onBack={onBack}
          onNext={onNext}
          nextDisabled={!allMapped}
          nextHint={allMapped ? null : t("admin.imports.wizard.projects.allRequired")}
        />
      </CardContent>
    </Card>
  );
}

function PeopleStep({
  preview,
  onMap,
  onBack,
  onNext,
}: {
  preview: ImportPreview;
  onMap: (t: { email: string; name: string }) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("common");
  const unmatched = preview.unmatched.collaborators;
  const matchedCount = preview.rows.filter((v) => v.matched.collaborator_id).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> {t("admin.imports.wizard.people.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.wizard.people.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Stat label={t("admin.imports.wizard.people.matchedRows")} value={matchedCount} tone="success" />
          <Stat label={t("admin.imports.wizard.people.unmatched")} value={unmatched.length} tone={unmatched.length ? "error" : "success"} />
        </div>

        {unmatched.length > 0 ? (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("admin.imports.unmatched.collaboratorsHint")}
            </p>
            <ul className="text-sm space-y-1">
              {unmatched.slice(0, 50).map((c) => (
                <li key={c.email ?? c.name} className="flex items-center justify-between gap-2">
                  <span>
                    {c.name}{" "}
                    {c.email ? <span className="text-muted-foreground">&lt;{c.email}&gt;</span> : null}
                  </span>
                  {c.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMap({ email: c.email!, name: c.name })}
                    >
                      {t("admin.imports.mapping.action")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {t("admin.imports.wizard.people.allMatched")}
          </p>
        )}

        <StepFooter
          onBack={onBack}
          onNext={onNext}
          nextDisabled={unmatched.length > 0}
          nextHint={unmatched.length > 0 ? t("admin.imports.wizard.people.blocking") : null}
        />
      </CardContent>
    </Card>
  );
}

function StagesStep({
  preview,
  mapping,
  onBack,
  onNext,
}: {
  preview: ImportPreview;
  mapping: Record<string, ProjectMappingChoice>;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("common");

  const { stages, reconstructedCount, correctedCount, skippedCount, missingProject } = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        project_label: string;
        stage_name: string;
        start_date: string;
        end_date: string;
        raw: string;
        warning: string | null;
        rows: number;
        hours: number;
        resourceIds: Set<string>;
      }
    >();
    let skippedCount = 0;
    let correctedCount = 0;
    let missingProject = 0;
    const seenStageRow = new Set<number>();
    for (const v of preview.rows) {
      const name = (v.row.stage_name ?? "").trim();
      const rawRange = (v.row.stage_date_range_raw ?? "").trim();
      const start = v.row.stage_start_date;
      const end = v.row.stage_end_date;
      // Count parse outcomes per row that actually has a stage + raw range
      if (name && rawRange && !seenStageRow.has(v.row.rowIndex)) {
        seenStageRow.add(v.row.rowIndex);
        if (!start || !end) skippedCount++;
        else if (v.row.stage_parse_warning) correctedCount++;
      }
      if (!name || !start || !end) continue;
      const ref = v.row.reference;
      const choice = ref ? mapping[ref] : undefined;
      const projectKey = choice?.mode === "existing"
        ? choice.project_id
        : choice?.mode === "create"
          ? `new:${ref}`
          : choice?.mode === "skip"
            ? null
            : v.matched.project_id;
      if (!projectKey) {
        missingProject++;
        continue;
      }
      const key = `${projectKey}|${name}|${start}|${end}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          project_label: ref ?? "—",
          stage_name: name,
          start_date: start,
          end_date: end,
          raw: rawRange,
          warning: v.row.stage_parse_warning,
          rows: 0,
          hours: 0,
          resourceIds: new Set<string>(),
        };
        map.set(key, entry);
      }
      entry.rows += 1;
      entry.hours += (v.row.billable_hours ?? 0) + (v.row.non_billable_hours ?? 0);
      if (v.matched.resource_id) entry.resourceIds.add(v.matched.resource_id);
    }
    const stages = Array.from(map.values())
      .map((s) => ({ ...s, people: s.resourceIds.size }))
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return { stages, reconstructedCount: stages.length, correctedCount, skippedCount, missingProject };
  }, [preview, mapping]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4" /> {t("admin.imports.stages.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.stages.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-md border px-2 py-1">
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">
              {t("admin.imports.stages.counters.parsed", { count: reconstructedCount })}
            </span>
          </span>
          <span className="rounded-md border px-2 py-1">
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              {t("admin.imports.stages.counters.corrected", { count: correctedCount })}
            </span>
          </span>
          <span className="rounded-md border px-2 py-1">
            <span className="text-rose-700 dark:text-rose-300 font-medium">
              {t("admin.imports.stages.counters.skipped", { count: skippedCount })}
            </span>
          </span>
          {missingProject > 0 && (
            <span className="rounded-md border px-2 py-1 text-amber-700 dark:text-amber-300">
              {t("admin.imports.stages.missingProject", { count: missingProject })}
            </span>
          )}
        </div>
        {stages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("admin.imports.stages.noneDetected")}</p>
        ) : (
          <>
            <GanttPreview stages={stages} />
            <div className="border rounded-md max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.imports.stages.cols.stage")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.project")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.raw")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.start")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.end")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.status")}</TableHead>
                    <TableHead>{t("admin.imports.stages.cols.message")}</TableHead>
                    <TableHead className="text-right">{t("admin.imports.stages.cols.rows")}</TableHead>
                    <TableHead className="text-right">{t("admin.imports.stages.cols.hours")}</TableHead>
                    <TableHead className="text-right">{t("admin.imports.stages.cols.people")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="text-xs font-medium">{s.stage_name}</TableCell>
                      <TableCell className="text-xs">{s.project_label}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{s.raw || "—"}</TableCell>
                      <TableCell className="text-xs">{s.start_date}</TableCell>
                      <TableCell className="text-xs">{s.end_date}</TableCell>
                      <TableCell className="text-xs">
                        {s.warning ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            {t("admin.imports.stages.statusWarn")}
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {t("admin.imports.stages.statusOk")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.warning ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{s.rows}</TableCell>
                      <TableCell className="text-right text-xs">{s.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-xs">{s.people}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <StepFooter onBack={onBack} onNext={onNext} />
      </CardContent>
    </Card>
  );
}

type GanttStage = {
  key: string;
  project_label: string;
  stage_name: string;
  start_date: string;
  end_date: string;
  people: number;
  hours: number;
};

function GanttPreview({ stages }: { stages: GanttStage[] }) {
  const { t } = useTranslation("common");
  const { groups, minTs, maxTs, totalDays } = useMemo(() => {
    const groups = new Map<string, GanttStage[]>();
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const s of stages) {
      const startTs = new Date(s.start_date).getTime();
      const endTs = new Date(s.end_date).getTime();
      if (Number.isFinite(startTs)) minTs = Math.min(minTs, startTs);
      if (Number.isFinite(endTs)) maxTs = Math.max(maxTs, endTs);
      const arr = groups.get(s.project_label) ?? [];
      arr.push(s);
      groups.set(s.project_label, arr);
    }
    const totalDays = Math.max(1, Math.round((maxTs - minTs) / 86400000) + 1);
    return { groups, minTs, maxTs, totalDays };
  }, [stages]);

  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) return null;

  const palette = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];
  const projectColor = new Map<string, string>();
  let i = 0;
  for (const k of groups.keys()) {
    projectColor.set(k, palette[i % palette.length]);
    i++;
  }

  const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("admin.imports.stages.gantt.title")}</span>
        <span className="font-mono">{fmt(minTs)} → {fmt(maxTs)}</span>
      </div>
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label} className="space-y-1">
            <div className="text-[11px] font-medium truncate">{label}</div>
            <div className="space-y-1">
              {items.map((s) => {
                const startTs = new Date(s.start_date).getTime();
                const endTs = new Date(s.end_date).getTime();
                const offsetDays = Math.round((startTs - minTs) / 86400000);
                const spanDays = Math.max(1, Math.round((endTs - startTs) / 86400000) + 1);
                const left = (offsetDays / totalDays) * 100;
                const width = (spanDays / totalDays) * 100;
                return (
                  <div key={s.key} className="relative h-5 bg-background/60 rounded-sm overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 rounded-sm flex items-center px-1.5"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(0.5, width)}%`,
                        backgroundColor: projectColor.get(label),
                        opacity: 0.85,
                      }}
                      title={`${s.stage_name} • ${s.start_date} → ${s.end_date} • ${s.people} ${t("admin.imports.stages.gantt.people")} • ${s.hours.toFixed(1)}h`}
                    >
                      <span className="text-[10px] text-white truncate font-medium">
                        {s.stage_name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground italic">{t("admin.imports.stages.gantt.hint")}</p>
    </div>
  );
}

function ReviewStep({
  preview,
  mapping,
  createMissingCompanies,
  canCommit,
  isCommitting,
  onBack,
  onCommit,
  blockingErrors,
  unmatchedCollabs,
  projectMappingComplete,
}: {
  preview: ImportPreview;
  mapping: Record<string, ProjectMappingChoice>;
  createMissingCompanies: boolean;
  canCommit: boolean;
  isCommitting: boolean;
  onBack: () => void;
  onCommit: () => void;
  blockingErrors: number;
  unmatchedCollabs: number;
  projectMappingComplete: boolean;
}) {
  const { t } = useTranslation("common");

  const projectsToUse = Object.values(mapping).filter((c) => c.mode === "existing").length;
  const projectsToCreate = Object.values(mapping).filter((c) => c.mode === "create").length;
  const projectsSkipped = Object.values(mapping).filter((c) => c.mode === "skip").length;

  const rowsToImport = preview.totals.rows - preview.totals.error - preview.totals.duplicates;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4" /> {t("admin.imports.wizard.review.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.wizard.review.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label={t("admin.imports.wizard.review.rowsToImport")} value={Math.max(0, rowsToImport)} tone="success" />
          <Stat label={t("admin.imports.stats.duplicates")} value={preview.totals.duplicates} />
          <Stat label={t("admin.imports.stats.warnings")} value={preview.totals.warning} tone="warning" />
          <Stat label={t("admin.imports.stats.errors")} value={preview.totals.error} tone={blockingErrors ? "error" : "success"} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Stat label={t("admin.imports.wizard.review.projectsExisting")} value={projectsToUse} />
          <Stat label={t("admin.imports.wizard.review.projectsNew")} value={projectsToCreate} />
          <Stat label={t("admin.imports.wizard.review.projectsSkipped")} value={projectsSkipped} />
        </div>
        <div className="text-xs text-muted-foreground">
          {createMissingCompanies
            ? t("admin.imports.wizard.review.companiesCreate")
            : t("admin.imports.wizard.review.companiesKeep")}
        </div>

        {(!projectMappingComplete || unmatchedCollabs > 0 || blockingErrors > 0) && (
          <ul className="text-xs space-y-1 text-destructive">
            {blockingErrors > 0 && (
              <li className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("admin.imports.fixErrorsHint")}
              </li>
            )}
            {unmatchedCollabs > 0 && (
              <li className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("admin.imports.wizard.people.blocking")}
              </li>
            )}
            {!projectMappingComplete && (
              <li className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("admin.imports.wizard.projects.allRequired")}
              </li>
            )}
          </ul>
        )}

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={onBack}>{t("admin.imports.wizard.back")}</Button>
          <Button onClick={onCommit} disabled={!canCommit || isCommitting}>
            <PlayCircle className="mr-2 h-4 w-4" />
            {isCommitting ? t("admin.imports.importing") : t("admin.imports.confirmImport")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultStep({ result, onReset }: { result: CommitResult; onReset: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {t("admin.imports.wizard.result.title")}
        </CardTitle>
        <CardDescription>{t("admin.imports.wizard.result.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label={t("admin.imports.cols.imported")} value={result.imported} tone="success" />
          <Stat label={t("admin.imports.cols.skipped")} value={result.skipped} />
          <Stat label={t("admin.imports.cols.errors")} value={result.errors} tone={result.errors ? "error" : "success"} />
        </div>
        <div className="flex justify-end">
          <Button onClick={onReset}>{t("admin.imports.wizard.result.startNew")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepFooter({
  onBack,
  onNext,
  nextDisabled,
  nextHint,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextHint?: string | null;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" onClick={onBack}>{t("admin.imports.wizard.back")}</Button>
      <div className="flex items-center gap-3">
        {nextHint && <span className="text-xs text-amber-600">{nextHint}</span>}
        <Button onClick={onNext} disabled={!!nextDisabled}>
          {t("admin.imports.wizard.next")}
        </Button>
      </div>
    </div>
  );
}

function MappingDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { email: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("common");
  const [collabId, setCollabId] = useState<string>("");
  const collabs = useQuery({
    queryKey: ["mapping-collaborators"],
    queryFn: listCollaboratorsForMapping,
    enabled: !!target,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!target || !collabId) throw new Error("Select a collaborator");
      await saveIdentityMapping({
        source_identifier: target.email,
        source_name: target.name || null,
        collaborator_id: collabId,
      });
    },
    onSuccess: () => {
      toast.success(t("admin.imports.mapping.saved"));
      setCollabId("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.imports.mapping.title")}</DialogTitle>
          <DialogDescription>{t("admin.imports.mapping.description")}</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <div className="text-muted-foreground text-xs">
                {t("admin.imports.mapping.source")}
              </div>
              <div>{target.name}</div>
              <div className="text-muted-foreground">&lt;{target.email}&gt;</div>
            </div>
            <div className="space-y-1">
              <Label>{t("admin.imports.mapping.collaborator")}</Label>
              <Select value={collabId} onValueChange={setCollabId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.imports.mapping.selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(collabs.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {c.email ? ` — ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("admin.imports.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!collabId || save.isPending}>
            {save.isPending ? t("admin.imports.mapping.saving") : t("admin.imports.mapping.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
