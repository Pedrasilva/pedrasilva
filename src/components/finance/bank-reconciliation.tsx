import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Upload, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, Filter, X, Plus, Trash2, Loader2, Info, MoreHorizontal, Link2, Search, ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  parseBankStatementWorkbook,
  computeFileChecksum,
  applyRules,
  type ParsedBankRow,
  type ParseResult,
  type RuleRow,
} from "@/lib/finance/bank-statement-parser";
import { MatchBankTxToDocDialog } from "@/components/finance/match-bank-tx-to-doc";
import { MatchBankTxToReimbursementDialog } from "@/components/finance/match-bank-tx-to-reimbursement";
import { ClassificationPicker } from "@/components/finance/classification-picker";
import { useSupplierDefaultClassifications } from "@/lib/finance/use-supplier-classifications";
import { BankImportsManager } from "@/components/finance/bank-imports-manager";
import { InlineCounterpartyDialog } from "@/components/finance/inline-counterparty-dialog";
import { CreateDocFromTxDialog } from "@/components/finance/create-doc-from-tx";

type BankAccount = { id: string; account_name: string; bank_name: string | null; account_number: string | null; iban: string | null; currency: string };
type Classification = { id: string; code: string; name_pt: string; name_en: string; financial_nature: string; spending_policy: string; supplier_required: boolean; project_link_allowed: boolean; collaborator_link_allowed: boolean; reimbursable_default: boolean };
type BankTx = { id: string; bank_account_id: string; transaction_date: string; value_date: string | null; description: string; amount: number; running_balance: number | null; currency: string; status: string; suggested_classification_id: string | null; ignored_reason: string | null };
type Supplier = { id: string; name: string };
type Client = { id: string; name: string };
type Project = { id: string; name: string };

