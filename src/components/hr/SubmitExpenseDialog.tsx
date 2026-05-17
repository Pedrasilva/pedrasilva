import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Camera, Sparkles, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  type BenefitCategory,
  type BenefitCategoryRow,
} from "@/lib/benefits";
import { fmtEUR } from "@/lib/salary";
import { extractBenefitReceipt } from "@/lib/hr/benefit-ocr.functions";
import { getOwnCompanyNif } from "@/lib/finance/own-company.functions";
import { findCompanyByNif } from "@/lib/finance/supplier-matching";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type PaymentSourceType = "personal" | "company_card" | "company_account" | "cash" | "unknown";

type OcrState = {
  extractionId: string | null;
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  filled: Set<string>;
  lowConfidence: Set<string>;
  vatMismatch: boolean;
  nifInvalid: boolean;
  failed: boolean;
  isOwnCompanyNif: boolean;
};

const newOcr = (): OcrState => ({
  extractionId: null,
  matchedCompanyId: null,
  matchedCompanyName: null,
  filled: new Set(),
  lowConfidence: new Set(),
  vatMismatch: false,
  nifInvalid: false,
  failed: false,
  isOwnCompanyNif: false,
});

const LOW_CONF = 0.6;

function OcrBadge({ t }: { t: (k: string) => string }) {
  return (
    <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
      <Sparkles className="h-2.5 w-2.5" />
      {t("hr:beneficios.submit.ocr.fieldBadge")}
    </Badge>
  );
}

function FieldHint({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[11px]",
        tone === "warn" ? "text-amber-600" : "text-muted-foreground",
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {children}
    </div>
  );
}

