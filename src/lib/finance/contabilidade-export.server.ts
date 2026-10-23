/**
 * One-way mirror of CONFIRMED documents to Drive "Contabilidade" (the Hub stays
 * the source of truth):
 *   Contabilidade/<PSA|Pedra Rioja>/<YYYY>/<YYYY-MM>/
 *     01 Extratos bancarios/<conta ou cartão> · 02 Faturas de compra · 03 Faturas emitidas
 *     04 Despesas e reembolsos RH · 05 Outros documentos · 06 Reconciliacao
 * Each export is tracked in finance_accounting_exports. When a document is
 * corrected/reclassified its copy is moved/renamed; when cancelled it goes to
 * Drive trash, so no stale copies remain. Never deletes permanently.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { driveHeaders, driveJson, driveUrl, getFinanceDriveConfig } from "@/lib/finance/drive-config.server";

export const SUBFOLDERS = {
  statements: "01 Extratos bancarios",
  purchases: "02 Faturas de compra",
  issued: "03 Faturas emitidas",
  hr: "04 Despesas e reembolsos RH",
  other: "05 Outros documentos",
  reconciliation: "06 Reconciliacao",
} as const;
export const BACKFILL_FROM = "2026-06-01";
const BUCKET = "financial-documents";

/** Filesystem-safe name segment. */
export function safeSeg(s: string | null | undefined, fallback = "sem-nome", max = 60): string {
  const v = (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|#%{}~&]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return v || fallback;
}
export const amountSeg = (n: number | null | undefined) => (Number(n) || 0).toFixed(2).replace(".", ",") + "EUR";

export function documentFileName(d: { issue_date: string; counterparty: string | null; number: string | null; total: number; ext: string }) {
  return `${d.issue_date}_${safeSeg(d.counterparty)}_${safeSeg(d.number, "sn", 40)}_${amountSeg(d.total)}.${d.ext}`;
}
export function statementFileName(period: string, account: string, kind: "extrato" | "nota-lancamento", n: string | null, ext: string) {
  return `${period}_${safeSeg(account, "conta", 50)}_${kind}_${safeSeg(n, "1", 20)}.${ext}`;
}
export const entityFolderName = (name: string | null | undefined) => (/rioja/i.test(name ?? "") ? "Pedra Rioja" : "PSA");

// ---------------------------------------------------------------- folders

const folderMemo = new Map<string, string>();
async function findOrCreateFolder(name: string, parent: string, driveId: string | null): Promise<string> {
  const key = `${parent}/${name}`;
  const hit = folderMemo.get(key);
  if (hit) return hit;
  const q = `'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await driveJson(driveUrl("/drive/v3/files", { q, fields: "files(id)", pageSize: "1" }, { list: true, driveId }));
  let id: string = found.files?.[0]?.id;
  if (!id) {
    const made = await driveJson(driveUrl("/drive/v3/files", { fields: "id" }), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
    });
    id = made.id;
  }
  folderMemo.set(key, id);
  return id;
}

export async function ensurePath(root: string, segs: string[], driveId: string | null): Promise<string> {
  let parent = root;
  for (const s of segs) parent = await findOrCreateFolder(s, parent, driveId);
  return parent;
}

/** Ensures the month folder with all 6 subfolders and returns the target subfolder id. */
async function monthFolder(root: string, entity: string, period: string, sub: string, extra: string[], driveId: string | null) {
  const year = period.slice(0, 4);
  const month = await ensurePath(root, [entity, year, period], driveId);
  for (const s of Object.values(SUBFOLDERS)) await findOrCreateFolder(s, month, driveId);
  return ensurePath(month, [sub, ...extra], driveId);
}

// ---------------------------------------------------------------- upload/move

export async function uploadBytes(name: string, parent: string, bytes: Uint8Array, mime: string) {
  const boundary = `psahub-${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0); body.set(bytes, pre.length); body.set(post, pre.length + bytes.length);
  const j = await driveJson(driveUrl("/upload/drive/v3/files", { uploadType: "multipart", fields: "id,webViewLink" }), {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return { id: j.id as string, link: (j.webViewLink as string) ?? `https://drive.google.com/file/d/${j.id}/view` };
}

async function moveRename(fileId: string, name: string, toFolder: string) {
  const meta = await driveJson(driveUrl(`/drive/v3/files/${fileId}`, { fields: "parents,trashed" }));
  const from = (meta.parents ?? []).join(",");
  const params: Record<string, string> = { fields: "id,webViewLink" };
  if (!(meta.parents ?? []).includes(toFolder)) { params.addParents = toFolder; if (from) params.removeParents = from; }
  const j = await driveJson(driveUrl(`/drive/v3/files/${fileId}`, params), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, trashed: false }),
  });
  return (j.webViewLink as string) ?? `https://drive.google.com/file/d/${fileId}/view`;
}

