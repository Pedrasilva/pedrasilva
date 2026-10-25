import { prepareStoryRender } from "@/lib/marketing/render-story-browser";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MessageSquareWarning, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { decidePostApproval, listPostApprovers, requestPostApproval } from "@/lib/marketing/post-approvals.functions";
import { useDraftWarningConfirm } from "./draft-warning-confirm";

export function usePostApprovers(enabled = true) {
  const fn = useServerFn(listPostApprovers);
  return useQuery({ queryKey: ["marketing-post-approvers"], queryFn: () => fn(), enabled, staleTime: 300_000 });
}

type Approval = { id: string; requested_by: string; approver_id: string; decision: string; comment: string | null; created_at: string; decided_at: string | null; voided_at: string | null };

/** Request / decide controls for one draft. */
export function PostApprovalControls({ draftId, status, canCurate, isStory = false, needsReapproval = false }: { needsReapproval?: boolean; isStory?: boolean; draftId: string; status: string; readiness: string; canCurate: boolean }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { user } = useAuth();
  const requestFn = useServerFn(requestPostApproval);
  const decideFn = useServerFn(decidePostApproval);
  const warning = useDraftWarningConfirm(draftId);
  const [askOpen, setAskOpen] = useState(false);
  const [approver, setApprover] = useState("");
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<"approved" | "changes_requested" | null>(null);
  const [busy, setBusy] = useState(false);
  const people = usePostApprovers(true);
  const { data: approvals = [] } = useQuery({
    queryKey: ["marketing-post-approvals", draftId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_post_approvals").select("*").eq("draft_id", draftId).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as Approval[];
    },
  });
  const name = (id: string) => people.data?.find((p) => p.userId === id)?.name ?? "—";
  const pending = approvals.find((a) => a.decision === "pending" && !a.voided_at);
  const lastChanges = approvals.find((a) => a.decision === "changes_requested");
  const refresh = () => {
    for (const k of ["marketing-posts", "marketing-post-approvals", "marketing-calendar", "marketing-my-post-approvals", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const ask = async () => {
    if (!approver) return;
    setBusy(true);
    try {
      if (isStory) await prepareStoryRender(draftId);
      const r = await requestFn({ data: { draftId, approverId: approver, comment: comment.trim() || undefined, reapproval: needsReapproval } });
      toast.success(r.emailed ? t("approval.requested") : t("approval.requestedNoEmail"));
      setAskOpen(false); setComment(""); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    finally { setBusy(false); }
  };
  const decide = async () => {
    if (!pending || !decision) return;
    setBusy(true);
    try {
      if (isStory && decision === "approved") await prepareStoryRender(draftId);
      await decideFn({ data: { approvalId: pending.id, decision, comment: comment.trim() || undefined } });
      toast.success(decision === "approved" ? t("approval.approvedToast") : t("approval.changesToast"));
      setDecision(null); setComment(""); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    finally { setBusy(false); }
  };

  const others = (people.data ?? []).filter((p) => p.userId !== user?.id);
  return (
    <div className="space-y-2">
      {status === "pending_approval" && pending && (
        <p className="text-xs text-muted-foreground">{t("approval.waiting", { name: name(pending.approver_id) })}{pending.comment ? ` — ${pending.comment}` : ""}</p>
      )}
      {status === "suggested" && lastChanges && !pending && (
        <p className="text-xs text-warning">{t("approval.changesBy", { name: name(lastChanges.approver_id) })}{lastChanges.comment ? `: ${lastChanges.comment}` : ""}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canCurate && (status === "suggested" || status === "pending_approval" || needsReapproval) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAskOpen(true)}>
            <Send className="mr-1 h-3.5 w-3.5" />{status === "pending_approval" ? t("approval.askAgain") : t("approval.ask")}
          </Button>
        )}
        {pending && pending.approver_id === user?.id && status === "pending_approval" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => setDecision("approved")}><Check className="mr-1 h-3.5 w-3.5" />{t("approval.approve")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDecision("changes_requested")}><MessageSquareWarning className="mr-1 h-3.5 w-3.5" />{t("approval.requestChanges")}</Button>
          </>
        )}
      </div>

      <Dialog open={askOpen} onOpenChange={(v) => !busy && setAskOpen(v)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("approval.ask")}</DialogTitle></DialogHeader>
          <Label>{t("approval.colleague")}</Label>
          <Select value={approver} onValueChange={setApprover}>
            <SelectTrigger><SelectValue placeholder={t("approval.pickColleague")} /></SelectTrigger>
            <SelectContent>{others.map((p) => <SelectItem key={p.userId} value={p.userId}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Label>{t("approval.comment")}</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          <DialogFooter><Button onClick={ask} disabled={busy || !approver}>{t("approval.send")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!decision} onOpenChange={(v) => !busy && !v && setDecision(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decision === "approved" ? t("approval.approve") : t("approval.requestChanges")}</DialogTitle></DialogHeader>
          <Label>{t("approval.comment")}{decision === "changes_requested" ? " *" : ""}</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          <DialogFooter><Button onClick={() => decision === "approved" ? warning.run(decide) : decide()} disabled={busy || (decision === "changes_requested" && !comment.trim())}>{t("approval.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {warning.dialog}
    </div>
  );
}
