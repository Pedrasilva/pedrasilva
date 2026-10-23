/**
 * Reconciliation report per locked statement period (account × month), written
 * as PDF + XLSX to Contabilidade/<empresa>/<YYYY>/<YYYY-MM>/06 Reconciliacao.
 * Version = number of times the period was locked; a re-lock after reopening
 * writes a new "_v<n>" pair and keeps the earlier ones.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getFinanceDriveConfig } from "@/lib/finance/drive-config.server";
import { BACKFILL_FROM, SUBFOLDERS, ensurePath, entityFolderName, safeSeg, uploadBytes } from "@/lib/finance/contabilidade-export.server";

type Mv = { date: string; description: string; amount: number; docs: string[]; note: string | null };
export type ReportData = {
  entity: string; account: string; period: string; statementNumber: string | null; start: string; end: string;
  openingStatement: number; closingStatement: number; openingHub: number; closingHub: number; movements: Mv[];
};

const eur = (n: number) => n.toFixed(2).replace(".", ",");
const latin = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");

export async function buildReportPdf(r: ReportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const line = (text: string, o: { b?: boolean; size?: number; x?: number } = {}) => {
    if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(latin(text).slice(0, 110), { x: o.x ?? 40, y, size: o.size ?? 8.5, font: o.b ? bold : font });
    y -= (o.size ?? 8.5) + 4;
  };
  const row = (m: Mv) => {
    if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(m.date, { x: 40, y, size: 8, font });
    page.drawText(latin(m.description).slice(0, 48), { x: 95, y, size: 8, font });
    const a = eur(m.amount);
    page.drawText(a, { x: 360 - font.widthOfTextAtSize(a, 8), y, size: 8, font });
    page.drawText(latin(m.docs.join("; ") || m.note || "-").slice(0, 48), { x: 370, y, size: 7, font });
    y -= 11;
  };
  line(`Reconciliacao bancaria - ${r.entity}`, { b: true, size: 14 });
  line(`${r.account} · ${r.period}${r.statementNumber ? ` · extrato ${r.statementNumber}` : ""} · ${r.start} a ${r.end}`, { size: 10 });
  y -= 6;
  line(`Saldo inicial: extrato ${eur(r.openingStatement)} | Hub ${eur(r.openingHub)}`);
  line(`Saldo final:   extrato ${eur(r.closingStatement)} | Hub ${eur(r.closingHub)} | diferenca ${eur(r.closingStatement - r.closingHub)}`);
  y -= 8;
  line("Movimentos", { b: true, size: 11 });
  for (const m of r.movements) row(m);
  const without = r.movements.filter((m) => m.docs.length === 0);
  y -= 8;
  line(`Movimentos sem documento (${without.length})`, { b: true, size: 11 });
  for (const m of without) row(m);
  return pdf.save();
}

export function buildReportXlsx(r: ReportData): Uint8Array {
  const wb = XLSX.utils.book_new();
  const head = [
    ["Empresa", r.entity], ["Conta", r.account], ["Periodo", r.period], ["Extrato", r.statementNumber ?? ""],
    ["Saldo inicial extrato", r.openingStatement], ["Saldo inicial Hub", r.openingHub],
    ["Saldo final extrato", r.closingStatement], ["Saldo final Hub", r.closingHub],
    ["Diferenca", Number((r.closingStatement - r.closingHub).toFixed(2))], [],
    ["Data", "Descricao", "Valor", "Documentos", "Nota"],
    ...r.movements.map((m) => [m.date, m.description, m.amount, m.docs.join("; "), m.note ?? ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), "Reconciliacao");
  const without = r.movements.filter((m) => m.docs.length === 0);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Data", "Descricao", "Valor", "Nota"], ...without.map((m) => [m.date, m.description, m.amount, m.note ?? ""])]), "Movimentos sem documento");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadReport(p: any): Promise<ReportData> {
  const [{ data: ent }, { data: acct }, { data: card }, { data: txs }] = await Promise.all([
    supabaseAdmin.from("finance_entities").select("name").eq("id", p.entity_id).maybeSingle(),
    supabaseAdmin.from("bank_accounts").select("bank_name, account_name").eq("id", p.bank_account_id).maybeSingle(),
    p.payment_card_id ? supabaseAdmin.from("payment_cards").select("nickname, bank, last4").eq("id", p.payment_card_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from("bank_transactions").select("id, transaction_date, description, amount, status, ignored_reason")
      .eq("statement_period_id", p.id).order("transaction_date").order("id"),
  ]);
  const ids = (txs ?? []).map((t) => t.id);
  const docsByTx = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: pays } = await supabaseAdmin.from("financial_document_payments")
      .select("bank_transaction_id, document_id, financial_documents:document_id(document_number)").in("bank_transaction_id", ids.slice(i, i + 200));
    const docIds = [...new Set((pays ?? []).map((x: any) => x.document_id))];
    const { data: ex } = docIds.length
      ? await supabaseAdmin.from("finance_accounting_exports").select("source_id, file_name").eq("source_kind", "document").eq("status", "exported").in("source_id", docIds)
      : { data: [] as any[] };
    const fname = new Map((ex ?? []).map((e: any) => [e.source_id, e.file_name]));
    for (const x of (pays ?? []) as any[]) {
      const label = fname.get(x.document_id) ?? x.financial_documents?.document_number ?? x.document_id.slice(0, 8);
      docsByTx.set(x.bank_transaction_id, [...(docsByTx.get(x.bank_transaction_id) ?? []), label]);
    }
  }
  const sum = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const label = card ? [card.nickname ?? card.bank, card.last4 ? `cartao ${card.last4}` : null].filter(Boolean).join(" ") : [acct?.bank_name, acct?.account_name].filter(Boolean).join(" ");
  const opening = Number(p.opening_balance) || 0;
  return {
    entity: entityFolderName(ent?.name), account: label || "conta", period: String(p.period_end_date).slice(0, 7),
    statementNumber: p.statement_number, start: p.period_start_date, end: p.period_end_date,
    openingStatement: opening, closingStatement: Number(p.closing_balance) || 0,
    openingHub: opening, closingHub: Number((opening + sum).toFixed(2)),
    movements: (txs ?? []).map((t) => ({
      date: t.transaction_date, description: t.description ?? "", amount: Number(t.amount),
      docs: docsByTx.get(t.id) ?? [], note: t.status === "ignored" ? `ignorado: ${t.ignored_reason ?? ""}` : null,
    })),
  };
}

export async function runReconciliationReports(opts: { limit?: number } = {}) {
  const out = { written: 0, skipped: 0, failed: 0, errors: [] as string[] };
  const cfg = await getFinanceDriveConfig();
  if (!cfg.contabilidade) throw new Error("Contabilidade folder is not configured");
  const { data: periods } = await supabaseAdmin.from("bank_statement_periods").select("*")
    .not("locked_at", "is", null).gte("period_end_date", BACKFILL_FROM);
  let budget = opts.limit ?? 10;
  for (const p of periods ?? []) {
    if (budget <= 0) break;
    const { count } = await supabaseAdmin.from("bank_statement_period_log").select("id", { count: "exact", head: true }).eq("period_id", p.id).eq("action", "lock");
    const version = Math.max(1, count ?? 1);
    const { data: done } = await supabaseAdmin.from("finance_accounting_exports").select("id")
      .eq("source_kind", "report_pdf").eq("source_id", p.id).eq("version", version).eq("status", "exported").maybeSingle();
    if (done) { out.skipped++; continue; }
    budget--;
    try {
      const r = await loadReport(p);
      const base = `${r.period}_${safeSeg(r.account, "conta", 50)}_reconciliacao${version > 1 ? `_v${version}` : ""}`;
      const folderPath = [r.entity, r.period.slice(0, 4), r.period, SUBFOLDERS.reconciliation].join("/");
      const folder = await ensurePath(cfg.contabilidade, folderPath.split("/"), cfg.sharedDriveId);
      for (const [kind, ext, bytes, mime] of [
        ["report_pdf", "pdf", await buildReportPdf(r), "application/pdf"],
        ["report_xlsx", "xlsx", buildReportXlsx(r), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ] as const) {
        const up = await uploadBytes(`${base}.${ext}`, folder, bytes, mime);
        await supabaseAdmin.from("finance_accounting_exports").upsert({
          entity_id: p.entity_id, source_kind: kind, source_id: p.id, version, source_stamp: p.locked_at,
          subfolder: SUBFOLDERS.reconciliation, period: r.period, folder_path: folderPath, drive_folder_id: folder,
          drive_file_id: up.id, drive_link: up.link, file_name: `${base}.${ext}`, status: "exported", updated_at: new Date().toISOString(),
        }, { onConflict: "source_kind,source_id,version" });
      }
      out.written++;
    } catch (e) {
      out.failed++;
      out.errors.push(`${p.statement_number ?? p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }
  return out;
}
