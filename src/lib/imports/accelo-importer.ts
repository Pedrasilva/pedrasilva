// Client-side importer service for Accelo Activity / Timesheet.
//
// All writes go through the regular browser Supabase client; RLS limits these
// tables to admin role, so non-admins cannot reach them.

import { supabase } from "@/integrations/supabase/client";
import {
  parseAcceloActivityExport,
  type ParsedAcceloRow,
} from "./accelo-activity-parser";

export const SOURCE_SYSTEM = "accelo";

export type RowValidation = {
  row: ParsedAcceloRow;
  status: "valid" | "warning" | "error";
  errors: string[];
  warnings: string[];
  matched: {
    collaborator_id: string | null;
    resource_id: string | null;
    project_id: string | null;
    company_id: string | null;
  };
};

export type ImportPreview = {
  jobId: string;
  filename: string;
  storagePath: string | null;
  storageWarning: string | null;
  totals: {
    rows: number;
    valid: number;
    warning: number;
    error: number;
    duplicates: number;
  };
  unmatched: {
    collaborators: { email: string | null; name: string }[];
    projects: string[];
    companies: string[];
  };
  rows: RowValidation[];
};

async function lookupMaps(rows: ParsedAcceloRow[]) {
  const emails = Array.from(
    new Set(
      rows
        .map((r) => r.from_email?.toLowerCase())
        .filter((e): e is string => !!e),
    ),
  );
  const refs = Array.from(new Set(rows.map((r) => r.reference).filter(Boolean)));
  const companies = Array.from(new Set(rows.map((r) => r.company).filter(Boolean)));

  const collabByEmail = new Map<string, { id: string }>();
  if (emails.length) {
    const { data } = await supabase
      .from("collaborators")
      .select("id,email")
      .in("email", emails);
    (data ?? []).forEach((c) => {
      if (c.email) collabByEmail.set(c.email.toLowerCase(), { id: c.id });
    });
  }

  // Identity mapping fallback (Accelo-specific)
  const mappingByIdentifier = new Map<string, { collaborator_id: string; resource_id: string | null }>();
  if (emails.length) {
    const { data } = await supabase
      .from("import_identity_mappings")
      .select("source_identifier,collaborator_id,resource_id")
      .eq("source_system", SOURCE_SYSTEM)
      .eq("active", true)
      .in("source_identifier", emails);
    (data ?? []).forEach((m) => {
      if (m.source_identifier && m.collaborator_id) {
        mappingByIdentifier.set(m.source_identifier.toLowerCase(), {
          collaborator_id: m.collaborator_id,
          resource_id: m.resource_id ?? null,
        });
      }
    });
  }

  const resourceByCollab = new Map<string, string>();
  const resourceByEmail = new Map<string, string>();
  const { data: resData } = await supabase
    .from("pm_resources")
    .select("id,collaborator_id,email");
  (resData ?? []).forEach((r) => {
    if (r.collaborator_id) resourceByCollab.set(r.collaborator_id, r.id);
    if (r.email) resourceByEmail.set(r.email.toLowerCase(), r.id);
  });

  const projectByRef = new Map<string, string>();
  if (refs.length) {
    // Safer than `.or(...)`: two separate `.in(...)` queries avoid PostgREST
    // string-escaping issues when a project name/ref contains commas, quotes
    // or parentheses. Both result sets are merged into the same lookup map.
    const [byExt, byName] = await Promise.all([
      supabase.from("pm_projects").select("id,external_id,name").in("external_id", refs),
      supabase.from("pm_projects").select("id,external_id,name").in("name", refs),
    ]);
    [...(byExt.data ?? []), ...(byName.data ?? [])].forEach((p) => {
      if (p.external_id) projectByRef.set(p.external_id, p.id);
      if (p.name) projectByRef.set(p.name, p.id);
    });
  }

  const companyByName = new Map<string, string>();
  if (companies.length) {
    const { data } = await supabase
      .from("companies")
      .select("id,nome")
      .in("nome", companies);
    (data ?? []).forEach((c) => {
      if (c.nome) companyByName.set(c.nome, c.id);
    });
  }

  return { collabByEmail, mappingByIdentifier, resourceByCollab, resourceByEmail, projectByRef, companyByName };
}

