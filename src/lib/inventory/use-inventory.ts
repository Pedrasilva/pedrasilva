/**
 * Inventory data layer.
 *
 * Reads/writes only the `inventory_*` tables. Finance rows are read for
 * reference (supplier invoice + invoice lines) and never mutated here, apart
 * from the single `financial_documents.inventory_status` workflow marker.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AssetStatus,
  CustodyMode,
  InventoryAsset,
  InventoryAssetEvent,
  InventoryAssignment,
  InventoryCategory,
  InventoryKit,
  InventoryWorkflowStatus,
  LineProcessing,
  TrackingLevel,
} from "./types";

const KEY = ["inventory"] as const;

/* ───────────────────────────── categories ───────────────────────────── */

export function useInventoryCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: async (): Promise<InventoryCategory[]> => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as InventoryCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useInventoryKits() {
  return useQuery({
    queryKey: [...KEY, "kits"],
    queryFn: async (): Promise<InventoryKit[]> => {
      const { data, error } = await supabase
        .from("inventory_kits")
        .select("id, name, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as InventoryKit[];
    },
  });
}

/* ─────────────────────────────── assets ─────────────────────────────── */

export function useInventoryAssets() {
  return useQuery({
    queryKey: [...KEY, "assets"],
    queryFn: async (): Promise<InventoryAsset[]> => {
      const { data, error } = await supabase
        .from("inventory_assets")
        .select("*")
        .order("asset_code");
      if (error) throw error;
      return (data ?? []) as unknown as InventoryAsset[];
    },
  });
}

export function useInventoryAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "asset", assetId],
    enabled: !!assetId,
    queryFn: async (): Promise<InventoryAsset | null> => {
      const { data, error } = await supabase
        .from("inventory_assets")
        .select("*")
        .eq("id", assetId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as InventoryAsset) ?? null;
    },
  });
}

export function useAssetAssignments(assetId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "assignments", assetId],
    enabled: !!assetId,
    queryFn: async (): Promise<InventoryAssignment[]> => {
      const { data, error } = await supabase
        .from("inventory_assignments")
        .select("*")
        .eq("asset_id", assetId!)
        .order("assigned_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InventoryAssignment[];
    },
  });
}

export function useOpenAssignments() {
  return useQuery({
    queryKey: [...KEY, "assignments", "open"],
    queryFn: async (): Promise<InventoryAssignment[]> => {
      const { data, error } = await supabase
        .from("inventory_assignments")
        .select("*")
        .is("returned_on", null);
      if (error) throw error;
      return (data ?? []) as InventoryAssignment[];
    },
  });
}

export function useAssetEvents(assetId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "events", assetId],
    enabled: !!assetId,
    queryFn: async (): Promise<InventoryAssetEvent[]> => {
      const { data, error } = await supabase
        .from("inventory_asset_events")
        .select("*")
        .eq("asset_id", assetId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InventoryAssetEvent[];
    },
  });
}

/* ────────────────────────────── mutations ───────────────────────────── */

export type NewAssetInput = {
  name: string;
  categoryCode: string;
  category_id: string;
  tracking_level: TrackingLevel;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  description?: string | null;
  status?: AssetStatus;
  custody_mode?: CustodyMode;
  assigned_collaborator_id?: string | null;
  location?: string | null;
  department?: string | null;
  supplier_company_id?: string | null;
  purchase_date?: string | null;
  purchase_price_ex_vat?: number | null;
  vat_amount?: number | null;
  purchase_price_inc_vat?: number | null;
  invoice_number_snapshot?: string | null;
  source_document_id?: string | null;
  source_document_line_id?: string | null;
  source_unit_index?: number | null;
  warranty_expiry?: string | null;
  depreciation_years: number;
  replacement_years: number;
  insurance_value?: number | null;
  include_in_insurance_register?: boolean;
  kit_id?: string | null;
  notes?: string | null;
};

