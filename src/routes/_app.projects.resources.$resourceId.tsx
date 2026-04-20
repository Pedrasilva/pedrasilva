import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  useDeleteResource,
  useResources,
  useUpdateResource,
  type ResourceTeam,
} from "@/lib/projects/use-planner";
import { useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { ArrowLeft, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Resource } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects/resources/$resourceId")({
  component: ResourceDetailPage,
});

const PALETTE = ["#f97316", "#eab308", "#06b6d4", "#a855f7", "#ec4899", "#10b981", "#3b82f6", "#ef4444"];

const TEAM_LABEL: Record<ResourceTeam, string> = {
  project: "Project Team",
  back_office: "Back Office",
};

type FullResource = Resource & {
  team?: string | null;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
};

function ResourceDetailPage() {
  const { resourceId } = Route.useParams();
  const navigate = useNavigate();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const update = useUpdateResource();
  const del = useDeleteResource();

  const member = (resources ?? []).find((r) => r.id === resourceId) as FullResource | undefined;
  const defaultRate = defaultRates?.get(resourceId)?.sale;

  const [form, setForm] = useState({
    name: "",
    role: "",
    team: "project" as ResourceTeam,
    email: "",
    phone: "",
    hourly_rate: 0,
    weekly_capacity: 40,
    color: PALETTE[0],
    notes: "",
    active: true,
  });

  useEffect(() => {
    if (!member) return;
    const stored = Number(member.hourly_rate ?? 0);
    setForm({
      name: member.name ?? "",
      role: member.role ?? "",
      team: ((member.team as ResourceTeam) ?? "project"),
      email: member.email ?? "",
      phone: member.phone ?? "",
      // Se não tem rate definido, pré-preenche com o default do HR @ 50%
      hourly_rate: stored > 0 ? stored : Number(defaultRate ?? 0),
      weekly_capacity: Number(member.weekly_capacity ?? 40),
      color: member.color ?? PALETTE[0],
      notes: member.notes ?? "",
      active: member.active ?? true,
    });
  }, [member?.id, defaultRate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!resources) {
    return (
      <AppShell active="resources">
        <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!member) {
    return (
      <AppShell active="resources">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm text-muted-foreground">Member not found.</p>
          <Link to="/projects/resources" className="mt-4 inline-block text-sm underline">
            Back to Team
          </Link>
        </div>
      </AppShell>
    );
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: resourceId,
        patch: {
          name: form.name.trim(),
          role: form.role.trim() || null,
          team: form.team,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          hourly_rate: Number(form.hourly_rate),
          weekly_capacity: Number(form.weekly_capacity),
          color: form.color,
          notes: form.notes.trim() || null,
          active: form.active,
        },
      });
      toast.success("Saved");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${member?.name}? This cannot be undone.`)) return;
    try {
      await del.mutateAsync(resourceId);
      toast.success("Removed");
      navigate({ to: "/projects/resources" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <AppShell active="resources">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link
          to="/projects/resources"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Team
        </Link>

        <div className="mt-4 flex items-start justify-between gap-6 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-background"
              style={{ backgroundColor: form.color }}
            >
              {(form.name || member.name).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{TEAM_LABEL[form.team]}</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {form.name || member.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {form.role || "—"} · {Number(form.hourly_rate)}€/h · {Number(form.weekly_capacity)} h/wk
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className={form.active ? "text-foreground" : "text-muted-foreground"}>
                {form.active ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </label>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <Section title="Team">
            <div className="inline-flex w-full max-w-xs overflow-hidden rounded-md border border-border">
              {(["project", "back_office"] as ResourceTeam[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm({ ...form, team: t })}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                    form.team === t
                      ? "bg-foreground text-background"
                      : "bg-transparent text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {TEAM_LABEL[t]}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Profile">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Role">
                <Input
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Architect"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Capacity & Rate">
            <div className="grid max-w-md grid-cols-2 gap-4">
              <Field label="Capacity (h/week)">
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={form.weekly_capacity}
                  onChange={(e) => setForm({ ...form, weekly_capacity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Sale rate (€/h)">
                <Input
                  type="number"
                  min={0}
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: Number(e.target.value) })}
                />
                {defaultRate != null && defaultRate > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, hourly_rate: defaultRate })}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Valor de venda @ 50% calculado no Resumo Comparativo do HR"
                  >
                    <Sparkles className="h-3 w-3" />
                    Sugestão HR @ 50%: {defaultRate.toFixed(2)}€/h
                  </button>
                )}
              </Field>
            </div>
          </Section>

          <Section title="Color">
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    form.color === c ? "scale-110 border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Section>

          <Section title="Notes">
            <Textarea
              rows={5}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering about this person…"
            />
          </Section>
        </div>

        <div className="mt-8 flex items-center justify-end gap-2 border-t border-border pt-6">
          <Link to="/projects/resources">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