function validateRows(
  rows: ParsedAcceloRow[],
  maps: Awaited<ReturnType<typeof lookupMaps>>,
  existingExternalIds: Set<string>,
): { validations: RowValidation[]; duplicates: number } {
  let duplicates = 0;
  const validations = rows.map<RowValidation>((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.external_id) errors.push("Missing ID#");
    if (!row.entry_date) errors.push("Missing or invalid Date");
    if (!row.from_email) errors.push("Cannot extract email from 'From'");

    const emailKey = row.from_email?.toLowerCase() ?? null;
    const direct = emailKey ? maps.collabByEmail.get(emailKey) : undefined;
    const mapped = !direct && emailKey ? maps.mappingByIdentifier.get(emailKey) : undefined;
    const collaborator_id = direct?.id ?? mapped?.collaborator_id ?? null;

    if (row.from_email && !collaborator_id) {
      errors.push(`Unknown collaborator: ${row.from_email}`);
    }

    const resource_id = mapped?.resource_id
      ? mapped.resource_id
      : collaborator_id
        ? maps.resourceByCollab.get(collaborator_id) ?? null
        : emailKey
          ? maps.resourceByEmail.get(emailKey) ?? null
          : null;

    const project_id = row.reference ? maps.projectByRef.get(row.reference) ?? null : null;
    if (row.reference && !project_id) warnings.push(`Unmatched project: ${row.reference}`);

    const company_id = row.company ? maps.companyByName.get(row.company) ?? null : null;
    if (row.company && !company_id) warnings.push(`Unmatched company: ${row.company}`);

    if (row.external_id && existingExternalIds.has(row.external_id)) {
      warnings.push("Already imported (will be skipped)");
      duplicates++;
    }

    if (row.stage_parse_warning) warnings.push(row.stage_parse_warning);

    const status: RowValidation["status"] = errors.length
      ? "error"
      : warnings.length
        ? "warning"
        : "valid";
    return {
      row,
      status,
      errors,
      warnings,
      matched: {
        collaborator_id,
        resource_id,
        project_id,
        company_id,
      },
    };
  });
  return { validations, duplicates };
}

