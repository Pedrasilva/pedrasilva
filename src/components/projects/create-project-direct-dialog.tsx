/**
 * Direct project creation — a first-class path alongside quote conversion.
 *
 * Creates a pm_projects row with origin='direct' (no quote_id, no
 * pm_project_contract_baseline) plus its initial stages. Stages created here
 * carry origin=null: there is no sold baseline to compare against, so
 * "original vs added" is not applicable.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { Plus, Trash2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CompanyPicker } from "@/components/crm/company-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PALETTE = ["#16a34a", "#2563eb", "#db2777", "#ea580c", "#9333ea", "#0d9488", "#dc2626", "#ca8a04"];
const STAGE_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];

type BillingModel = "stage" | "hourly" | "monthly";

interface StageDraft {
  key: string;
  name: string;
  billing_model: BillingModel;
  budget: number;
  start_date: string;
  end_date: string;
}

const newStage = (start: string, i: number): StageDraft => ({
  key: `${Date.now()}-${i}`,
  name: "",
  billing_model: "stage",
  budget: 0,
  start_date: start,
  end_date: format(addDays(new Date(start), 30), "yyyy-MM-dd"),
});

export function CreateProjectDirectDialog({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [status, setStatus] = useState<"active" | "paused" | "archived">("active");
  const [color, setColor] = useState(PALETTE[0]);
  const [notes, setNotes] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([newStage(today, 0)]);

  function reset() {
    setName("");
    setCompanyId(null);
    setClientName("");
    setStartDate(today);
    setStatus("active");
    setNotes("");
    setStages([newStage(today, 0)]);
  }

  function patchStage(key: string, patch: Partial<StageDraft>) {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: project, error } = await supabase
        .from("pm_projects")
        .insert({
          name: name.trim(),
          client: clientName.trim() || null,
          company_id: companyId,
          start_date: startDate,
          status,
          color,
          notes: notes.trim() || null,
          origin: "direct",
        })
        .select()
        .single();
      if (error) throw error;

      const rows = stages
        .filter((s) => s.name.trim())
        .map((s, i) => ({
          project_id: project.id,
          name: s.name.trim(),
          billing_model: s.billing_model,
          budget: s.billing_model === "hourly" ? 0 : Number(s.budget) || 0,
          start_date: s.start_date,
          end_date: s.end_date,
          color: STAGE_COLORS[i % STAGE_COLORS.length],
          sort_order: i,
          origin: null,
        }));

      if (rows.length > 0) {
        const { error: stageErr } = await supabase.from("pm_stages").insert(rows);
        if (stageErr) throw stageErr;
      }

      await qc.invalidateQueries({ queryKey: ["pm-projects"] });
      await qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      toast.success("Project created");
      setOpen(false);
      reset();
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={compact ? "sm" : "default"}>
          <FolderPlus className="mr-1.5 h-4 w-4" />
          Create project directly
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create project directly</DialogTitle>
          <DialogDescription>
            For work that never went through a CRM proposal — migrated legacy
            projects, small retainers, ad-hoc support. No quote or contractual
            baseline is created.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="dp-name">Project name</Label>
              <Input
                id="dp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2610 Example Project"
                autoFocus
              />
            </div>
            <div>
              <Label>Client (CRM company)</Label>
              <CompanyPicker value={companyId} onChange={setCompanyId} />
            </div>
            <div>
              <Label htmlFor="dp-client">Client label (optional)</Label>
              <Input
                id="dp-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Shown when no CRM company is linked"
              />
            </div>
            <div>
              <Label htmlFor="dp-start">Start date</Label>
              <Input
                id="dp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Colour</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      color === c ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="dp-notes">Notes</Label>
              <Textarea
                id="dp-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, origin of the work, closeout state…"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Stages</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setStages((prev) => [...prev, newStage(startDate, prev.length)])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add stage
              </Button>
            </div>
            <div className="space-y-3">
              {stages.map((s) => (
                <div key={s.key} className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Input
                      value={s.name}
                      onChange={(e) => patchStage(s.key, { name: e.target.value })}
                      placeholder="Stage name"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      value={s.billing_model}
                      onValueChange={(v) =>
                        patchStage(s.key, { billing_model: v as BillingModel })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stage">Fixed fee</SelectItem>
                        <SelectItem value="hourly">Hourly (T&amp;M)</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={0}
                      value={s.budget}
                      disabled={s.billing_model === "hourly"}
                      onChange={(e) => patchStage(s.key, { budget: Number(e.target.value) })}
                      placeholder="Fee €"
                    />
                  </div>
                  <div className="sm:col-span-1.5 sm:col-span-2">
                    <Input
                      type="date"
                      value={s.start_date}
                      onChange={(e) => patchStage(s.key, { start_date: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Input
                      type="date"
                      value={s.end_date}
                      onChange={(e) => patchStage(s.key, { end_date: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center sm:col-span-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setStages((prev) => prev.filter((x) => x.key !== s.key))}
                      aria-label="Remove stage"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {stages.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No stages — you can add them later on the project page.
                </p>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Hourly stages are pure time-and-materials: no fixed fee is stored.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