export function SubmitExpenseDialog({
  collaboratorId,
  anoFiscal,
  balance,
  categories,
  onCreated,
}: {
  collaboratorId: string;
  anoFiscal: number;
  balance: Record<BenefitCategory, { disponivel: number }>;
  categories: BenefitCategoryRow[];
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const isEn = i18n.language?.startsWith("en");
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [ownNifLoaded, setOwnNifLoaded] = useState(false);

  const [form, setForm] = useState({
    categoryId: "",
    descricao: "",
    valor: "",
    data_despesa: new Date().toISOString().slice(0, 10),
    notas_colaborador: "",
    supplier_name: "",
    supplier_nif: "",
    document_number: "",
    amount_ex_vat: "",
    vat_amount: "",
    vat_rate: "",
    payment_source_type: "personal" as PaymentSourceType,
    payment_source_label: "",
    payment_account_id: "" as string,
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ocr, setOcr] = useState<OcrState>(newOcr());
  const [accounts, setAccounts] = useState<{ id: string; account_name: string; bank_name: string | null }[]>([]);
  const [ownCompanyNif, setOwnCompanyNif] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const extractFn = useServerFn(extractBenefitReceipt);
  const getOwnNif = useServerFn(getOwnCompanyNif);

  // Load bank accounts lazily (best-effort; RLS may hide)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name")
        .eq("is_active", true)
        .order("account_name");
      if (!cancelled) setAccounts((data ?? []) as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch own-company (buyer) NIF once when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getOwnNif();
        if (!cancelled) setOwnCompanyNif(res?.nif ?? null);
      } catch {
        if (!cancelled) setOwnCompanyNif(null);
      } finally {
        if (!cancelled) setOwnNifLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, getOwnNif]);

  // Re-run supplier matching whenever the user edits the NIF manually.
  // Debounced; canonical lookup against companies.nif (Finance shared).
  useEffect(() => {
    const raw = form.supplier_nif;
    const norm = normalizePortugueseNif(raw);
    if (!norm || !isValidPortugueseNif(norm)) {
      setOcr((o) => ({
        ...o,
        matchedCompanyId: null,
        matchedCompanyName: null,
        isOwnCompanyNif: false,
      }));
      return;
    }
    if (ownCompanyNif && norm === ownCompanyNif) {
      setOcr((o) => ({
        ...o,
        matchedCompanyId: null,
        matchedCompanyName: null,
        isOwnCompanyNif: true,
      }));
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const match = await findCompanyByNif(norm);
        if (cancelled) return;
        setOcr((o) => ({
          ...o,
          matchedCompanyId: match?.id ?? null,
          matchedCompanyName: match?.nome ?? null,
          isOwnCompanyNif: false,
        }));
      } catch { /* best-effort */ }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [form.supplier_nif, ownCompanyNif]);

  const reset = () => {
    setForm({
      categoryId: "",
      descricao: "",
      valor: "",
      data_despesa: new Date().toISOString().slice(0, 10),
      notas_colaborador: "",
      supplier_name: "",
      supplier_nif: "",
      document_number: "",
      amount_ex_vat: "",
      vat_amount: "",
      vat_rate: "",
      payment_source_type: "personal",
      payment_source_label: "",
      payment_account_id: "",
    });
    setFile(null);
    setUploadedPath(null);
    setOcr(newOcr());
    setAnalyzing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Best-effort cleanup of orphaned upload when user closes without submitting
  async function cleanupOrphaned() {
    if (uploadedPath) {
      await supabase.storage.from("benefit-receipts").remove([uploadedPath]).catch(() => {});
    }
  }

  function setFormPatch(patch: Partial<typeof form>, fieldsFilled: string[] = []) {
    setForm((f) => ({ ...f, ...patch }));
    if (fieldsFilled.length) {
      setOcr((o) => {
        const next = new Set(o.filled);
        fieldsFilled.forEach((k) => next.add(k));
        return { ...o, filled: next };
      });
    }
  }

  async function onFileSelected(f: File | null) {
    setFile(f);
    setOcr(newOcr());
    setUploadedPath(null);
    if (!f) return;

    setAnalyzing(true);
    try {
      // Upload immediately (one path per attempt; we cleanup on dialog close)
      const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${collaboratorId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("benefit-receipts")
        .upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) throw upErr;
      setUploadedPath(path);

      // Call OCR
      const result = await extractFn({ data: { storagePath: path } });
      if (!result.ok || !result.extracted) {
        setOcr((o) => ({ ...o, failed: true, extractionId: result.extraction_id || null }));
        toast.warning(t("hr:beneficios.submit.ocr.failed"));
        return;
      }

      const ex = result.extracted;
      const conf = result.confidence ?? ({} as Record<string, number>);
      const filled: string[] = [];
      const low = new Set<string>();
      const patch: Partial<typeof form> = {};

      if (ex.supplier_name && !form.supplier_name) {
        patch.supplier_name = ex.supplier_name;
        filled.push("supplier_name");
        if ((conf.supplier_name ?? 0) < LOW_CONF) low.add("supplier_name");
      }
      if (ex.supplier_nif) {
        const norm = normalizePortugueseNif(ex.supplier_nif) ?? "";
        if (norm && !form.supplier_nif) {
          patch.supplier_nif = norm;
          filled.push("supplier_nif");
          if ((conf.supplier_nif ?? 0) < LOW_CONF) low.add("supplier_nif");
        }
      }
      if (ex.document_number && !form.document_number) {
        patch.document_number = ex.document_number;
        filled.push("document_number");
        if ((conf.document_number ?? 0) < LOW_CONF) low.add("document_number");
      }
      if (ex.issue_date && !form.data_despesa) {
        patch.data_despesa = ex.issue_date;
        filled.push("data_despesa");
      }
      if (ex.issue_date) {
        // Always offer the OCR date if user hasn't typed (keep default if today)
        const todayIso = new Date().toISOString().slice(0, 10);
        if (form.data_despesa === todayIso) {
          patch.data_despesa = ex.issue_date;
          filled.push("data_despesa");
          if ((conf.issue_date ?? 0) < LOW_CONF) low.add("data_despesa");
        }
      }
      if (ex.total_amount != null && !form.valor) {
        patch.valor = String(ex.total_amount);
        filled.push("valor");
        if ((conf.total_amount ?? 0) < LOW_CONF) low.add("valor");
      }
      if (ex.amount_ex_vat != null && !form.amount_ex_vat) {
        patch.amount_ex_vat = String(ex.amount_ex_vat);
        filled.push("amount_ex_vat");
      }
      if (ex.vat_amount != null && !form.vat_amount) {
        patch.vat_amount = String(ex.vat_amount);
        filled.push("vat_amount");
        if ((conf.vat_amount ?? 0) < LOW_CONF) low.add("vat_amount");
      }
      if (ex.vat_rate != null && !form.vat_rate) {
        patch.vat_rate = String(ex.vat_rate);
        filled.push("vat_rate");
      }
      if (!form.descricao) {
        const desc = [ex.supplier_name, ex.document_number].filter(Boolean).join(" · ");
        if (desc) {
          patch.descricao = desc;
          filled.push("descricao");
        }
      }

      // Payment source hints
      const pm = (ex.payment_method ?? "").toLowerCase();
      const last4 = ex.card_last4 ?? "";
      let suggestedSrc: PaymentSourceType | null = null;
      if (pm === "cash" || pm === "dinheiro") suggestedSrc = "cash";
      else if (pm === "card" || pm === "mbway" || pm === "multibanco" || last4) suggestedSrc = "personal";
      else if (pm === "transfer") suggestedSrc = "personal";
      if (suggestedSrc) {
        patch.payment_source_type = suggestedSrc;
        filled.push("payment_source_type");
      }
      const labelBits = [pm && pm[0].toUpperCase() + pm.slice(1), last4 && `•••• ${last4}`, ex.payment_account_hint]
        .filter(Boolean)
        .join(" · ");
      if (labelBits && !form.payment_source_label) {
        patch.payment_source_label = labelBits;
        filled.push("payment_source_label");
      }

      // Vat mismatch flag
      const total = ex.total_amount;
      const v = ex.vat_amount;
      const x = ex.amount_ex_vat;
      const vatMismatch =
        total != null && v != null && x != null && Math.abs(x + v - total) > 0.02;

      // NIF invalid flag
      const nifValid =
        !!patch.supplier_nif && isValidPortugueseNif(String(patch.supplier_nif));
      const nifInvalid = !!patch.supplier_nif && !nifValid;

      // Company match lookup name
      let matchedName: string | null = null;
      if (result.matched_company_id) {
        const { data: comp } = await supabase
          .from("companies")
          .select("nome")
          .eq("id", result.matched_company_id)
          .maybeSingle();
        matchedName = (comp as { nome?: string } | null)?.nome ?? null;
      }

      setFormPatch(patch, filled);
      setOcr({
        extractionId: result.extraction_id,
        matchedCompanyId: result.matched_company_id ?? null,
        matchedCompanyName: matchedName,
        filled: new Set(filled),
        lowConfidence: low,
        vatMismatch,
        nifInvalid,
        failed: false,
        isOwnCompanyNif: Boolean(result.supplier_is_own_company),
      });
      toast.success(t("hr:beneficios.submit.ocr.prefilled"));
    } catch (e) {
      console.error("OCR/upload error", e);
      toast.warning(t("hr:beneficios.submit.ocr.failed"));
      setOcr((o) => ({ ...o, failed: true }));
    } finally {
      setAnalyzing(false);
    }
  }

  const valorNum = Number(form.valor.replace(",", ".")) || 0;
  const selectedCategory = categories.find((c) => c.id === form.categoryId) ?? null;
  const legacyForSelected: BenefitCategory | null = selectedCategory?.legacy_enum ?? null;
  const restante = legacyForSelected ? balance[legacyForSelected].disponivel : null;
  const excede = restante != null && valorNum > restante;

  const supplierNifNormalized = normalizePortugueseNif(form.supplier_nif);
  const supplierNifValid = supplierNifNormalized
    ? isValidPortugueseNif(supplierNifNormalized)
    : true;

  async function submit() {
    if (!selectedCategory) return toast.error(t("hr:beneficios.toasts.errors.categoryRequired"));
    if (!form.descricao.trim()) return toast.error(t("hr:beneficios.toasts.errors.descriptionRequired"));
    if (valorNum <= 0) return toast.error(t("hr:beneficios.toasts.errors.invalidAmount"));
    if (!uploadedPath) return toast.error(t("hr:beneficios.toasts.errors.receiptRequired"));

    setSubmitting(true);
    try {
      const legacy: BenefitCategory = selectedCategory.legacy_enum ?? "outros";
      const num = (v: string) => {
        if (!v) return null;
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };

      const payload = {
        collaborator_id: collaboratorId,
        ano_fiscal: anoFiscal,
        categoria: legacy,
        category_id: selectedCategory.id,
        descricao: form.descricao.trim(),
        valor: valorNum,
        data_despesa: form.data_despesa,
        notas_colaborador: form.notas_colaborador.trim() || null,
        foto_path: uploadedPath,
        // OCR / supplier
        supplier_company_id: ocr.matchedCompanyId,
        supplier_nif: supplierNifNormalized,
        supplier_name_snapshot: form.supplier_name.trim() || null,
        document_number: form.document_number.trim() || null,
        vat_amount: num(form.vat_amount),
        vat_rate: num(form.vat_rate),
        amount_ex_vat: num(form.amount_ex_vat),
        ocr_extraction_id: ocr.extractionId,
        // Payment source
        payment_source_type: form.payment_source_type,
        payment_source_label: form.payment_source_label.trim() || null,
        payment_account_id: form.payment_account_id || null,
      };

      const { data: inserted, error } = await sb
        .from("benefit_expenses")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      // Best-effort: link OCR row back to created expense
      if (ocr.extractionId && inserted?.id) {
        await sb
          .from("benefit_expense_ocr_extractions")
          .update({ expense_id: inserted.id })
          .eq("id", ocr.extractionId)
          .then(() => undefined, () => undefined);
      }

      toast.success(t("hr:beneficios.toasts.submitted"));
      setUploadedPath(null); // prevent cleanup
      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hr:beneficios.toasts.errors.submit"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          cleanupOrphaned();
          reset();
        }
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t("hr:beneficios.submit.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("hr:beneficios.submit.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("hr:beneficios.submit.dialogDescription")}</DialogDescription>
        </DialogHeader>


        {isAdmin && ownNifLoaded && !ownCompanyNif && (
          <div className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div>{t("hr:beneficios.submit.ocr.ownNifMissing")}</div>
              <Link
                to="/admin/company-settings"
                className="underline underline-offset-2 font-medium"
              >
                {t("hr:beneficios.submit.ocr.ownNifMissingCta")}
              </Link>
            </div>
          </div>
        )}

        {/* Receipt first — drives OCR */}
        <div className="space-y-1.5">
          <Label>{t("hr:beneficios.submit.receipt")} *</Label>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            disabled={analyzing}
          />
          {file && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Camera className="h-3 w-3" /> {file.name}
              {analyzing && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("hr:beneficios.submit.ocr.analyzing")}
                </span>
              )}
              {!analyzing && ocr.extractionId && !ocr.failed && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("hr:beneficios.submit.ocr.prefilled")}
                </span>
              )}
            </div>
          )}
          {ocr.failed && <FieldHint>{t("hr:beneficios.submit.ocr.failed")}</FieldHint>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>{t("hr:beneficios.submit.category")} *</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            >
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={t("hr:beneficios.submit.categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => {
                  const av = c.legacy_enum ? balance[c.legacy_enum].disponivel : null;
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {isEn ? c.label_en : c.label_pt}
                      {av != null
                        ? ` — ${t("hr:beneficios.submit.categoryAvailable", { value: fmtEUR(av) })}`
                        : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label className="flex items-center gap-2">
              {t("hr:beneficios.submit.description")} *
              {ocr.filled.has("descricao") && <OcrBadge t={t} />}
            </Label>
            <Input
              className="input-yellow"
              placeholder={t("hr:beneficios.submit.descriptionPlaceholder")}
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              {t("hr:beneficios.submit.amount")} *
              {ocr.filled.has("valor") && <OcrBadge t={t} />}
            </Label>
            <Input
              className="input-yellow"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
            {restante != null && (
              <div
                className={cn(
                  "text-[11px]",
                  excede ? "text-rose-600" : "text-muted-foreground",
                )}
              >
                {excede
                  ? t("hr:beneficios.submit.exceeds", { value: fmtEUR(restante) })
                  : t("hr:beneficios.submit.available", { value: fmtEUR(restante) })}
              </div>
            )}
            {ocr.lowConfidence.has("valor") && (
              <FieldHint>{t("hr:beneficios.submit.ocr.lowConfidence")}</FieldHint>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              {t("hr:beneficios.submit.date")} *
              {ocr.filled.has("data_despesa") && <OcrBadge t={t} />}
            </Label>
            <Input
              type="date"
              className="input-yellow"
              value={form.data_despesa}
              onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))}
            />
            {ocr.lowConfidence.has("data_despesa") && (
              <FieldHint>{t("hr:beneficios.submit.ocr.lowConfidence")}</FieldHint>
            )}
          </div>
        </div>

        {/* Supplier */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t("hr:beneficios.submit.supplier.section")}
            </div>
            {ocr.isOwnCompanyNif && (
              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {t("hr:beneficios.submit.supplier.ownCompanyNif")}
              </Badge>
            )}
            {!ocr.isOwnCompanyNif && ocr.matchedCompanyId && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {t("hr:beneficios.submit.supplier.recognized")}
                {ocr.matchedCompanyName ? `: ${ocr.matchedCompanyName}` : ""}
              </Badge>
            )}
            {!ocr.isOwnCompanyNif && !ocr.matchedCompanyId && supplierNifNormalized && supplierNifValid && (
              <Badge variant="outline">{t("hr:beneficios.submit.supplier.newSupplier")}</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.supplier.name")}
                {ocr.filled.has("supplier_name") && <OcrBadge t={t} />}
              </Label>
              <Input
                placeholder={t("hr:beneficios.submit.supplier.namePlaceholder")}
                value={form.supplier_name}
                onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.supplier.nif")}
                {ocr.filled.has("supplier_nif") && <OcrBadge t={t} />}
              </Label>
              <Input
                placeholder={t("hr:beneficios.submit.supplier.nifPlaceholder")}
                value={form.supplier_nif}
                onChange={(e) => setForm((f) => ({ ...f, supplier_nif: e.target.value }))}
              />
              {(ocr.nifInvalid || (form.supplier_nif && !supplierNifValid)) && (
                <FieldHint>{t("hr:beneficios.submit.ocr.nifInvalid")}</FieldHint>
              )}
              {ocr.isOwnCompanyNif && (
                <FieldHint>{t("hr:beneficios.submit.ocr.ownCompanyNifHint")}</FieldHint>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.supplier.documentNumber")}
                {ocr.filled.has("document_number") && <OcrBadge t={t} />}
              </Label>
              <Input
                placeholder={t("hr:beneficios.submit.supplier.documentNumberPlaceholder")}
                value={form.document_number}
                onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* VAT */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {t("hr:beneficios.submit.vat.section")}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.vat.amountExVat")}
                {ocr.filled.has("amount_ex_vat") && <OcrBadge t={t} />}
              </Label>
              <Input
                inputMode="decimal"
                value={form.amount_ex_vat}
                onChange={(e) => setForm((f) => ({ ...f, amount_ex_vat: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.vat.vatAmount")}
                {ocr.filled.has("vat_amount") && <OcrBadge t={t} />}
              </Label>
              <Input
                inputMode="decimal"
                value={form.vat_amount}
                onChange={(e) => setForm((f) => ({ ...f, vat_amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.vat.vatRate")}
                {ocr.filled.has("vat_rate") && <OcrBadge t={t} />}
              </Label>
              <Input
                inputMode="decimal"
                value={form.vat_rate}
                onChange={(e) => setForm((f) => ({ ...f, vat_rate: e.target.value }))}
              />
            </div>
          </div>
          {ocr.vatMismatch && (
            <FieldHint>{t("hr:beneficios.submit.ocr.vatMismatch")}</FieldHint>
          )}
        </div>

        {/* Payment source */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {t("hr:beneficios.submit.payment.section")}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.payment.type")}
                {ocr.filled.has("payment_source_type") && <OcrBadge t={t} />}
              </Label>
              <Select
                value={form.payment_source_type}
                onValueChange={(v) => setForm((f) => ({ ...f, payment_source_type: v as PaymentSourceType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["personal", "company_card", "company_account", "cash", "unknown"] as PaymentSourceType[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`hr:beneficios.submit.payment.types.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {t("hr:beneficios.submit.payment.label")}
                {ocr.filled.has("payment_source_label") && <OcrBadge t={t} />}
              </Label>
              <Input
                placeholder={t("hr:beneficios.submit.payment.labelPlaceholder")}
                value={form.payment_source_label}
                onChange={(e) => setForm((f) => ({ ...f, payment_source_label: e.target.value }))}
              />
            </div>
            {(form.payment_source_type === "company_card" ||
              form.payment_source_type === "company_account") &&
              accounts.length > 0 && (
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>{t("hr:beneficios.submit.payment.account")}</Label>
                  <Select
                    value={form.payment_account_id || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, payment_account_id: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("hr:beneficios.submit.payment.accountPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {t("hr:beneficios.submit.payment.noAccount")}
                      </SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_name}
                          {a.bank_name ? ` — ${a.bank_name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("hr:beneficios.submit.notes")}</Label>
          <Textarea
            rows={2}
            value={form.notas_colaborador}
            onChange={(e) => setForm((f) => ({ ...f, notas_colaborador: e.target.value }))}
          />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              cleanupOrphaned();
              setOpen(false);
            }}
          >
            {t("hr:beneficios.submit.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting || analyzing}>
            {submitting ? t("hr:beneficios.submit.submitting") : t("hr:beneficios.submit.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
