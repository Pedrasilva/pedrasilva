import { gzipSync } from "node:zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

export const BACKUP_TABLES: string[] = [
  // Quotes & proposals
  "fee_proposals",
  "fee_proposal_audit_log",
  "fee_proposal_number_counters",
  "quote_stages",
  "quote_stage_dependencies",
  "quote_stage_supplier_costs",
  "quote_allocations",
  "quote_external_services",
  "quote_payment_schedule_items",
  "quote_proposal_documents",
  "quote_proposal_document_blocks",
  "quote_supplier_phase_splits",
  "quote_templates",
  "quote_template_stages",
  "quote_template_dependencies",
  "quote_template_allocations",
  "quote_template_external_services",
  "quote_template_payment_rules",
  "quote_template_blocks",
  // Projects
  "pm_projects",
  "pm_stages",
  "pm_stage_dependencies",
  "pm_stage_supplier_costs",
  "pm_stage_allocation_placeholders",
  "pm_stage_capacity_snapshots",
  "pm_stage_commercial_baselines",
  "pm_allocations",
  "pm_resources",
  "pm_resource_rates",
  "pm_resource_allocations_forecast",
  "pm_project_rate_overrides",
  "pm_project_commercial_baselines",
  "pm_project_contract_baseline",
  "pm_project_contract_baseline_stages",
  "pm_project_contract_baseline_payments",
  "pm_project_forecast_metrics",
  "pm_tasks",
  "pm_time_entries",
  "pm_activities",
  "pm_activity_replies",
  "pm_materials",
  "pm_expenses",
  "pm_invoices",
  "pm_invoice_items",
  "pm_invoice_settings",
  "pm_internal_categories",
  "pm_suppliers",
  "project_bootstrap_runs",
  "projects",
  // CRM
  "crm_accounts",
  "crm_opportunities",
  "crm_activities",
  "opportunity_activities",
  "companies",
  "contacts",
  "contracts",
  "contract_clauses",
  "contract_events",
  "contract_exhibits",
  // HR
  "collaborators",
  "salary_snapshots",
  "vacation_requests",
  "holidays",
  "benefit_balances",
  "benefit_categories",
  "benefit_yearly_credits",
  "benefit_expenses",
  "benefit_expense_events",
  "benefit_expense_ocr_extractions",
  "benefit_expense_drive_sync",
  "benefit_notification_queue",
  "bo_settings",
  "meal_allowance_rates",
  "irs_tax_brackets",
  // Finance
  "financial_documents",
  "financial_document_lines",
  "financial_document_payments",
  "financial_expense_items",
  "financial_expense_payments",
  "financial_income_items",
  "financial_periods",
  "financial_classifications",
  "financial_debts",
  "financial_debt_payments",
  "financial_import_logs",
  "company_expenses",
  "expense_categories",
  "bank_accounts",
  "bank_transactions",
  "bank_balance_snapshots",
  "bank_classification_rules",
  "bank_transaction_classifications",
  "bank_statement_imports",
  // Permissions & roles
  "user_roles",
  "user_role_assignments",
  "user_permissions",
  "role_permissions",
  "pending_user_permissions",
  // Historical time
  "historical_time_entries",
];

export type Trigger = "daily" | "weekly" | "manual";

function driveHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_DRIVE_API_KEY)
    throw new Error("GOOGLE_DRIVE_API_KEY is not configured (Google Drive connector not linked)");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    ...extra,
  };
}

async function ensureSubfolder(parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
  );
  const findRes = await fetch(
    `${GATEWAY_BASE}/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: driveHeaders() },
  );
  if (findRes.ok) {
    const json = (await findRes.json()) as { files?: { id: string; name: string }[] };
    if (json.files && json.files.length > 0) return json.files[0].id;
  }
  const createRes = await fetch(
    `${GATEWAY_BASE}/drive/v3/files?fields=id&supportsAllDrives=true`,
    {
      method: "POST",
      headers: driveHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  const text = await createRes.text();
  if (!createRes.ok) throw new Error(`Drive folder create failed [${createRes.status}]: ${text}`);
  return (JSON.parse(text) as { id: string }).id;
}

async function uploadFile(
  folderId: string,
  filename: string,
  mime: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `lov-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await fetch(
    `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: "POST",
      headers: driveHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${text}`);
  return JSON.parse(text) as { id: string; webViewLink?: string };
}

async function dumpAllTables() {
  const payload: Record<string, unknown[]> = {};
  const errors: { table: string; message: string }[] = [];
  let rowCount = 0;
  let tableCount = 0;
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        range: (
          a: number,
          b: number,
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
  for (const t of BACKUP_TABLES) {
    try {
      const pageSize = 1000;
      let from = 0;
      const all: unknown[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await admin.from(t).select("*").range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      payload[t] = all;
      rowCount += all.length;
      tableCount++;
    } catch (err) {
      errors.push({ table: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { payload, rowCount, tableCount, errors };
}

export async function performBackup(trigger: Trigger, triggeredBy: string | null) {
  const rootFolderId = process.env.BACKUP_DRIVE_FOLDER_ID?.trim();
  if (!rootFolderId) {
    throw new Error(
      "BACKUP_DRIVE_FOLDER_ID is not configured. Set it to the Google Drive folder ID where backups should be uploaded.",
    );
  }

  const { data: runIns, error: runErr } = await supabaseAdmin
    .from("backup_runs")
    .insert({
      trigger,
      status: "running",
      triggered_by: triggeredBy,
      drive_folder_id: rootFolderId,
    })
    .select("id")
    .single();
  if (runErr || !runIns) throw new Error(`Could not record backup run: ${runErr?.message}`);
  const runId = runIns.id as string;

  try {
    const subfolder = await ensureSubfolder(rootFolderId, trigger);
    const { payload, rowCount, tableCount, errors } = await dumpAllTables();

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}_${trigger}.json.gz`;
    const meta = {
      generated_at: new Date().toISOString(),
      trigger,
      tables: tableCount,
      rows: rowCount,
      errors,
      app: "psa-hub",
    };
    const json = JSON.stringify({ _meta: meta, data: payload });
    const gz = gzipSync(Buffer.from(json, "utf8"));

    const uploaded = await uploadFile(
      subfolder,
      filename,
      "application/gzip",
      new Uint8Array(gz.buffer, gz.byteOffset, gz.byteLength),
    );

    await supabaseAdmin
      .from("backup_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        drive_file_id: uploaded.id,
        drive_file_name: filename,
        drive_url: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
        size_bytes: gz.byteLength,
        tables_count: tableCount,
        rows_count: rowCount,
        error: errors.length ? `Partial: ${errors.length} table error(s)` : null,
      })
      .eq("id", runId);

    return {
      runId,
      filename,
      driveFileId: uploaded.id,
      driveUrl: uploaded.webViewLink ?? null,
      tables: tableCount,
      rows: rowCount,
      sizeBytes: gz.byteLength,
      partialErrors: errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("backup_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message.slice(0, 2000),
      })
      .eq("id", runId);
    throw err;
  }
}

export async function listAllBackupRuns() {
  const { data, error } = await supabaseAdmin
    .from("backup_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
