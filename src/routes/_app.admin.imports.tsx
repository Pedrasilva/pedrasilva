import { createFileRoute, Link } from "@tanstack/react-router";
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
  type DefaultStageChoice,
} from "@/lib/imports/accelo-importer";
import { supabase } from "@/integrations/supabase/client";
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
type UnassignedStageProject = { key: string; label: string; rows: number };

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
  const [defaultStageByProject, setDefaultStageByProject] = useState<Record<string, DefaultStageChoice>>({});
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
      setDefaultStageByProject({});
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

  const buildCommitOptions = (restrictProjectIds?: string[]) => {
    const createMissingProjects = Object.values(projectMapping).some((c) => c.mode === "create");
    const stageMapping = buildCommitDefaultStageByProject(
      unassignedStageProjectKeys,
      defaultStageByProject,
    );
    return {
      createMissingProjects,
      createMissingCompanies,
      projectMapping,
      defaultStageByProject: stageMapping,
      ...(restrictProjectIds && restrictProjectIds.length ? { restrictProjectIds } : {}),
    };
  };

  const commitMutation = useMutation({
    mutationFn: async (vars?: { restrictProjectIds?: string[] }) => {
      if (!preview) throw new Error("No preview");
      const opts = buildCommitOptions(vars?.restrictProjectIds);
      // Fail-fast: if user assigned stages on Review but stripping invalid
      // ones produced an empty mapping while there are stageless projects,
      // block before round-tripping to Supabase.
      if (
        unassignedStageProjectKeys.length > 0 &&
        Object.keys(opts.defaultStageByProject ?? {}).length === 0
      ) {
        throw new Error(t("admin.imports.failFast.emptyStageMapping"));
      }
      // Fail-fast: any stageless project missing a valid choice.
      const missing = unassignedStageProjectKeys.filter(
        (p) => !isValidDefaultStageChoice(defaultStageByProject[p.key]),
      );
      if (missing.length > 0) {
        throw new Error(t("admin.imports.failFast.missingDefaultStages", { count: missing.length }));
      }
      console.debug("[accelo-import] commit options", opts);
      return commitAcceloImport(preview, opts);
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
      [
        ["projects"],
        ["pm-projects"],
        ["pm-project"],
        ["pm-stages-all"],
        ["pm-stages-for-project"],
        ["pm-allocations-all"],
        ["pm-project-time"],
        ["pm-time-entries-all-project"],
        ["historical-time-totals"],
        ["historical-time-totals-map"],
        ["stage-budget-control"],
        ["project-financial-summary"],
        ["pm-project-insights"],
        ["project-insights"],
        ["external-services"],
        ["forecast-projects"],
      ].forEach((k) => qc.invalidateQueries({ queryKey: k, refetchType: "all" }));
      for (const d of r.diagnostics ?? []) {
        qc.invalidateQueries({ queryKey: ["pm-project", d.project_id], refetchType: "all" });
        qc.invalidateQueries({ queryKey: ["pm-project-time", d.project_id], refetchType: "all" });
        qc.invalidateQueries({ queryKey: ["historical-time-totals", d.project_id], refetchType: "all" });
        qc.invalidateQueries({ queryKey: ["project-financial-summary", d.project_id], refetchType: "all" });
        qc.invalidateQueries({ queryKey: ["pm-project-insights", d.project_id], refetchType: "all" });
      }
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
  // Project keys (project_id or parent_reference) that have rows missing stage_name.
  const unassignedStageProjectKeys = useMemo(() => {
    if (!preview) return [] as UnassignedStageProject[];
    const m = new Map<string, UnassignedStageProject>();
    for (const v of preview.rows) {
      if (v.status === "error") continue;
      if ((v.row.stage_name ?? "").trim()) continue;
      const ref = v.row.parent_reference || v.row.reference;
      const choice = ref ? projectMapping[ref] : undefined;
      if (choice?.mode === "skip") continue;
      const key =
        choice?.mode === "existing"
          ? choice.project_id
          : choice?.mode === "create"
            ? ref
            : v.matched.project_id ?? ref;
      if (!key) continue;
      const cur = m.get(key);
      if (cur) cur.rows++;
      else m.set(key, { key, label: ref || "—", rows: 1 });
    }
    return Array.from(m.values());
  }, [preview, projectMapping]);
  const stagesAssignmentComplete = unassignedStageProjectKeys.every(
    (p) => isValidDefaultStageChoice(defaultStageByProject[p.key]),
  );
  const canCommit =
    !!preview &&
    blockingErrors === 0 &&
    unmatchedCollabs === 0 &&
    projectMappingComplete &&
    stagesAssignmentComplete;

  const reset = () => {
    setStep("upload");
    setPreview(null);
    setFile(null);
    setProjectMapping({});
    setDefaultStageByProject({});
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
          unassignedProjects={unassignedStageProjectKeys}
          defaultStageByProject={defaultStageByProject}
          setDefaultStageByProject={setDefaultStageByProject}
          stagesAssignmentComplete={stagesAssignmentComplete}
          onBack={() => setStep("people")}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && preview && (
        <ReviewStep
          preview={preview}
          mapping={projectMapping}
          unassignedProjects={unassignedStageProjectKeys}
          defaultStageByProject={buildCommitDefaultStageByProject(
            unassignedStageProjectKeys,
            defaultStageByProject,
          )}
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
    const ref = v.row.parent_reference || v.row.reference;
    if (ref && v.matched.project_id) {
      matchedByRef.set(ref, v.matched.project_id);
    }
  });
  for (const [ref, project_id] of matchedByRef) {
    map[ref] = { mode: "existing", project_id };
  }
  // Unmatched references → leave undefined (user must choose).
  return map;
}

function isValidDefaultStageChoice(choice: DefaultStageChoice | undefined): choice is DefaultStageChoice {
  if (!choice) return false;
  if (choice.mode === "existing") return Boolean(choice.stage_id);
  return Boolean(choice.name.trim());
}

function buildCommitDefaultStageByProject(
  unassignedProjects: UnassignedStageProject[],
  choices: Record<string, DefaultStageChoice>,
): Record<string, DefaultStageChoice> {
  return Object.fromEntries(
    unassignedProjects
      .map((p) => [p.key, choices[p.key]] as const)
      .filter((entry): entry is readonly [string, DefaultStageChoice] =>
        isValidDefaultStageChoice(entry[1]),
      ),
  );
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
      const ref = v.row.parent_reference || v.row.reference;
      if (ref) set.add(ref);
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
  unassignedProjects,
  defaultStageByProject,
  setDefaultStageByProject,
  stagesAssignmentComplete,
  onBack,
  onNext,
}: {
  preview: ImportPreview;
  mapping: Record<string, ProjectMappingChoice>;
  unassignedProjects: { key: string; label: string; rows: number }[];
  defaultStageByProject: Record<string, DefaultStageChoice>;
  setDefaultStageByProject: React.Dispatch<React.SetStateAction<Record<string, DefaultStageChoice>>>;
  stagesAssignmentComplete: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("common");

  const { stages, reconstructedCount, correctedCount, skippedCount, missingProject } = useMemo(() => {
    const minIso = (a: string | null, b: string | null) =>
      !a ? b : !b ? a : a < b ? a : b;
    const maxIso = (a: string | null, b: string | null) =>
      !a ? b : !b ? a : a > b ? a : b;

    const map = new Map<
      string,
      {
        key: string;
        project_label: string;
        stage_name: string;
        explicit_start: string | null;
        explicit_end: string | null;
        activity_min: string | null;
        activity_max: string | null;
        raw: string;
        warning: string | null;
        rows: number;
        hours: number;
        resourceIds: Set<string>;
        inferred: boolean;
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
      if (name && rawRange && !seenStageRow.has(v.row.rowIndex)) {
        seenStageRow.add(v.row.rowIndex);
        if (!start || !end) skippedCount++;
        else if (v.row.stage_parse_warning) correctedCount++;
      }
      if (!name) continue;
      const ref = v.row.parent_reference || v.row.reference;
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
      const key = `${projectKey}|${name}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          project_label: ref ?? "—",
          stage_name: name,
          explicit_start: start ?? null,
          explicit_end: end ?? null,
          activity_min: v.row.entry_date ?? null,
          activity_max: v.row.entry_date ?? null,
          raw: rawRange,
          warning: v.row.stage_parse_warning,
          rows: 0,
          hours: 0,
          resourceIds: new Set<string>(),
          inferred: false,
        };
        map.set(key, entry);
      } else {
        entry.explicit_start = entry.explicit_start ?? start ?? null;
        entry.explicit_end = entry.explicit_end ?? end ?? null;
        entry.activity_min = minIso(entry.activity_min, v.row.entry_date ?? null);
        entry.activity_max = maxIso(entry.activity_max, v.row.entry_date ?? null);
        if (!entry.raw && rawRange) entry.raw = rawRange;
      }
      entry.rows += 1;
      entry.hours += (v.row.billable_hours ?? 0) + (v.row.non_billable_hours ?? 0);
      if (v.matched.resource_id) entry.resourceIds.add(v.matched.resource_id);
    }
    const stages = Array.from(map.values())
      .map((s) => {
        const start_date = s.explicit_start ?? s.activity_min;
        const end_date = s.explicit_end ?? s.activity_max ?? start_date;
        const inferred = !s.explicit_start || !s.explicit_end;
        return {
          ...s,
          start_date: start_date ?? "",
          end_date: end_date ?? "",
          inferred,
          people: s.resourceIds.size,
        };
      })
      .filter((s) => s.start_date && s.end_date)
      .sort((a, b) => {
        const p = a.project_label.localeCompare(b.project_label);
        return p !== 0 ? p : a.start_date.localeCompare(b.start_date);
      });
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
                      <TableCell className="text-xs text-muted-foreground">
                        {s.warning ?? (s.inferred ? t("admin.imports.stages.inferredFromActivity") : "—")}
                      </TableCell>
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

        <UnassignedStagesPanel
          unassignedProjects={unassignedProjects}
          defaultStageByProject={defaultStageByProject}
          setDefaultStageByProject={setDefaultStageByProject}
        />

        <SourceBreakdown preview={preview} />

        <StepFooter
          onBack={onBack}
          onNext={onNext}
          nextDisabled={!stagesAssignmentComplete}
          nextHint={
            !stagesAssignmentComplete
              ? t("admin.imports.stages.unassigned.blocking")
              : null
          }
        />
      </CardContent>
    </Card>
  );
}

function UnassignedStagesPanel({
  unassignedProjects,
  defaultStageByProject,
  setDefaultStageByProject,
}: {
  unassignedProjects: { key: string; label: string; rows: number }[];
  defaultStageByProject: Record<string, DefaultStageChoice>;
  setDefaultStageByProject: React.Dispatch<React.SetStateAction<Record<string, DefaultStageChoice>>>;
}) {
  const { t } = useTranslation("common");
  if (unassignedProjects.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-3">
      <div className="text-xs font-medium text-amber-800 dark:text-amber-200">
        {t("admin.imports.stages.unassigned.title", { count: unassignedProjects.length })}
      </div>
      <div className="text-[11px] text-amber-700 dark:text-amber-300">
        {t("admin.imports.stages.unassigned.hint")}
      </div>
      <div className="space-y-2">
        {unassignedProjects.map((p) => (
          <UnassignedStageRow
            key={p.key}
            project={p}
            choice={defaultStageByProject[p.key]}
            onChange={(c) =>
              setDefaultStageByProject((prev) => {
                const next = { ...prev };
                if (c) next[p.key] = c;
                else delete next[p.key];
                return next;
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function UnassignedStageRow({
  project,
  choice,
  onChange,
}: {
  project: { key: string; label: string; rows: number };
  choice: DefaultStageChoice | undefined;
  onChange: (c: DefaultStageChoice | null) => void;
}) {
  const { t } = useTranslation("common");
  const stagesQ = useQuery({
    queryKey: ["pm-stages-for-project", project.key],
    queryFn: async () => {
      // project.key may be a project_id (uuid) or a parent_reference; only query when uuid-shaped.
      const isUuid = /^[0-9a-f]{8}-/i.test(project.key);
      if (!isUuid) return [] as { id: string; name: string }[];
      const { data } = await supabase
        .from("pm_stages")
        .select("id,name")
        .eq("project_id", project.key)
        .order("start_date");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [newName, setNewName] = useState("");
  const stages = stagesQ.data ?? [];

  return (
    <div className="rounded-md border bg-background p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium truncate">{project.label}</div>
        <Badge variant="secondary" className="text-[10px]">
          {t("admin.imports.stages.unassigned.rowCount", { count: project.rows })}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={choice?.mode === "existing" ? choice.stage_id : ""}
          onValueChange={(v) => onChange({ mode: "existing", stage_id: v })}
        >
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder={t("admin.imports.stages.unassigned.pickExisting")} />
          </SelectTrigger>
          <SelectContent>
            {stages.length === 0 ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t("admin.imports.stages.unassigned.noExisting")}
              </div>
            ) : (
              stages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">{t("admin.imports.stages.unassigned.or")}</span>
        <Input
          className="h-8 w-[200px] text-xs"
          placeholder={t("admin.imports.stages.unassigned.newStage")}
          value={choice?.mode === "create" ? choice.name : newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (e.target.value.trim()) onChange({ mode: "create", name: e.target.value.trim() });
            else onChange(null);
          }}
        />
        {choice && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setNewName(""); onChange(null); }}>
            {t("admin.imports.stages.unassigned.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}

function SourceBreakdown({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation("common");
  const counts = useMemo(() => {
    const c = { explicit: 0, reference: 0, subject: 0, content: 0, raw: 0, none: 0 };
    for (const v of preview.rows) {
      const s = v.row.stage_source ?? "none";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [preview]);
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="rounded border px-2 py-0.5">{t("admin.imports.stages.source.explicit")}: {counts.explicit}</span>
      <span className="rounded border px-2 py-0.5">{t("admin.imports.stages.source.reference")}: {counts.reference}</span>
      <span className="rounded border px-2 py-0.5">{t("admin.imports.stages.source.subject")}: {counts.subject}</span>
      <span className="rounded border px-2 py-0.5">{t("admin.imports.stages.source.content")}: {counts.content}</span>
      <span className="rounded border px-2 py-0.5">{t("admin.imports.stages.source.raw")}: {counts.raw}</span>
      <span className={`rounded border px-2 py-0.5 ${counts.none > 0 ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""}`}>
        {t("admin.imports.stages.source.none")}: {counts.none}
      </span>
    </div>
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
  unassignedProjects,
  defaultStageByProject,
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
  unassignedProjects: UnassignedStageProject[];
  defaultStageByProject: Record<string, DefaultStageChoice>;
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
  const commitOptionsDebug = {
    projectMapping: mapping,
    defaultStageByProject,
  };

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

        {unassignedProjects.length > 0 && (
          <div className="rounded-md border p-3 space-y-2 text-xs">
            <div className="font-semibold text-foreground">
              {t("admin.imports.wizard.review.stageAssignments")}
            </div>
            {unassignedProjects.map((p) => {
              const choice = defaultStageByProject[p.key];
              const label = choice?.mode === "existing"
                ? t("admin.imports.wizard.review.stageExisting", { stageId: choice.stage_id })
                : choice?.mode === "create"
                  ? t("admin.imports.wizard.review.stageCreate", { name: choice.name })
                  : t("admin.imports.wizard.review.stageMissing");
              return (
                <div key={p.key} className="flex items-center justify-between gap-3">
                  <span className="truncate">{p.label}</span>
                  <span className={choice ? "font-medium" : "font-medium text-destructive"}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        <details className="rounded-md border bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-foreground">
            {t("admin.imports.wizard.review.commitOptionsDebug")}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {JSON.stringify(commitOptionsDebug, null, 2)}
          </pre>
        </details>

        {(!canCommit || !projectMappingComplete || unmatchedCollabs > 0 || blockingErrors > 0) && (
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
            {unassignedProjects.length > 0 && !unassignedProjects.every((p) => isValidDefaultStageChoice(defaultStageByProject[p.key])) && (
              <li className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("admin.imports.stages.unassigned.blocking")}
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
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label={t("admin.imports.result.stagesMatched")} value={result.stagesMatched} />
          <Stat label={t("admin.imports.result.stagesCreated")} value={result.stagesCreated} tone="success" />
          <Stat label={t("admin.imports.result.allocations")} value={result.allocationsUpserted} />
        </div>
        {(result.entriesWithoutStage > 0 || result.entriesWithoutResource > 0) && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            {result.entriesWithoutStage > 0 && (
              <div>{t("admin.imports.result.warnNoStage", { count: result.entriesWithoutStage })}</div>
            )}
            {result.entriesWithoutResource > 0 && (
              <div>{t("admin.imports.result.warnNoResource", { count: result.entriesWithoutResource })}</div>
            )}
          </div>
        )}
        {result.diagnostics && result.diagnostics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin.imports.result.diagnostics.title")}
            </div>
            <div className="space-y-2">
              {result.diagnostics.map((d) => (
                <div
                  key={d.project_id}
                  className={`rounded-md border p-3 text-xs ${
                    d.reconstructionFailed
                      ? "border-red-300/60 bg-red-50 text-red-900 dark:border-red-700/60 dark:bg-red-950/30 dark:text-red-200"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{d.project_name ?? d.project_id}</div>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: d.project_id }}
                    >
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        {t("admin.imports.result.diagnostics.openProject")}
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
                    <span>{t("admin.imports.result.diagnostics.visibleStages")}: <strong>{d.visibleStagesForProject}</strong></span>
                    <span>{t("admin.imports.result.diagnostics.historicalEntries")}: <strong>{d.historicalEntriesForProject}</strong></span>
                    <span>{t("admin.imports.result.diagnostics.historicalWithStage")}: <strong>{d.historicalEntriesWithStage}</strong></span>
                    <span>{t("admin.imports.result.diagnostics.entriesWithoutStage")}: <strong>{d.entriesWithoutStage}</strong></span>
                    <span>{t("admin.imports.result.diagnostics.allocations")}: <strong>{d.allocationsForProject}</strong></span>
                  </div>
                  {d.reconstructionFailed && (
                    <div className="mt-2 font-medium">
                      {t("admin.imports.result.diagnostics.reconstructionFailed")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {result.diagnostics && result.diagnostics.length === 1 && (
            <Link
              to="/projects/$projectId"
              params={{ projectId: result.diagnostics[0].project_id }}
            >
              <Button variant="default">
                {t("admin.imports.result.diagnostics.openProject")}
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={onReset}>{t("admin.imports.wizard.result.startNew")}</Button>
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