export async function uploadAndPreviewAccelo(file: File): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const { rows, diagnostics } = parseAcceloActivityExport(buffer);
  if (diagnostics.unresolvedRequired.length) {
    throw new Error(
      `Could not detect required columns: ${diagnostics.unresolvedRequired.join(", ")}. Check the sheet "Activity Export".`,
    );
  }

  // Upload original file
  const userRes = await supabase.auth.getUser();
  const uid = userRes.data.user?.id;
  const storagePath = `${uid ?? "anon"}/${Date.now()}-${file.name}`;
  let uploadedPath: string | null = null;
  let storageWarning: string | null = null;
  const up = await supabase.storage.from("import-files").upload(storagePath, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (!up.error) {
    uploadedPath = storagePath;
  } else {
    storageWarning = up.error.message;
  }

  // Create job
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      import_type: "accelo_activity_timesheet",
      source_system: SOURCE_SYSTEM,
      original_filename: file.name,
      storage_path: uploadedPath,
      status: "previewed",
      row_count: rows.length,
      metadata: { sheet: diagnostics.sheetName },
      created_by: uid ?? null,
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create import job");

  // Existing externals (idempotency)
  const externals = Array.from(new Set(rows.map((r) => r.external_id).filter(Boolean)));
  const existing = new Set<string>();
  if (externals.length) {
    const { data } = await supabase
      .from("historical_time_entries")
      .select("external_id")
      .eq("source_system", SOURCE_SYSTEM)
      .in("external_id", externals);
    (data ?? []).forEach((d) => d.external_id && existing.add(d.external_id));
  }

  const maps = await lookupMaps(rows);
  const { validations, duplicates } = validateRows(rows, maps, existing);

  // Persist rows
  if (validations.length) {
    const payload = validations.map((v) => ({
      import_job_id: job.id,
      row_number: v.row.rowIndex,
      raw_data: v.row.raw as never,
      parsed_data: { ...v.row, matched: v.matched } as never,
      status: v.status,
      external_id: v.row.external_id || null,
      error_message: v.errors.join("; ") || null,
      warning_message: v.warnings.join("; ") || null,
    }));
    // chunk inserts to avoid payload limits
    for (let i = 0; i < payload.length; i += 500) {
      await supabase.from("import_job_rows").insert(payload.slice(i, i + 500));
    }
  }

  const totals = {
    rows: validations.length,
    valid: validations.filter((v) => v.status === "valid").length,
    warning: validations.filter((v) => v.status === "warning").length,
    error: validations.filter((v) => v.status === "error").length,
    duplicates,
  };
  await supabase
    .from("import_jobs")
    .update({
      warning_count: totals.warning,
      error_count: totals.error,
      skipped_count: totals.duplicates,
    })
    .eq("id", job.id);

  const unmatchedCollabs = new Map<string, { email: string | null; name: string }>();
  const unmatchedProjects = new Set<string>();
  const unmatchedCompanies = new Set<string>();
  validations.forEach((v) => {
    if (!v.matched.collaborator_id && v.row.from_email)
      unmatchedCollabs.set(v.row.from_email, { email: v.row.from_email, name: v.row.from_name });
    if (!v.matched.project_id && v.row.reference) unmatchedProjects.add(v.row.reference);
    if (!v.matched.company_id && v.row.company) unmatchedCompanies.add(v.row.company);
  });

  return {
    jobId: job.id,
    filename: file.name,
    storagePath: uploadedPath,
    storageWarning,
    totals,
    unmatched: {
      collaborators: Array.from(unmatchedCollabs.values()),
      projects: Array.from(unmatchedProjects),
      companies: Array.from(unmatchedCompanies),
    },
    rows: validations,
  };
}

export type ProjectMappingChoice =
  | { mode: "existing"; project_id: string }
  | { mode: "create"; name?: string }
  | { mode: "skip" };

export type CommitOptions = {
  createMissingProjects: boolean;
  createMissingCompanies: boolean;
  /** User-confirmed mapping from imported reference -> destination decision.
   *  Takes priority over auto-matched project_id during commit. */
  projectMapping?: Record<string, ProjectMappingChoice>;
};

export type CommitResult = {
  imported: number;
  skipped: number;
  errors: number;
};