export async function trashFile(fileId: string) {
  await driveJson(driveUrl(`/drive/v3/files/${fileId}`, { fields: "id" }), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  });
}

async function fileExists(fileId: string): Promise<boolean> {
  const res = await fetch(driveUrl(`/drive/v3/files/${fileId}`, { fields: "id,trashed" }), { headers: driveHeaders() });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return !(await res.json()).trashed;
}

// ---------------------------------------------------------------- targets

type Target = {
  kind: "document" | "statement";
  sourceId: string;
  entityId: string;
  period: string;
  sub: string;
  extra: string[];
  name: string;
  bucket: string;
  path: string | null;
  keep: boolean; // false = cancelled → remove copy
  legacyDriveFileId?: string | null;
};

const extOf = (p: string | null) => (p?.split(".").pop() ?? "pdf").toLowerCase().slice(0, 5);
/* eslint-disable @typescript-eslint/no-explicit-any */
async function pageAll(build: (f: number) => any) {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build(f);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function collectTargets(since = BACKFILL_FROM): Promise<Target[]> {
  const [docs, hr, stmts, accts, cards] = await Promise.all([
    pageAll((f) => supabaseAdmin.from("financial_documents")
      .select("id, entity_id, doc_type, status, issue_date, document_number, total_inc_vat, file_path, counterparty_name_snapshot, companies:counterparty_supplier_id(nome)")
      .gte("issue_date", since).order("id").range(f, f + 999)),
    pageAll((f) => supabaseAdmin.from("finance_holder_reimbursements").select("document_id").order("id").range(f, f + 999)),
    pageAll((f) => supabaseAdmin.from("financial_document_review_queue")
      .select("id, entity_id, intake_type, bank_period, source_bucket, source_file_url, matched_bank_account_id, matched_payment_card_id, extracted_statement_number, drive_file_id")
      .eq("status", "filed").eq("intake_route", "bank").gte("bank_period", since.slice(0, 7)).order("id").range(f, f + 999)),
    pageAll((f) => supabaseAdmin.from("bank_accounts").select("id, bank_name, account_name").range(f, f + 999)),
    pageAll((f) => supabaseAdmin.from("payment_cards").select("id, nickname, bank, last4").range(f, f + 999)),
  ]);
  const hrDocs = new Set(hr.map((r) => r.document_id));
  const acct = new Map(accts.map((a) => [a.id, [a.bank_name, a.account_name].filter(Boolean).join(" ")]));
  const card = new Map(cards.map((c) => [c.id, [c.nickname ?? c.bank, c.last4 ? `cartao ${c.last4}` : null].filter(Boolean).join(" ")]));
  const out: Target[] = [];
  for (const d of docs) {
    if (!d.file_path || !d.issue_date) continue;
    const sub = hrDocs.has(d.id) ? SUBFOLDERS.hr
      : d.doc_type === "supplier_invoice" ? SUBFOLDERS.purchases
      : d.doc_type === "client_invoice" ? SUBFOLDERS.issued
      : SUBFOLDERS.other;
    out.push({
      kind: "document", sourceId: d.id, entityId: d.entity_id, period: d.issue_date.slice(0, 7), sub, extra: [],
      name: documentFileName({ issue_date: d.issue_date, counterparty: d.companies?.nome ?? d.counterparty_name_snapshot, number: d.document_number, total: Number(d.total_inc_vat), ext: extOf(d.file_path) }),
      bucket: BUCKET, path: d.file_path, keep: d.status !== "cancelled",
    });
  }
  for (const s of stmts) {
    if (!s.source_file_url || !s.bank_period) continue;
    const label = s.matched_payment_card_id ? card.get(s.matched_payment_card_id) : acct.get(s.matched_bank_account_id);
    const accountLabel = safeSeg(label, "conta");
    out.push({
      kind: "statement", sourceId: s.id, entityId: s.entity_id, period: s.bank_period, sub: SUBFOLDERS.statements, extra: [accountLabel],
      name: statementFileName(s.bank_period, accountLabel, s.intake_type === "nota_lancamento" ? "nota-lancamento" : "extrato", s.extracted_statement_number, extOf(s.source_file_url)),
      bucket: s.source_bucket ?? BUCKET, path: s.source_file_url, keep: true, legacyDriveFileId: s.drive_file_id,
    });
  }
  return out;
}

export type ExportSummary = { uploaded: number; moved: number; removed: number; unchanged: number; failed: number; errors: string[] };

/** Brings Drive in line with the Hub for up to `limit` changed targets. */
export async function runAccountingExport(opts: { limit?: number; since?: string } = {}): Promise<ExportSummary> {
  const sum: ExportSummary = { uploaded: 0, moved: 0, removed: 0, unchanged: 0, failed: 0, errors: [] };
  const cfg = await getFinanceDriveConfig();
  if (!cfg.contabilidade) throw new Error("Contabilidade folder is not configured");
  const root = cfg.contabilidade;
  const { data: ents } = await supabaseAdmin.from("finance_entities").select("id, name");
  const entName = new Map((ents ?? []).map((e) => [e.id, entityFolderName(e.name)]));
  const targets = await collectTargets(opts.since);
  const existing = await pageAll((f) => supabaseAdmin.from("finance_accounting_exports")
    .select("*").in("source_kind", ["document", "statement"]).order("id").range(f, f + 999));
  const byKey = new Map(existing.map((r) => [`${r.source_kind}:${r.source_id}`, r]));
  let budget = opts.limit ?? 40;

  for (const t of targets) {
    if (budget <= 0) break;
    const row = byKey.get(`${t.kind}:${t.sourceId}`);
    const entity = entName.get(t.entityId) ?? "PSA";
    const folderPath = [entity, t.period.slice(0, 4), t.period, t.sub, ...t.extra].join("/");
    try {
      if (!t.keep) {
        if (row?.status === "exported" && row.drive_file_id) {
          budget--;
          await trashFile(row.drive_file_id);
          await supabaseAdmin.from("finance_accounting_exports").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", row.id);
          sum.removed++;
        }
        continue;
      }
      if (row?.status === "exported" && row.folder_path === folderPath && row.file_name === t.name) { sum.unchanged++; continue; }
      budget--;
      const folder = await monthFolder(root, entity, t.period, t.sub, t.extra, cfg.sharedDriveId);
      const reuse = row?.drive_file_id ?? t.legacyDriveFileId ?? null;
      let fileId: string, link: string;
      if (reuse && (await fileExists(reuse))) {
        fileId = reuse;
        link = await moveRename(reuse, t.name, folder);
        sum.moved++;
      } else {
        const { data: blob, error } = await supabaseAdmin.storage.from(t.bucket).download(t.path!);
        if (error || !blob) throw new Error(`download: ${error?.message ?? "no file"}`);
        const up = await uploadBytes(t.name, folder, new Uint8Array(await blob.arrayBuffer()), blob.type || "application/pdf");
        fileId = up.id; link = up.link;
        sum.uploaded++;
      }
      const values = {
        entity_id: t.entityId, source_kind: t.kind, source_id: t.sourceId, version: 1, subfolder: t.sub, period: t.period,
        folder_path: folderPath, drive_folder_id: folder, drive_file_id: fileId, drive_link: link, file_name: t.name,
        status: "exported", last_error: null, updated_at: new Date().toISOString(),
      };
      const { error: wErr } = await supabaseAdmin.from("finance_accounting_exports").upsert(values, { onConflict: "source_kind,source_id,version" });
      if (wErr) throw new Error(wErr.message);
      if (t.kind === "statement") {
        await supabaseAdmin.from("financial_document_review_queue").update({
          drive_file_id: fileId, drive_web_link: link, drive_copy_status: "copied", drive_copied_at: new Date().toISOString(), drive_copy_error: null,
        }).eq("id", t.sourceId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sum.failed++;
      sum.errors.push(`${t.name}: ${msg}`.slice(0, 300));
      await supabaseAdmin.from("finance_accounting_exports").upsert({
        entity_id: t.entityId, source_kind: t.kind, source_id: t.sourceId, version: 1, subfolder: t.sub, period: t.period,
        folder_path: folderPath, file_name: t.name, status: row?.status === "exported" ? "exported" : "failed",
        drive_file_id: row?.drive_file_id ?? null, last_error: msg.slice(0, 1000), updated_at: new Date().toISOString(),
      }, { onConflict: "source_kind,source_id,version" });
    }
  }
  return sum;
}
