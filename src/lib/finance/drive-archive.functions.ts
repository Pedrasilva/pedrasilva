/**
 * Finance → Administração → Arquivo Drive (admin and finance): archive root,
 * Drive copy status of filed bank documents, retries, and the HR sync status
 * (same archive root).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinanceAccess(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) throw new Response("Forbidden: finance access required", { status: 403 });
}

export const getDriveArchiveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { getArchiveRootInfo } = await import("@/lib/finance/bank-drive-filing.server");
    const { data: rows, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, intake_type, original_filename, extracted_seller_name, bank_period, filed_at, drive_copy_status, drive_copy_error, drive_copy_attempts, drive_copy_attempted_at, drive_next_retry_at, drive_copied_at, drive_web_link")
      .eq("status", "filed")
      .eq("intake_route", "bank");
    if (error) throw new Error(error.message);
    const counts = { copied: 0, failed: 0, pending: 0 };
    let last: string | null = null;
    for (const r of rows ?? []) {
      const s = (r.drive_copy_status ?? "pending") as keyof typeof counts;
      counts[s]++;
      if (r.drive_copied_at && (!last || r.drive_copied_at > last)) last = r.drive_copied_at;
    }
    const open = (rows ?? [])
      .filter((r) => r.drive_copy_status !== "copied")
      .sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
    const { data: hr } = await supabase.from("benefit_expense_drive_sync").select("status, last_error, updated_at");
    const hrCounts: Record<string, number> = {};
    let hrLast: string | null = null;
    let hrError: string | null = null;
    for (const h of (hr ?? []) as any[]) {
      hrCounts[h.status] = (hrCounts[h.status] ?? 0) + 1;
      if (h.status === "synced" && (!hrLast || h.updated_at > hrLast)) hrLast = h.updated_at;
      if (h.status === "failed" && !hrError) hrError = h.last_error ?? null;
    }
    return { root: await getArchiveRootInfo(), counts, lastCopiedAt: last, open, hr: { counts: hrCounts, lastSyncedAt: hrLast, sampleError: hrError } };
  });

export const retryDriveCopies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(25) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    const { copyQueueItemToDrive } = await import("@/lib/finance/bank-drive-filing.server");
    let copied = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const id of data.ids) {
      const r = await copyQueueItemToDrive(id, { manual: true });
      if (r.ok) copied++; else errors.push({ id, error: r.error ?? "failed" });
    }
    return { copied, errors };
  });