/** Allocate a permanent asset code for a category (race-safe, may skip numbers). */
export async function allocateAssetCode(categoryCode: string): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_inventory_code", {
    _category_code: categoryCode,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function createAsset(input: NewAssetInput): Promise<InventoryAsset> {
  const { categoryCode, ...rest } = input;
  const asset_code = await allocateAssetCode(categoryCode);
  const { data, error } = await supabase
    .from("inventory_assets")
    .insert({ ...rest, asset_code } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as InventoryAsset;
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAsset,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<InventoryAsset> }) => {
      const { asset_code: _ignored, ...safe } = patch;
      const { error } = await supabase.from("inventory_assets").update(safe as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Assign / reassign custody. The database trigger closes any open assignment,
 * writes the history event and syncs the asset's current custody fields, so
 * assignment history and asset state can never drift apart.
 */
export function useAssignAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      asset_id: string;
      custody_mode: CustodyMode;
      collaborator_id?: string | null;
      location?: string | null;
      department?: string | null;
      assigned_on?: string;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("inventory_assignments").insert({
        asset_id: input.asset_id,
        custody_mode: input.custody_mode,
        collaborator_id: input.collaborator_id ?? null,
        location: input.location ?? null,
        department: input.department ?? null,
        assigned_on: input.assigned_on ?? new Date().toISOString().slice(0, 10),
        notes: input.notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReturnAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, returnedOn }: { assignmentId: string; returnedOn?: string }) => {
      const { error } = await supabase
        .from("inventory_assignments")
        .update({ returned_on: returnedOn ?? new Date().toISOString().slice(0, 10) } as never)
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* ───────────────────── finance → inventory workflow ─────────────────── */

export type InvoiceLine = {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price_ex_vat: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  amount_ex_vat: number | null;
  sort_order: number | null;
};

export type InvoiceForInventory = {
  id: string;
  document_number: string | null;
  issue_date: string | null;
  counterparty_supplier_id: string | null;
  counterparty_name_snapshot: string | null;
  inventory_status: InventoryWorkflowStatus | null;
  lines: InvoiceLine[];
  processing: Record<string, LineProcessing>;
  /** Lines the reviewer explicitly decided NOT to inventory. */
  skipped: Record<string, boolean>;
};

/** Invoice + its lines + per-line processed counts derived from real assets. */
export function useInvoiceForInventory(documentId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "invoice", documentId],
    enabled: !!documentId,
    queryFn: async (): Promise<InvoiceForInventory | null> => {
      const { data: doc, error: docErr } = await supabase
        .from("financial_documents")
        .select(
          "id, document_number, issue_date, counterparty_supplier_id, counterparty_name_snapshot, inventory_status",
        )
        .eq("id", documentId!)
        .maybeSingle();
      if (docErr) throw docErr;
      if (!doc) return null;

      const { data: lines, error: lineErr } = await supabase
        .from("financial_document_lines")
        .select(
          "id, description, quantity, unit_price_ex_vat, vat_rate, vat_amount, amount_ex_vat, sort_order",
        )
        .eq("document_id", documentId!)
        .order("sort_order");
      if (lineErr) throw lineErr;

      const { data: proc, error: procErr } = await supabase
        .from("inventory_line_processing")
        .select("*")
        .eq("document_id", documentId!);
      if (procErr) throw procErr;

      const processing: Record<string, LineProcessing> = {};
      for (const p of (proc ?? []) as unknown as LineProcessing[]) processing[p.line_id] = p;

      return {
        ...(doc as unknown as Omit<InvoiceForInventory, "lines" | "processing">),
        lines: (lines ?? []) as InvoiceLine[],
        processing,
      };
    },
  });
}

/** Invoices flagged for inventory that are not fully processed yet. */
export function usePendingInventoryInvoices() {
  return useQuery({
    queryKey: [...KEY, "pending-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_documents")
        .select(
          "id, document_number, issue_date, counterparty_name_snapshot, inventory_status, total_inc_vat",
        )
        .in("inventory_status", ["pending", "partially_processed"])
        .order("issue_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkInvoiceForInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      documentId,
      status,
    }: {
      documentId: string;
      status: InventoryWorkflowStatus | null;
    }) => {
      const { error } = await supabase
        .from("financial_documents")
        .update({ inventory_status: status } as never)
        .eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Create assets from reviewed invoice lines.
 *
 * Duplicate protection is enforced by the database: every asset carries
 * (source_document_line_id, source_unit_index) under a unique index, so the
 * same unit of the same line can never produce two assets — even if two users
 * confirm the same review screen at once.
 */
export type LineAssetPlan = {
  line: InvoiceLine;
  count: number;
  startIndex: number;
  name: string;
  categoryId: string;
  categoryCode: string;
  trackingLevel: TrackingLevel;
  depreciationYears: number;
  replacementYears: number;
  brand?: string | null;
};

export function useCreateAssetsFromInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoice,
      plans,
    }: {
      invoice: InvoiceForInventory;
      plans: LineAssetPlan[];
    }) => {
      const created: InventoryAsset[] = [];
      for (const plan of plans) {
        for (let i = 0; i < plan.count; i++) {
          const unitIndex = plan.startIndex + i;
          const unit = plan.line.unit_price_ex_vat ?? 0;
          const qty = plan.line.quantity || 1;
          const vatPerUnit = (plan.line.vat_amount ?? 0) / (qty || 1);
          created.push(
            await createAsset({
              name: plan.name,
              categoryCode: plan.categoryCode,
              category_id: plan.categoryId,
              tracking_level: plan.trackingLevel,
              brand: plan.brand ?? null,
              status: "available",
              custody_mode: "shared",
              supplier_company_id: invoice.counterparty_supplier_id,
              purchase_date: invoice.issue_date,
              purchase_price_ex_vat: unit,
              vat_amount: Math.round(vatPerUnit * 100) / 100,
              purchase_price_inc_vat: Math.round((unit + vatPerUnit) * 100) / 100,
              invoice_number_snapshot: invoice.document_number,
              source_document_id: invoice.id,
              source_document_line_id: plan.line.id,
              source_unit_index: unitIndex,
              depreciation_years: plan.depreciationYears,
              replacement_years: plan.replacementYears,
            }),
          );
        }
      }

      // Recompute the invoice's single workflow status from real asset counts.
      const { data: proc } = await supabase
        .from("inventory_line_processing")
        .select("*")
        .eq("document_id", invoice.id);
      const rows = (proc ?? []) as unknown as LineProcessing[];
      const anyProcessed = rows.some((r) => r.quantity_processed > 0);
      const allDone =
        anyProcessed && rows.every((r) => r.quantity_processed >= Number(r.quantity_total));
      await supabase
        .from("financial_documents")
        .update({
          inventory_status: allDone ? "complete" : anyProcessed ? "partially_processed" : "pending",
        } as never)
        .eq("id", invoice.id);

      return created;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