export async function commitAcceloImport(
  preview: ImportPreview,
  options: CommitOptions,
): Promise<CommitResult> {
  // Optionally create missing companies first
  const companyByName = new Map<string, string>();
  preview.rows.forEach((v) => {
    if (v.matched.company_id && v.row.company) companyByName.set(v.row.company, v.matched.company_id);
  });
  if (options.createMissingCompanies) {
    const missing = Array.from(
      new Set(
        preview.rows
          .filter((v) => v.row.company && !companyByName.has(v.row.company))
          .map((v) => v.row.company),
      ),
    );
    for (const name of missing) {
      const { data, error } = await supabase
        .from("companies")
        .insert({ nome: name, is_client: true })
        .select("id")
        .single();
      if (!error && data) companyByName.set(name, data.id);
    }
  }

  // Optionally create missing project shells
  const projectByRef = new Map<string, string>();
  preview.rows.forEach((v) => {
    if (v.matched.project_id && v.row.reference) projectByRef.set(v.row.reference, v.matched.project_id);
  });
  // Apply explicit user mapping first (overrides auto-match).
  const skipRefs = new Set<string>();
  if (options.projectMapping) {
    for (const [ref, choice] of Object.entries(options.projectMapping)) {
      if (choice.mode === "existing") projectByRef.set(ref, choice.project_id);
      else if (choice.mode === "skip") skipRefs.add(ref);
    }
  }

  const refsToCreate = new Set<string>();
  if (options.projectMapping) {
    for (const [ref, choice] of Object.entries(options.projectMapping)) {
      if (choice.mode === "create" && !projectByRef.has(ref)) refsToCreate.add(ref);
    }
  }
  if (options.createMissingProjects) {
    preview.rows.forEach((v) => {
      if (
        v.row.reference &&
        !projectByRef.has(v.row.reference) &&
        !skipRefs.has(v.row.reference)
      ) {
        refsToCreate.add(v.row.reference);
      }
    });
  }
  for (const ref of refsToCreate) {
    const sample = preview.rows.find((v) => v.row.reference === ref);
    const company_id = sample ? companyByName.get(sample.row.company) ?? null : null;
    const choice = options.projectMapping?.[ref];
    const name = choice?.mode === "create" && choice.name ? choice.name : ref;
    const { data, error } = await supabase
      .from("pm_projects")
      .insert({
        name,
        external_id: ref,
        company_id,
        status: "active",
        notes: "Imported shell from Accelo",
      })
      .select("id")
      .single();
    if (!error && data) projectByRef.set(ref, data.id);
  }

  // Build payload — only rows without errors and not duplicates
  const existingResp = await supabase
    .from("historical_time_entries")
    .select("external_id")
    .eq("source_system", SOURCE_SYSTEM)
    .in(
      "external_id",
      preview.rows.map((v) => v.row.external_id).filter(Boolean),
    );
  const existing = new Set((existingResp.data ?? []).map((d) => d.external_id));

  const resolveProjectId = (ref: string | null | undefined, autoMatched: string | null) => {
    if (ref && skipRefs.has(ref)) return null;
    if (ref && projectByRef.has(ref)) return projectByRef.get(ref) ?? null;
    return autoMatched;
  };

  const toInsert = preview.rows
    .filter((v) => v.status !== "error" && !existing.has(v.row.external_id))
    .filter((v) => !(v.row.reference && skipRefs.has(v.row.reference)))
    .map((v) => ({
      source_system: SOURCE_SYSTEM,
      external_id: v.row.external_id,
      import_job_id: preview.jobId,
      entry_date: v.row.entry_date!,
      collaborator_id: v.matched.collaborator_id,
      resource_id: v.matched.resource_id,
      collaborator_email: v.row.from_email,
      project_id: resolveProjectId(v.row.reference, v.matched.project_id),
      project_reference: v.row.reference || null,
      company_id: v.matched.company_id ?? companyByName.get(v.row.company) ?? null,
      company_name: v.row.company || null,
      subject: v.row.subject || null,
      content: v.row.content || null,
      rate_title: v.row.rate_title || null,
      rate: v.row.rate || null,
      billable_hours: v.row.billable_hours,
      non_billable_hours: v.row.non_billable_hours,
      amount: v.row.amount,
      cost: v.row.cost,
      profit: v.row.profit,
      status_text: v.row.status_text || null,
      invoice_number: v.row.invoice_number || null,
      raw: v.row.raw as never,
    }));

  let imported = 0;
  let errors = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error, count } = await supabase
      .from("historical_time_entries")
      .upsert(chunk, { onConflict: "source_system,external_id", count: "exact", ignoreDuplicates: false });
    if (error) {
      errors += chunk.length;
    } else {
      imported += count ?? chunk.length;
    }
  }

  const skipped = preview.rows.length - toInsert.length;

  // ---------------------------------------------------------------------------
  // Reconstruct historical Gantt: stages + per-resource allocations.
  // Idempotent via deterministic external_id; safe to re-run.
  // ---------------------------------------------------------------------------
  type StageKey = string; // accelo_stage:{project}:{name}:{start}:{end}
  type AllocKey = string; // accelo_allocation:{project}:{stage}:{resource}
  const stageGroups = new Map<
    StageKey,
    {
      project_id: string;
      name: string;
      start_date: string;
      end_date: string;
    }
  >();
  const allocAgg = new Map<
    string, // project|name|start|end|resource
    {
      project_id: string;
      stage_key: StageKey;
      resource_id: string;
      total_hours: number;
    }
  >();
  const historicalStageLinks = new Map<string, StageKey>(); // external_id -> stage key

  for (const v of preview.rows) {
    if (v.status === "error") continue;
    const project_id =
      v.matched.project_id ?? projectByRef.get(v.row.reference) ?? null;
    if (!project_id) continue;
    const name = (v.row.stage_name || "").trim();
    const start = v.row.stage_start_date;
    const end = v.row.stage_end_date;
    if (!name || !start || !end) continue;
    const stageKey: StageKey = `accelo_stage:${project_id}:${name}:${start}:${end}`;
    if (!stageGroups.has(stageKey)) {
      stageGroups.set(stageKey, { project_id, name, start_date: start, end_date: end });
    }
    if (v.row.external_id) historicalStageLinks.set(v.row.external_id, stageKey);

    if (v.matched.resource_id) {
      const aggKey = `${project_id}|${name}|${start}|${end}|${v.matched.resource_id}`;
      const cur = allocAgg.get(aggKey);
      const hours = (v.row.billable_hours ?? 0) + (v.row.non_billable_hours ?? 0);
      if (cur) cur.total_hours += hours;
      else
        allocAgg.set(aggKey, {
          project_id,
          stage_key: stageKey,
          resource_id: v.matched.resource_id,
          total_hours: hours,
        });
    }
  }

  // Upsert stages.
  const stageIdByKey = new Map<StageKey, string>();
  if (stageGroups.size) {
    const stagePayload = Array.from(stageGroups.entries()).map(([key, s]) => ({
      external_id: key,
      project_id: s.project_id,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      source: "imported_accelo",
      is_locked: true,
    }));
    const { data: upsertedStages, error: stageErr } = await supabase
      .from("pm_stages")
      .upsert(stagePayload, { onConflict: "external_id" })
      .select("id, external_id");
    if (!stageErr && upsertedStages) {
      upsertedStages.forEach((s) => {
        if (s.external_id) stageIdByKey.set(s.external_id, s.id);
      });
    }
  }

  // Upsert allocations (one per resource per stage).
  if (allocAgg.size && stageIdByKey.size) {
    const allocPayload: {
      external_id: string;
      stage_id: string;
      resource_id: string;
      start_date: string;
      end_date: string;
      hours_per_day: number;
      total_hours_imported: number;
      source: string;
      is_locked: boolean;
    }[] = [];
    for (const a of allocAgg.values()) {
      const stage_id = stageIdByKey.get(a.stage_key);
      const stage = stageGroups.get(a.stage_key);
      if (!stage_id || !stage) continue;
      // Compute working days within stage range (Mon-Fri).
      const startD = new Date(stage.start_date + "T00:00:00");
      const endD = new Date(stage.end_date + "T00:00:00");
      let working = 0;
      for (
        const d = new Date(startD);
        d <= endD;
        d.setDate(d.getDate() + 1)
      ) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) working++;
      }
      working = Math.max(1, working);
      const totalHours = a.total_hours > 0 ? a.total_hours : working * 4;
      const hpd = Math.max(0.25, totalHours / working);
      allocPayload.push({
        external_id: `accelo_allocation:${a.project_id}:${stage_id}:${a.resource_id}`,
        stage_id,
        resource_id: a.resource_id,
        start_date: stage.start_date,
        end_date: stage.end_date,
        hours_per_day: Math.round(hpd * 100) / 100,
        total_hours_imported: Math.round(totalHours * 100) / 100,
        source: "imported_accelo",
        is_locked: true,
      });
    }
    for (let i = 0; i < allocPayload.length; i += 500) {
      await supabase
        .from("pm_allocations")
        .upsert(allocPayload.slice(i, i + 500), { onConflict: "external_id" });
    }
  }

  // Link historical_time_entries.stage_id by external_id (idempotent).
  if (historicalStageLinks.size && stageIdByKey.size) {
    const updates = new Map<string, string[]>(); // stage_id -> [external_ids]
    for (const [extId, stageKey] of historicalStageLinks) {
      const stage_id = stageIdByKey.get(stageKey);
      if (!stage_id) continue;
      const arr = updates.get(stage_id) ?? [];
      arr.push(extId);
      updates.set(stage_id, arr);
    }
    for (const [stage_id, extIds] of updates) {
      for (let i = 0; i < extIds.length; i += 500) {
        await supabase
          .from("historical_time_entries")
          .update({ stage_id })
          .eq("source_system", SOURCE_SYSTEM)
          .in("external_id", extIds.slice(i, i + 500));
      }
    }
  }

  await supabase
    .from("import_jobs")
    .update({
      status: errors ? "failed" : "imported",
      imported_count: imported,
      skipped_count: skipped,
      error_count: errors,
      completed_at: new Date().toISOString(),
    })
    .eq("id", preview.jobId);

  return { imported, skipped, errors };
}