export function BankReconciliationTab() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = i18n.language?.startsWith("pt");
  const qc = useQueryClient();

  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts"],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase.from("bank_accounts").select("id, account_name, bank_name, account_number, iban, currency").eq("is_active", true).order("account_name");
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  const classificationsQ = useQuery({
    queryKey: ["finance", "classifications"],
    queryFn: async (): Promise<Classification[]> => {
      const { data, error } = await supabase.from("financial_classifications").select("id, code, name_pt, name_en, financial_nature, spending_policy, supplier_required, project_link_allowed, collaborator_link_allowed, reimbursable_default").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Classification[];
    },
  });

  const rulesQ = useQuery({
    queryKey: ["finance", "bank-rules"],
    queryFn: async (): Promise<RuleRow[]> => {
      const { data, error } = await supabase.from("bank_classification_rules").select("id, match_type, pattern, case_sensitive, classification_id, needs_review, priority, active").eq("active", true);
      if (error) throw error;
      return (data ?? []) as RuleRow[];
    },
  });

  const [selectedAccount, setSelectedAccount] = useState<string>("");
  useEffect(() => {
    if (!selectedAccount && accountsQ.data && accountsQ.data.length > 0) {
      setSelectedAccount(accountsQ.data[0].id);
    }
  }, [accountsQ.data, selectedAccount]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">{t("finance:bankRec.title")}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{t("finance:bankRec.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("finance:bankRec.account")}</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder={t("finance:bankRec.selectAccount")} /></SelectTrigger>
              <SelectContent>
                {(accountsQ.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name}{a.iban ? ` — ${a.iban}` : a.account_number ? ` — ${a.account_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ManageAccountDialog onSaved={() => qc.invalidateQueries({ queryKey: ["finance", "bank-accounts"] })} />
          </div>
        </CardHeader>
        <CardContent>
          {!selectedAccount ? (
            <p className="text-sm text-muted-foreground">{t("finance:bankRec.noAccount")}</p>
          ) : (
            <UploadSection
              accountId={selectedAccount}
              accounts={accountsQ.data ?? []}
              rules={rulesQ.data ?? []}
              isPt={isPt}
              onImported={() => {
                qc.invalidateQueries({ queryKey: ["finance", "bank-tx"] });
                qc.invalidateQueries({ queryKey: ["finance", "bank-imports"] });
              }}
            />
          )}
        </CardContent>
      </Card>

      {selectedAccount && (
        <ReconciliationQueue
          accountId={selectedAccount}
          classifications={classificationsQ.data ?? []}
          isPt={isPt}
        />
      )}
    </div>
  );
}

// =========================================================
// Account create/edit
// =========================================================
function ManageAccountDialog({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation(["finance", "common"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ account_name: "", bank_name: "", account_number: "", iban: "", currency: "EUR" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.account_name.trim()) { toast.error(t("finance:bankRec.accountNameRequired")); return; }
    setSaving(true);
    const { error } = await supabase.from("bank_accounts").insert({
      account_name: form.account_name.trim(),
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      iban: form.iban.trim() || null,
      currency: form.currency || "EUR",
      is_active: true,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("finance:bankRec.accountCreated"));
    setForm({ account_name: "", bank_name: "", account_number: "", iban: "", currency: "EUR" });
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> {t("finance:bankRec.newAccount")}
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("finance:bankRec.newAccount")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("finance:bankRec.accountName")}</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></div>
          <div><Label>{t("finance:bankRec.bankName")}</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("finance:bankRec.accountNumber")}</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
            <div><Label>IBAN</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} /></div>
          </div>
          <div><Label>{t("finance:bankRec.currency")}</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common:cancel")}</Button>
          <Button onClick={save} disabled={saving}>{t("common:save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================
// Upload + Preview + Confirm
// =========================================================
type PreviewState = {
  fileName: string;
  fileChecksum: string;
  fileSize: number;
  parse: ParseResult;
  duplicateCheck: { duplicateCount: number; total: number };
  rowSelection: boolean[];
  ruleHits: (string | null)[]; // classification id or null
};

function UploadSection({ accountId, accounts, rules, isPt, onImported }: { accountId: string; accounts: BankAccount[]; rules: RuleRow[]; isPt: boolean; onImported: () => void }) {
  const { t } = useTranslation(["finance", "common"]);
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsingFileName, setParsingFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setParsing(true);
    setParsingFileName(file.name);
    setPreview(null);
    try {
      // Basic file sanity checks
      const lower = file.name.toLowerCase();
      const hasSupportedExt = [".xlsx", ".xls", ".csv"].some((ext) => lower.endsWith(ext));
      if (!hasSupportedExt) {
        toast.error(t("finance:bankRec.unsupportedFormat", { name: file.name }));
        return;
      }
      if (file.size === 0) {
        toast.error(t("finance:bankRec.emptyFile"));
        return;
      }

      const buf = await file.arrayBuffer();
      const checksum = await computeFileChecksum(file);
      const parse = await parseBankStatementWorkbook(buf);

      // Surface parse-level problems with explicit toasts so the user is never left wondering
      if (parse.diagnostics.headerRowIndex == null) {
        toast.error(t("finance:bankRec.noHeaderDetected"), {
          description: t("finance:bankRec.noHeaderDetectedHint"),
        });
      } else if (parse.diagnostics.unresolvedRequired.length > 0) {
        toast.error(t("finance:bankRec.headerError"), {
          description: t("finance:bankRec.headerErrorDetail", {
            fields: parse.diagnostics.unresolvedRequired.join(", "),
          }),
        });
      } else if (parse.diagnostics.totalDataRows === 0) {
        toast.warning(t("finance:bankRec.noDataRows"), {
          description: t("finance:bankRec.noDataRowsHint"),
        });
      } else if (parse.rows.length === 0) {
        toast.warning(t("finance:bankRec.allRowsSkipped", { count: parse.diagnostics.skipped.length }), {
          description: t("finance:bankRec.allRowsSkippedHint"),
        });
      }

      // Check duplicates against existing tx checksums
      const checksums = parse.rows.map((r) => r.row_checksum);
      let duplicateCount = 0;
      const existingSet = new Set<string>();
      if (checksums.length > 0) {
        const { data: existing } = await supabase
          .from("bank_transactions")
          .select("row_checksum")
          .eq("bank_account_id", accountId)
          .in("row_checksum", checksums);
        duplicateCount = existing?.length ?? 0;
        existing?.forEach((e) => existingSet.add(e.row_checksum));
      }
      // Pre-apply rules
      const ruleHits = parse.rows.map((r) => applyRules(r.description, rules)?.classification_id ?? null);
      // Check file-level duplicate
      const { data: fileDup } = await supabase
        .from("bank_statement_imports")
        .select("id, file_name, imported_at")
        .eq("bank_account_id", accountId)
        .eq("file_checksum", checksum)
        .maybeSingle();
      if (fileDup) {
        toast.warning(t("finance:bankRec.fileAlreadyImported", { name: fileDup.file_name }));
      }
      const rowSelection = parse.rows.map((r) => !existingSet.has(r.row_checksum));

      // Success toast only when there is something to import
      if (parse.rows.length > 0) {
        const importable = rowSelection.filter(Boolean).length;
        if (importable === 0) {
          toast.warning(t("finance:bankRec.allDuplicates"), {
            description: t("finance:bankRec.allDuplicatesHint"),
          });
        } else {
          toast.success(t("finance:bankRec.parseSuccess", { count: parse.rows.length, importable }));
        }
      }

      setPreview({ fileName: file.name, fileChecksum: checksum, fileSize: file.size, parse, duplicateCheck: { duplicateCount, total: parse.rows.length }, rowSelection, ruleHits });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("finance:bankRec.parseError"), { description: msg });
    } finally {
      setParsing(false);
      setParsingFileName(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setConfirming(true);
    try {
      // Insert import log
      const { data: importLog, error: logErr } = await supabase
        .from("bank_statement_imports")
        .insert({
          bank_account_id: accountId,
          file_name: preview.fileName,
          file_checksum: preview.fileChecksum,
          source_file_size_bytes: preview.fileSize,
          period_start: preview.parse.diagnostics.metadata.periodStart,
          period_end: preview.parse.diagnostics.metadata.periodEnd,
          exported_at: preview.parse.diagnostics.metadata.exportedAt,
          rows_total: preview.parse.diagnostics.totalDataRows,
          rows_imported: 0,
          rows_skipped: preview.parse.diagnostics.skipped.length,
          status: "imported",
          imported_by: user?.id ?? null,
          notes: preview.parse.diagnostics.skipped.length ? `${preview.parse.diagnostics.skipped.length} rows skipped during parse` : null,
        })
        .select("id")
        .single();
      if (logErr) throw logErr;

      const selectedRows = preview.parse.rows.filter((_, i) => preview.rowSelection[i]);
      const ruleHits = preview.ruleHits.filter((_, i) => preview.rowSelection[i]);
      const inserts = selectedRows.map((r, i) => ({
        bank_account_id: accountId,
        statement_import_id: importLog.id,
        transaction_date: r.transaction_date,
        value_date: r.value_date,
        description: r.description,
        amount: r.amount,
        running_balance: r.running_balance,
        currency: r.currency,
        notes: r.notes,
        raw_row: r.raw as never,
        row_checksum: r.row_checksum,
        status: "unclassified" as const,
        suggested_classification_id: ruleHits[i],
      }));

      let inserted = 0;
      // Chunk to avoid payload limits
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200);
        const { error: insErr, count } = await supabase
          .from("bank_transactions")
          .insert(chunk, { count: "exact" });
        if (insErr) {
          // Likely duplicate row_checksum — count successfully but skip
          if (insErr.code !== "23505") throw insErr;
        }
        inserted += count ?? chunk.length;
      }

      await supabase.from("bank_statement_imports").update({ rows_imported: inserted }).eq("id", importLog.id);
      toast.success(t("finance:bankRec.importComplete", { count: inserted }));
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("finance:bankRec.importError"));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <Button onClick={() => fileInput.current?.click()} disabled={parsing}>
          {parsing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
          {parsing ? t("finance:bankRec.parsing") : t("finance:bankRec.uploadStatement")}
        </Button>
        {parsing && parsingFileName && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <FileSpreadsheet className="size-3" /> {parsingFileName}
          </span>
        )}
        {preview && !parsing && (
          <Button variant="ghost" size="sm" onClick={() => { setPreview(null); if (fileInput.current) fileInput.current.value = ""; }}>
            <X className="size-4 mr-1" /> {t("common:cancel")}
          </Button>
        )}
        <div className="flex-1" />
        <BankImportsManager accountId={accountId} accounts={accounts} onChanged={onImported} />
      </div>

      {preview && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4" /><span className="font-medium">{preview.fileName}</span>
            <span className="text-muted-foreground">· {(preview.fileSize / 1024).toFixed(1)} KB</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <Stat label={t("finance:bankRec.headerRow")} value={preview.parse.diagnostics.headerRowIndex?.toString() ?? "—"} />
            <Stat label={t("finance:bankRec.totalRows")} value={preview.parse.diagnostics.totalDataRows.toString()} />
            <Stat label={t("finance:bankRec.duplicateRows")} value={preview.duplicateCheck.duplicateCount.toString()} tone={preview.duplicateCheck.duplicateCount > 0 ? "warn" : "neutral"} />
            <Stat label={t("finance:bankRec.skippedRows")} value={preview.parse.diagnostics.skipped.length.toString()} tone={preview.parse.diagnostics.skipped.length > 0 ? "warn" : "neutral"} />
          </div>

          {preview.parse.diagnostics.headerRowIndex == null ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive p-3 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{t("finance:bankRec.noHeaderDetected")}</div>
                <div className="text-xs mt-1">{t("finance:bankRec.noHeaderDetectedHint")}</div>
              </div>
            </div>
          ) : preview.parse.diagnostics.unresolvedRequired.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive p-3 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{t("finance:bankRec.headerError")}</div>
                <div className="text-xs mt-1">{t("finance:bankRec.headerErrorDetail", { fields: preview.parse.diagnostics.unresolvedRequired.join(", ") })}</div>
              </div>
            </div>
          ) : preview.parse.rows.length === 0 ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-sm">
                <Info className="size-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div className="font-medium">
                    {preview.parse.diagnostics.totalDataRows === 0
                      ? t("finance:bankRec.noDataRows")
                      : t("finance:bankRec.allRowsSkipped", { count: preview.parse.diagnostics.skipped.length })}
                  </div>
                  <div className="text-xs">
                    {preview.parse.diagnostics.totalDataRows === 0
                      ? t("finance:bankRec.noDataRowsHint")
                      : t("finance:bankRec.allRowsSkippedHint")}
                  </div>
                </div>
              </div>
              {preview.parse.diagnostics.skipped.length > 0 && (
                <details className="text-xs text-muted-foreground border rounded-md p-2 bg-background">
                  <summary className="cursor-pointer font-medium">
                    {t("finance:bankRec.skippedDetails", { count: preview.parse.diagnostics.skipped.length })}
                  </summary>
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-auto">
                    {preview.parse.diagnostics.skipped.slice(0, 50).map((s, i) => (
                      <li key={i}>
                        {t("finance:bankRec.skippedRowLine", { row: s.rowIndex, reason: s.reason })}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                {t("finance:bankRec.resolvedHeaders")}: {Object.entries(preview.parse.diagnostics.resolvedHeaders).map(([k, v]) => `${k}=${v}`).join(" · ")}
              </div>

              <div className="max-h-[400px] overflow-auto border rounded-md bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"><input type="checkbox" checked={preview.rowSelection.every(Boolean)} onChange={(e) => setPreview({ ...preview, rowSelection: preview.rowSelection.map(() => e.target.checked) })} /></TableHead>
                      <TableHead>{t("finance:bankRec.col.date")}</TableHead>
                      <TableHead>{t("finance:bankRec.col.description")}</TableHead>
                      <TableHead className="text-right">{t("finance:bankRec.col.amount")}</TableHead>
                      <TableHead className="text-right">{t("finance:bankRec.col.balance")}</TableHead>
                      <TableHead>{t("finance:bankRec.col.suggestion")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.parse.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><input type="checkbox" checked={preview.rowSelection[i]} onChange={(e) => { const next = [...preview.rowSelection]; next[i] = e.target.checked; setPreview({ ...preview, rowSelection: next }); }} /></TableCell>
                        <TableCell className="text-xs">{r.transaction_date}</TableCell>
                        <TableCell className="text-xs max-w-[400px] truncate" title={r.description}>{r.description}</TableCell>
                        <TableCell className={`text-right text-xs tabular-nums ${r.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>{r.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{r.running_balance?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{preview.ruleHits[i] ? <Badge variant="outline" className="text-xs">{t("finance:bankRec.autoSuggested")}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {t("finance:bankRec.willImport", { count: preview.rowSelection.filter(Boolean).length })}
                </div>
                <Button onClick={confirmImport} disabled={confirming || preview.rowSelection.filter(Boolean).length === 0}>
                  <CheckCircle2 className="size-4 mr-2" /> {t("finance:bankRec.confirmImport")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</div>
    </div>
  );
}

// =========================================================
// Operator Queue (depth pass): list + detail + candidates
// =========================================================
type DirFilter = "all" | "in" | "out";
type LinkFilter = "all" | "linked" | "unlinked";
type StatusFilter = "unclassified" | "classified" | "ignored" | "internal_transfer" | "all";

const fmtAmount = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: ccy, minimumFractionDigits: 2 }).format(n || 0);

function ReconciliationQueue({ accountId, classifications, isPt }: { accountId: string; classifications: Classification[]; isPt: boolean }) {
  const { t } = useTranslation(["finance", "common"]);
  const { user } = useAuth();

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unclassified");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Selection + action dialogs
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [classifyTx, setClassifyTx] = useState<BankTx | null>(null);
  const [matchDocTx, setMatchDocTx] = useState<BankTx | null>(null);
  const [createDocTx, setCreateDocTx] = useState<BankTx | null>(null);
  const [matchReimbTx, setMatchReimbTx] = useState<BankTx | null>(null);

  // Reset selection when account changes
  useEffect(() => { setSelectedId(null); }, [accountId]);

  const txQ = useQuery({
    queryKey: ["finance", "bank-tx", accountId, statusFilter],
    queryFn: async (): Promise<BankTx[]> => {
      let q = supabase
        .from("bank_transactions")
        .select("id, bank_account_id, transaction_date, value_date, description, amount, running_balance, currency, status, suggested_classification_id, ignored_reason")
        .eq("bank_account_id", accountId)
        .order("transaction_date", { ascending: false })
        .limit(1000);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankTx[];
    },
  });

  const txIds = useMemo(() => (txQ.data ?? []).map((x) => x.id), [txQ.data]);

  // Linked-payment map (per tx)
  const linksQ = useQuery({
    queryKey: ["finance", "bank-tx-links", accountId, txIds],
    enabled: txIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_document_payments")
        .select("bank_transaction_id, document_id, amount, financial_documents(document_number, direction, doc_type)")
        .in("bank_transaction_id", txIds);
      if (error) throw error;
      const map = new Map<string, { documentId: string; documentNumber: string | null; direction: string | null; docType: string | null; amount: number }>();
      (data ?? []).forEach((row: { bank_transaction_id: string | null; document_id: string; amount: number; financial_documents: { document_number: string | null; direction: string | null; doc_type: string | null } | { document_number: string | null; direction: string | null; doc_type: string | null }[] | null }) => {
        if (!row.bank_transaction_id) return;
        const fd = Array.isArray(row.financial_documents) ? row.financial_documents[0] : row.financial_documents;
        map.set(row.bank_transaction_id, {
          documentId: row.document_id,
          documentNumber: fd?.document_number ?? null,
          direction: fd?.direction ?? null,
          docType: fd?.doc_type ?? null,
          amount: Number(row.amount ?? 0),
        });
      });
      return map;
    },
  });

  const counts = useQuery({
    queryKey: ["finance", "bank-tx-counts", accountId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_transactions").select("status").eq("bank_account_id", accountId);
      if (error) throw error;
      const out: Record<string, number> = { unclassified: 0, classified: 0, ignored: 0, internal_transfer: 0, archived: 0 };
      (data ?? []).forEach((r) => { out[r.status] = (out[r.status] ?? 0) + 1; });
      return out;
    },
  });

  const classMap = useMemo(() => new Map(classifications.map((c) => [c.id, c])), [classifications]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const rows = txQ.data ?? [];
    const linksMap = linksQ.data;
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dirFilter === "in" && r.amount < 0) return false;
      if (dirFilter === "out" && r.amount >= 0) return false;
      if (dateFrom && r.transaction_date < dateFrom) return false;
      if (dateTo && r.transaction_date > dateTo) return false;
      const abs = Math.abs(Number(r.amount));
      if (min !== null && !Number.isNaN(min) && abs < min) return false;
      if (max !== null && !Number.isNaN(max) && abs > max) return false;
      if (needle && !r.description.toLowerCase().includes(needle)) return false;
      if (linkFilter !== "all" && linksMap) {
        const linked = linksMap.has(r.id);
        if (linkFilter === "linked" && !linked) return false;
        if (linkFilter === "unlinked" && linked) return false;
      }
      return true;
    });
  }, [txQ.data, linksQ.data, dirFilter, dateFrom, dateTo, minAmount, maxAmount, search, linkFilter]);

  // Auto-select first row when filters change
  useEffect(() => {
    if (filtered.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedTx = useMemo(() => filtered.find((r) => r.id === selectedId) ?? null, [filtered, selectedId]);

  async function quickMarkStatus(tx: BankTx, status: "ignored" | "internal_transfer") {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ status, classified_at: new Date().toISOString(), classified_by: user?.id ?? null })
      .eq("id", tx.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "ignored" ? t("finance:bankRec.markedIgnored") : t("finance:bankRec.markedTransfer"));
    txQ.refetch();
    counts.refetch();
  }

  const clearFilters = () => {
    setDirFilter("all"); setLinkFilter("all"); setSearch(""); setDateFrom(""); setDateTo(""); setMinAmount(""); setMaxAmount("");
  };

  const hasFilters = dirFilter !== "all" || linkFilter !== "all" || search || dateFrom || dateTo || minAmount || maxAmount;

  return (
    <div className="space-y-4">
      <InconsistencyWarningCard />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">{t("finance:bankRec.queueTitle")}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {(["unclassified", "classified", "ignored", "all"] as StatusFilter[]).map((s) => (
                  <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="h-7 text-xs">
                    {t(`finance:bankRec.status.${s}`)}
                    {s !== "all" && <span className="ml-1 opacity-60">({counts.data?.[s] ?? 0})</span>}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {/* Filter bar */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 pt-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input className="h-8 pl-7 text-xs" placeholder={t("finance:bankRec.operator.searchPlaceholder") as string} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Input type="date" className="h-8 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label={t("finance:bankRec.operator.dateFrom") as string} />
            <Input type="date" className="h-8 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label={t("finance:bankRec.operator.dateTo") as string} />
            <Select value={dirFilter} onValueChange={(v) => setDirFilter(v as DirFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance:bankRec.operator.direction.all")}</SelectItem>
                <SelectItem value="in">{t("finance:bankRec.operator.direction.in")}</SelectItem>
                <SelectItem value="out">{t("finance:bankRec.operator.direction.out")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as LinkFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance:bankRec.operator.linked.all")}</SelectItem>
                <SelectItem value="linked">{t("finance:bankRec.operator.linked.linked")}</SelectItem>
                <SelectItem value="unlinked">{t("finance:bankRec.operator.linked.unlinked")}</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-8 text-xs" type="number" step="0.01" placeholder={t("finance:bankRec.operator.minAmount") as string} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            <Input className="h-8 text-xs" type="number" step="0.01" placeholder={t("finance:bankRec.operator.maxAmount") as string} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            <div className="flex items-center justify-end gap-2 lg:col-span-3">
              <span className="text-[11px] text-muted-foreground">{t("finance:bankRec.operator.resultsCount", { count: filtered.length })}</span>
              {hasFilters && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFilters}>
                  <X className="size-3 mr-1" /> {t("finance:bankRec.operator.clearFilters")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {txQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("common:loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("finance:bankRec.noTransactions")}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: list */}
              <div className="lg:col-span-5 border rounded-md overflow-hidden bg-background">
                <div className="max-h-[640px] overflow-auto divide-y">
                  {filtered.map((tx) => {
                    const linked = linksQ.data?.get(tx.id) ?? null;
                    const sug = tx.suggested_classification_id ? classMap.get(tx.suggested_classification_id) : null;
                    const isSelected = tx.id === selectedId;
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => setSelectedId(tx.id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors ${isSelected ? "bg-muted/60 ring-1 ring-inset ring-primary/30" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {tx.amount < 0 ? <ArrowUpRight className="size-3 text-destructive" /> : <ArrowDownRight className="size-3 text-emerald-600" />}
                              <span>{tx.transaction_date}</span>
                              <StatusBadge status={tx.status} />
                              {linked && (
                                <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                                  <Link2 className="size-2.5" />{linked.documentNumber ?? "—"}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs mt-1 line-clamp-2" title={tx.description}>{tx.description}</div>
                            {sug && !linked && (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                {t("finance:bankRec.autoSuggested")}: {isPt ? sug.name_pt : sug.name_en}
                              </Badge>
                            )}
                          </div>
                          <div className={`text-xs tabular-nums font-medium shrink-0 ${tx.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {fmtAmount(Number(tx.amount), tx.currency)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: detail panel */}
              <div className="lg:col-span-7">
                {selectedTx ? (
                  <TxDetailPanel
                    tx={selectedTx}
                    classifications={classifications}
                    isPt={isPt}
                    linked={linksQ.data?.get(selectedTx.id) ?? null}
                    onClassify={() => setClassifyTx(selectedTx)}
                    onMatchDoc={() => setMatchDocTx(selectedTx)}
                    onCreateDoc={() => setCreateDocTx(selectedTx)}
                    onMatchReimb={() => setMatchReimbTx(selectedTx)}
                    onMarkIgnored={() => quickMarkStatus(selectedTx, "ignored")}
                    onMarkTransfer={() => quickMarkStatus(selectedTx, "internal_transfer")}
                  />
                ) : (
                  <div className="h-full border rounded-md flex items-center justify-center text-sm text-muted-foreground py-12">
                    {t("finance:bankRec.operator.selectTx")}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>

        {classifyTx && (
          <ClassifyDialog
            tx={classifyTx}
            classifications={classifications}
            isPt={isPt}
            linkedDocumentNumber={linksQ.data?.get(classifyTx.id)?.documentNumber ?? null}
            onClose={() => setClassifyTx(null)}
            onSaved={() => { setClassifyTx(null); txQ.refetch(); counts.refetch(); }}
          />
        )}
        {matchDocTx && (
          <MatchBankTxToDocDialog
            tx={{ id: matchDocTx.id, transaction_date: matchDocTx.transaction_date, description: matchDocTx.description, amount: Number(matchDocTx.amount) }}
            onClose={() => setMatchDocTx(null)}
            onMatched={() => { txQ.refetch(); }}
          />
        )}
        {createDocTx && (
          <CreateDocFromTxDialog
            tx={{ id: createDocTx.id, bank_account_id: createDocTx.bank_account_id, transaction_date: createDocTx.transaction_date, description: createDocTx.description, amount: Number(createDocTx.amount), currency: createDocTx.currency }}
            onClose={() => setCreateDocTx(null)}
            onCreated={() => { setCreateDocTx(null); txQ.refetch(); counts.refetch(); }}
          />
        )}
        {matchReimbTx && (
          <MatchBankTxToReimbursementDialog
            tx={{ id: matchReimbTx.id, transaction_date: matchReimbTx.transaction_date, description: matchReimbTx.description, amount: Number(matchReimbTx.amount) }}
            onClose={() => setMatchReimbTx(null)}
            onMatched={() => { setMatchReimbTx(null); txQ.refetch(); counts.refetch(); }}
          />
        )}
      </Card>
    </div>
  );
}

// =========================================================
// Detail panel for a selected bank transaction
// =========================================================
type LinkedInfo = { documentId: string; documentNumber: string | null; direction: string | null; docType: string | null; amount: number } | null;

function TxDetailPanel({
  tx, classifications, isPt, linked,
  onClassify, onMatchDoc, onCreateDoc, onMatchReimb, onMarkIgnored, onMarkTransfer,
}: {
  tx: BankTx;
  classifications: Classification[];
  isPt: boolean;
  linked: LinkedInfo;
  onClassify: () => void;
  onMatchDoc: () => void;
  onCreateDoc: () => void;
  onMatchReimb: () => void;
  onMarkIgnored: () => void;
  onMarkTransfer: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const isOutflow = tx.amount < 0;

  // Existing classification splits (if any)
  const splitsQ = useQuery({
    queryKey: ["finance", "bank-tx-splits", tx.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transaction_classifications")
        .select("id, amount, notes, classification_id, financial_classifications(code, name_pt, name_en)")
        .eq("bank_transaction_id", tx.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Candidate document matches (unlinked tx only)
  const candidatesQ = useQuery({
    queryKey: ["finance", "tx-candidates", tx.id, tx.amount, tx.transaction_date, !!linked],
    enabled: !linked,
    queryFn: async () => {
      const wantDir = isOutflow ? "received" : "issued";
      const target = Math.abs(Number(tx.amount));
      const tolerance = Math.max(0.5, target * 0.01);
      const lo = target - tolerance;
      const hi = target + tolerance;
      const refDate = new Date(tx.transaction_date);
      const from = new Date(refDate); from.setDate(from.getDate() - 30);
      const to = new Date(refDate); to.setDate(to.getDate() + 30);
      const { data, error } = await supabase
        .from("financial_documents")
        .select("id, document_number, doc_type, direction, status, issue_date, due_date, total_inc_vat, outstanding_amount, counterparty_name_snapshot")
        .eq("direction", wantDir)
        .gte("outstanding_amount", lo)
        .lte("outstanding_amount", hi)
        .gte("issue_date", from.toISOString().slice(0, 10))
        .lte("issue_date", to.toISOString().slice(0, 10))
        .in("status", ["issued", "partially_paid", "draft"])
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, counterpartyName: d.counterparty_name_snapshot ?? null }));
    },
  });

  return (
    <div className="border rounded-md bg-card">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2 flex-wrap">
              <StatusBadge status={tx.status} />
              <span>{tx.transaction_date}</span>
              {tx.value_date && tx.value_date !== tx.transaction_date && (
                <span className="text-[11px]">· {t("finance:bankRec.operator.valueDate")}: {tx.value_date}</span>
              )}
            </div>
            <div className="text-sm font-medium break-words">{tx.description}</div>
          </div>
          <div className={`text-lg tabular-nums font-semibold shrink-0 ${tx.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
            {fmtAmount(Number(tx.amount), tx.currency)}
          </div>
        </div>
      </div>

      {/* Linked badge / classification splits */}
      <div className="p-4 space-y-3 border-b">
        {linked ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex items-start gap-2">
            <Link2 className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-emerald-700 dark:text-emerald-400">
                {t("finance:bankRec.linkedTo", { ref: linked.documentNumber ?? "—" })}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {linked.direction === "issued" ? t("finance:bankRec.operator.linked.receipt") : t("finance:bankRec.operator.linked.payment")}
                {" · "}{fmtAmount(linked.amount)}
              </div>
            </div>
          </div>
        ) : null}

        {(splitsQ.data ?? []).length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("finance:bankRec.operator.classifications")}</div>
            <div className="space-y-1">
              {(splitsQ.data ?? []).map((s) => {
                const fc = Array.isArray(s.financial_classifications) ? s.financial_classifications[0] : s.financial_classifications;
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 bg-background">
                    <div className="min-w-0">
                      <div className="font-medium">{fc ? (isPt ? fc.name_pt : fc.name_en) : "—"}</div>
                      {s.notes && <div className="text-[11px] text-muted-foreground truncate">{s.notes}</div>}
                    </div>
                    <div className="tabular-nums">{fmtAmount(Number(s.amount), tx.currency)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Candidate suggestions (unlinked) */}
      {!linked && (
        <div className="p-4 space-y-2 border-b">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FileText className="size-3" /> {t("finance:bankRec.operator.candidatesTitle")}
          </div>
          {candidatesQ.isLoading ? (
            <div className="text-xs text-muted-foreground">{t("common:loading")}</div>
          ) : (candidatesQ.data ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">{t("finance:bankRec.operator.noCandidates")}</div>
          ) : (
            <div className="space-y-1">
              {(candidatesQ.data ?? []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={onMatchDoc}
                  className="w-full text-left flex items-center justify-between gap-3 text-xs border rounded px-2 py-1.5 bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.document_number ?? "—"} · {d.counterpartyName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{d.issue_date ?? "—"}{d.due_date ? ` → ${d.due_date}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular-nums font-medium">{fmtAmount(Number(d.outstanding_amount))}</div>
                    <div className="text-[10px] text-muted-foreground">{t("finance:bankRec.operator.candidateMatch")}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onMatchDoc}>
          {t(isOutflow ? "finance:bankRec.actions.matchOutgoing" : "finance:bankRec.actions.matchIncoming")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCreateDoc}>
          {t("finance:bankRec.actions.createDoc")}
        </Button>
        <Button size="sm" variant="outline" onClick={onClassify}>
          {tx.status === "unclassified" ? t("finance:bankRec.actions.classify") : t("common:edit")}
        </Button>
        {isOutflow && (
          <Button size="sm" variant="outline" onClick={onMatchReimb}>
            {t("finance:bankRec.actions.matchReimbursement")}
          </Button>
        )}
        <div className="flex-1" />
        {tx.status !== "internal_transfer" && (
          <Button size="sm" variant="ghost" onClick={onMarkTransfer}>
            {t("finance:bankRec.actions.transfer")}
          </Button>
        )}
        {tx.status !== "ignored" && (
          <Button size="sm" variant="ghost" onClick={onMarkIgnored}>
            {t("finance:bankRec.actions.ignore")}
          </Button>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Admin-only inconsistency warning card
// =========================================================
function InconsistencyWarningCard() {
  const { t } = useTranslation(["finance"]);
  const q = useQuery({
    queryKey: ["finance", "inconsistency-report", "warning"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("finance_inconsistency_report");
      if (error) throw error;
      const counts = (data as { counts?: Record<string, number> } | null)?.counts ?? {};
      const total =
        (counts.linked_payment_not_classified ?? 0) +
        (counts.classified_orphan ?? 0) +
        (counts.payment_missing_bank_tx ?? 0);
      return total;
    },
    staleTime: 60_000,
  });

  if (!q.data || q.data === 0) return null;

  return (
    <AdminOnly>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="size-4 text-amber-600 shrink-0" />
            <span className="font-medium">{t("finance:bankRec.operator.inconsistencyWarning", { count: q.data })}</span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/finance/admin/inconsistencies">{t("finance:bankRec.operator.openInconsistencies")}</Link>
          </Button>
        </CardContent>
      </Card>
    </AdminOnly>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const map: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    unclassified: { variant: "outline", label: t("finance:bankRec.status.unclassified") },
    classified: { variant: "default", label: t("finance:bankRec.status.classified") },
    ignored: { variant: "secondary", label: t("finance:bankRec.status.ignored") },
    internal_transfer: { variant: "secondary", label: t("finance:bankRec.status.internal_transfer") },
    archived: { variant: "secondary", label: t("finance:bankRec.status.archived") },
  };
  const m = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

// =========================================================
// Classify dialog (with split support)
// =========================================================
type SplitRow = {
  classification_id: string;
  amount: number;
  supplier_id: string | null;
  client_id: string | null;
  project_id: string | null;
  collaborator_id: string | null;
  reimbursable: boolean;
  notes: string;
};

function ClassifyDialog({ tx, classifications, isPt, linkedDocumentNumber, onClose, onSaved }: { tx: BankTx; classifications: Classification[]; isPt: boolean; linkedDocumentNumber: string | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(["finance", "common"]);
  const { user } = useAuth();
  const [splits, setSplits] = useState<SplitRow[]>([{ classification_id: tx.suggested_classification_id ?? "", amount: tx.amount, supplier_id: null, client_id: null, project_id: null, collaborator_id: null, reimbursable: false, notes: "" }]);
  const [saving, setSaving] = useState(false);
  // Direction-based hint: money out -> supplier expense; money in -> client income.
  // We only render the relevant counterparty picker per split row to reduce noise.
  const isOutflow = tx.amount < 0;
  // If a payment already links this tx to a document, gate manual classification
  // behind explicit confirmation so users don't double-account the same expense.
  const isLinkedToDoc = linkedDocumentNumber !== null;
  const [linkOverride, setLinkOverride] = useState(false);

  const suppliersQ = useQuery({ queryKey: ["fin-suppliers"], queryFn: async () => { const { data } = await supabase.from("companies").select("id, nome").eq("is_supplier", true).order("nome"); return ((data ?? []).map((r) => ({ id: r.id, name: r.nome }))) as Supplier[]; } });
  const clientsQ = useQuery({ queryKey: ["fin-clients"], queryFn: async () => { const { data } = await supabase.from("companies").select("id, nome").eq("is_client", true).order("nome"); return ((data ?? []).map((r) => ({ id: r.id, name: r.nome }))) as Client[]; } });
  const projectsQ = useQuery({ queryKey: ["pm-projects-pick"], queryFn: async () => { const { data } = await supabase.from("pm_projects").select("id, name").order("name"); return (data ?? []) as Project[]; } });
  const supplierClassQ = useSupplierDefaultClassifications();

  const total = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const balanced = Math.abs(total - tx.amount) < 0.01;

  function addSplit() {
    const used = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    setSplits([...splits, { classification_id: "", amount: Number((tx.amount - used).toFixed(2)), supplier_id: null, client_id: null, project_id: null, collaborator_id: null, reimbursable: false, notes: "" }]);
  }
  function removeSplit(i: number) { setSplits(splits.filter((_, idx) => idx !== i)); }
  function updateSplit(i: number, patch: Partial<SplitRow>) { setSplits(splits.map((s, idx) => idx === i ? { ...s, ...patch } : s)); }

  async function markIgnored() {
    const { error } = await supabase.from("bank_transactions").update({ status: "ignored", classified_at: new Date().toISOString(), classified_by: user?.id ?? null }).eq("id", tx.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("finance:bankRec.markedIgnored"));
    onSaved();
  }
  async function markInternalTransfer() {
    const { error } = await supabase.from("bank_transactions").update({ status: "internal_transfer", classified_at: new Date().toISOString(), classified_by: user?.id ?? null }).eq("id", tx.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("finance:bankRec.markedTransfer"));
    onSaved();
  }

  async function save() {
    if (!balanced) { toast.error(t("finance:bankRec.splitNotBalanced", { total: total.toFixed(2), expected: tx.amount.toFixed(2) })); return; }
    if (splits.some((s) => !s.classification_id)) { toast.error(t("finance:bankRec.classificationRequired")); return; }
    setSaving(true);
    try {
      // Replace existing classifications
      await supabase.from("bank_transaction_classifications").delete().eq("bank_transaction_id", tx.id);
      const inserts = splits.map((s) => ({
        bank_transaction_id: tx.id,
        classification_id: s.classification_id,
        amount: s.amount,
        supplier_id: s.supplier_id,
        client_id: s.client_id,
        project_id: s.project_id,
        collaborator_id: s.collaborator_id,
        reimbursable: s.reimbursable,
        notes: s.notes || null,
        created_by: user?.id ?? null,
      }));
      const { error: insErr } = await supabase.from("bank_transaction_classifications").insert(inserts);
      if (insErr) throw insErr;
      const { error: updErr } = await supabase.from("bank_transactions").update({ status: "classified", classified_at: new Date().toISOString(), classified_by: user?.id ?? null }).eq("id", tx.id);
      if (updErr) throw updErr;
      toast.success(t("finance:bankRec.classified"));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("finance:bankRec.classifyTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 bg-muted/30 text-sm">
            <div className="font-medium">{tx.description}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {tx.transaction_date} · <span className={`tabular-nums font-medium ${tx.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>{tx.amount.toFixed(2)} {tx.currency}</span>
            </div>
          </div>

          {isLinkedToDoc && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  {t("finance:bankRec.alreadyLinked.title", { ref: linkedDocumentNumber ?? "—" })}
                </div>
                <div className="text-muted-foreground">
                  {t("finance:bankRec.alreadyLinked.body")}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={linkOverride}
                    onChange={(e) => setLinkOverride(e.target.checked)}
                  />
                  {t("finance:bankRec.alreadyLinked.override")}
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("finance:bankRec.splits")}</Label>
            <Button size="sm" variant="outline" onClick={addSplit}><Plus className="size-3 mr-1" /> {t("finance:bankRec.addSplit")}</Button>
          </div>

          {splits.map((s, i) => {
            const cls = classifications.find((c) => c.id === s.classification_id);
            return (
              <div key={i} className="rounded-md border p-3 space-y-2 bg-card">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Label className="text-xs">{t("finance:bankRec.classification")}</Label>
                    <ClassificationPicker
                      value={s.classification_id || null}
                      onChange={(v) => {
                        const c = classifications.find((x) => x.id === v);
                        updateSplit(i, { classification_id: v ?? "", reimbursable: c?.reimbursable_default ?? s.reimbursable });
                      }}
                      options={classifications}
                      isPt={isPt}
                      placeholder={t("finance:bankRec.selectClassification")}
                      suggestedIds={s.supplier_id && supplierClassQ.data?.[s.supplier_id] ? [supplierClassQ.data[s.supplier_id]] : []}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">{t("finance:bankRec.col.amount")}</Label>
                    <Input type="number" step="0.01" value={s.amount} onChange={(e) => updateSplit(i, { amount: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-3 flex items-center gap-1">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={s.reimbursable} onChange={(e) => updateSplit(i, { reimbursable: e.target.checked })} /> {t("finance:bankRec.reimbursable")}</label>
                    {splits.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeSplit(i)}><Trash2 className="size-3" /></Button>}
                  </div>
                </div>
                {cls && (
                  <div className="grid grid-cols-12 gap-2">
                    {isOutflow ? (
                      <div className="col-span-4">
                        <Label className="text-xs">{t("finance:bankRec.supplier")}{cls.supplier_required ? " *" : ""}</Label>
                        <CounterpartySelect
                          kind="supplier"
                          value={s.supplier_id}
                          options={(suppliersQ.data ?? []).map((sp) => ({ id: sp.id, name: sp.name }))}
                          onChange={(newSupplierId) => {
                            const suggestion = newSupplierId ? supplierClassQ.data?.[newSupplierId] : null;
                            const patch: Partial<SplitRow> = { supplier_id: newSupplierId, client_id: null };
                            if (suggestion && !s.classification_id) {
                              patch.classification_id = suggestion;
                              const sc = classifications.find((x) => x.id === suggestion);
                              if (sc) patch.reimbursable = sc.reimbursable_default;
                            }
                            updateSplit(i, patch);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="col-span-4">
                        <Label className="text-xs">{t("finance:bankRec.client")}</Label>
                        <CounterpartySelect
                          kind="client"
                          value={s.client_id}
                          options={(clientsQ.data ?? []).map((cl) => ({ id: cl.id, name: cl.name }))}
                          onChange={(v) => updateSplit(i, { client_id: v, supplier_id: null })}
                        />
                      </div>
                    )}
                    {cls.project_link_allowed && (
                      <div className="col-span-4">
                        <Label className="text-xs">{t("finance:bankRec.project")}</Label>
                        <Select value={s.project_id ?? "__none"} onValueChange={(v) => updateSplit(i, { project_id: v === "__none" ? null : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-[260px]">
                            <SelectItem value="__none">—</SelectItem>
                            {(projectsQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <Textarea placeholder={t("finance:bankRec.notesPlaceholder")} value={s.notes} onChange={(e) => updateSplit(i, { notes: e.target.value })} rows={1} className="text-xs" />
              </div>
            );
          })}

          <div className="flex items-center justify-between text-xs">
            <span className={balanced ? "text-emerald-600" : "text-destructive"}>
              {t("finance:bankRec.splitTotal", { total: total.toFixed(2), expected: tx.amount.toFixed(2) })}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={markIgnored}>{t("finance:bankRec.markIgnored")}</Button>
          <Button variant="ghost" size="sm" onClick={markInternalTransfer}>{t("finance:bankRec.markTransfer")}</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>{t("common:cancel")}</Button>
          <Button onClick={save} disabled={saving || !balanced || (isLinkedToDoc && !linkOverride)}>{t("common:save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================
// Counterparty select with inline create
// =========================================================
function CounterpartySelect({
  kind,
  value,
  options,
  onChange,
}: {
  kind: "supplier" | "client";
  value: string | null;
  options: { id: string; name: string }[];
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation(["finance"]);
  const [createOpen, setCreateOpen] = useState(false);
  const NEW = "__new";
  const NONE = "__none";
  return (
    <>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => {
          if (v === NEW) {
            setCreateOpen(true);
            return;
          }
          onChange(v === NONE ? null : v);
        }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-[260px]">
          <SelectItem value={NONE}>—</SelectItem>
          <SelectItem value={NEW} className="text-primary font-medium">
            + {kind === "supplier" ? t("finance:inlineCounterparty.newSupplier") : t("finance:inlineCounterparty.newClient")}
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {createOpen && (
        <InlineCounterpartyDialog
          kind={kind}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(row) => onChange(row.id)}
        />
      )}
    </>
  );
}
