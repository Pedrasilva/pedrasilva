import { translateError } from '@/lib/translate-error';
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from '@/lib/toast';
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Review = { hash: string; issue: string | null };
type Pending = { review: Review; proceed: () => Promise<unknown>; patch: Record<string, unknown> };

/** Confirmation applies to the saved content hash, not to a readiness label. */
export function useDraftWarningConfirm(draftId: string) {
  const { t } = useTranslation("marketing");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => toast.error(e instanceof Error ? translateError(e.message) : t("posts.error"));
  const review = async (patch: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc("marketing_review_draft_warnings", { _draft: draftId, _patch: patch as Json });
    if (error) throw error;
    return data as unknown as Review;
  };
  const run = async (proceed: () => Promise<unknown>, patch: Record<string, unknown> = {}) => {
    try {
      const current = await review(patch);
      if (current.issue) setPending({ review: current, proceed, patch });
      else await proceed();
    } catch (e) { fail(e); }
  };
  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (Object.keys(pending.patch).length) {
        const { error } = await supabase.from("marketing_post_drafts").update(pending.patch as Database["public"]["Tables"]["marketing_post_drafts"]["Update"]).eq("id", draftId);
        if (error) throw error;
      }
      const { error } = await supabase.rpc("marketing_confirm_draft_warning", { _draft: draftId, _hash: pending.review.hash });
      if (error) throw error;
      await pending.proceed();
      setPending(null);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };
  const dialog = <Dialog open={!!pending} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t("approval.warningTitle")}</DialogTitle><DialogDescription>{pending?.review.issue}</DialogDescription></DialogHeader>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>{t("common:cancel")}</Button>
        <Button disabled={busy} onClick={confirm}>{t("approval.confirmWarning")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
  return { run, dialog };
}