export async function listImportJobs() {
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function listCollaboratorsForMapping() {
  const { data, error } = await supabase
    .from("collaborators")
    .select("id,nome,email")
    .is("archived_at", null)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function saveIdentityMapping(input: {
  source_identifier: string;
  source_name: string | null;
  collaborator_id: string;
  resource_id?: string | null;
  notes?: string | null;
}) {
  const userRes = await supabase.auth.getUser();
  // Deactivate any existing active mapping for this (source_system, identifier)
  await supabase
    .from("import_identity_mappings")
    .update({ active: false })
    .eq("source_system", SOURCE_SYSTEM)
    .eq("source_identifier", input.source_identifier.toLowerCase())
    .eq("active", true);

  const { error } = await supabase.from("import_identity_mappings").insert({
    source_system: SOURCE_SYSTEM,
    source_identifier: input.source_identifier.toLowerCase(),
    source_name: input.source_name,
    collaborator_id: input.collaborator_id,
    resource_id: input.resource_id ?? null,
    notes: input.notes ?? null,
    active: true,
    created_by: userRes.data.user?.id ?? null,
  });
  if (error) throw error;
}

/** Re-runs preview/validation against an already-uploaded file (no re-upload). */
export async function revalidatePreview(file: File, jobId: string): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const { rows } = parseAcceloActivityExport(buffer);
  const externals = Array.from(new Set(rows.map((r) => r.external_id).filter(Boolean)));
  const existing = new Set<string>();
  if (externals.length) {
    const { data } = await supabase
      .from("historical_time_entries")
      .select("external_id")
      .eq("source_system", SOURCE_SYSTEM)
      .in("external_id", externals);
    (data ?? []).forEach((d) => d.external_id && existing.add(d.external_id));
  }
  const maps = await lookupMaps(rows);
  const { validations, duplicates } = validateRows(rows, maps, existing);

  const unmatchedCollabs = new Map<string, { email: string | null; name: string }>();
  const unmatchedProjects = new Set<string>();
  const unmatchedCompanies = new Set<string>();
  validations.forEach((v) => {
    if (!v.matched.collaborator_id && v.row.from_email)
      unmatchedCollabs.set(v.row.from_email, { email: v.row.from_email, name: v.row.from_name });
    if (!v.matched.project_id && v.row.reference) unmatchedProjects.add(v.row.reference);
    if (!v.matched.company_id && v.row.company) unmatchedCompanies.add(v.row.company);
  });

  return {
    jobId,
    filename: file.name,
    storagePath: null,
    storageWarning: null,
    totals: {
      rows: validations.length,
      valid: validations.filter((v) => v.status === "valid").length,
      warning: validations.filter((v) => v.status === "warning").length,
      error: validations.filter((v) => v.status === "error").length,
      duplicates,
    },
    unmatched: {
      collaborators: Array.from(unmatchedCollabs.values()),
      projects: Array.from(unmatchedProjects),
      companies: Array.from(unmatchedCompanies),
    },
    rows: validations,
  };
}
