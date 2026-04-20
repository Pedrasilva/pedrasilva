import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCreateResource,
  useDeleteResource,
  useResources,
  useUpdateResource,
  type ResourceTeam,
} from "@/lib/projects/use-planner";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { euros } from "@/lib/projects/gantt-utils";
import type { Resource } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects/resources")({
  component: ResourcesPage,
});

const PALETTE = ["#f97316", "#eab308", "#06b6d4", "#a855f7", "#ec4899", "#10b981", "#3b82f6", "#ef4444"];

type TabKey = "all" | "project" | "back_office" | "inactive";

const TEAM_LABEL: Record<ResourceTeam, string> = {
  project: "Project Team",
  back_office: "Back Office",
};

type FullResource = Resource & { team?: string | null; active?: boolean };

function ResourcesPage() {
  const { data: resources } = useResources();
  const create = useCreateResource();
  const update = useUpdateResource();
  const del = useDeleteResource();

  const [tab, setTab] = useState<TabKey>("all");
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState<ResourceTeam>("project");
  const [costRate, setCostRate] = useState(50);
  const [saleRate, setSaleRate] = useState(100);
  const [rateFrom, setRateFrom] = useState(today);
  const [capacity, setCapacity] = useState(40);
  const [color, setColor] = useState(PALETTE[0]);

  const all = (resources ?? []) as FullResource[];

  const filtered = useMemo(() => {
    if (tab === "all") return all.filter((r) => r.active !== false);
    if (tab === "inactive") return all.filter((r) => r.active === false);
    return all.filter(
      (r) => r.active !== false && ((r.team as ResourceTeam) ?? "project") === tab,
    );
  }, [all, tab]);

  const counts = useMemo(() => {
    const active = all.filter((r) => r.active !== false);
    const proj = active.filter((r) => ((r.team as ResourceTeam) ?? "project") === "project").length;
    return {
      all: active.length,
      project: proj,
      back_office: active.length - proj,
      inactive: all.length - active.length,
    };
  }, [all]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        role: role.trim() || undefined,
        hourly_rate: Number(saleRate),
        weekly_capacity: Number(capacity),
        color,
        team,
        cost_rate: Number(costRate),
        sale_rate: Number(saleRate),
        rate_effective_from: rateFrom,
      });
      toast.success("Team member added");
      setOpen(false);
      setName("");
      setRole("");
      setTeam("project");
      setCostRate(50);
      setSaleRate(100);
      setRateFrom(today);
      setCapacity(40);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function toggleActive(r: FullResource, next: boolean) {
    try {
      await update.mutateAsync({ id: r.id, patch: { active: next } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <AppShell active="resources">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">People</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Team</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Click any name to open their full profile. Toggle active to keep someone in the
              records without showing them on new allocations.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                Add person
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Add team member</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="r-name">Name</Label>
                  <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="r-role">Role</Label>
                    <Input id="r-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Architect" />
                  </div>
                  <div>
                    <Label>Team</Label>
                    <div className="mt-1 inline-flex w-full overflow-hidden rounded-md border border-border">
                      {(["project", "back_office"] as ResourceTeam[]).map((t) => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => setTeam(t)}
                          className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                            team === t ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {TEAM_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Initial rate
                    </p>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Locked to date
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="r-cost" className="text-xs">Cost (€/h)</Label>
                      <Input
                        id="r-cost"
                        type="number"
                        min={0}
                        value={costRate}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCostRate(v);
                          setSaleRate(Math.round(v * 2));
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="r-sale" className="text-xs">Sale (€/h)</Label>
                      <Input
                        id="r-sale"
                        type="number"
                        min={0}
                        value={saleRate}
                        onChange={(e) => setSaleRate(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="r-from" className="text-xs">Effective from</Label>
                      <Input
                        id="r-from"
                        type="date"
                        value={rateFrom}
                        onChange={(e) => setRateFrom(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Future rate changes are added as new entries — historic allocations keep using
                    the rate that was in effect on their dates.
                  </p>
                </div>
                <div>
                  <Label htmlFor="r-cap">Capacity (h/week)</Label>
                  <Input id="r-cap" type="number" min={0} max={80} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setColor(c)}
                        className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending ? "Adding…" : "Add to team"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="all">
                All <span className="ml-1.5 text-xs text-muted-foreground">{counts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="project">
                Project Team <span className="ml-1.5 text-xs text-muted-foreground">{counts.project}</span>
              </TabsTrigger>
              <TabsTrigger value="back_office">
                Back Office <span className="ml-1.5 text-xs text-muted-foreground">{counts.back_office}</span>
              </TabsTrigger>
              <TabsTrigger value="inactive">
                Inactive <span className="ml-1.5 text-xs text-muted-foreground">{counts.inactive}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Capacity</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rTeam = ((r.team as ResourceTeam) ?? "project") as ResourceTeam;
                const isActive = r.active !== false;
                return (
                  <tr key={r.id} className={`border-t border-border ${!isActive ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <Link
                        to="/projects/resources/$resourceId"
                        params={{ resourceId: r.id }}
                        className="group inline-flex items-center gap-3"
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="font-medium group-hover:underline">{r.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.role ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          rTeam === "project"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TEAM_LABEL[rTeam]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{euros(Number(r.hourly_rate))}/h</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.weekly_capacity)} h/wk</td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(v) => toggleActive(r, v)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Remove ${r.name}?`)) return;
                          try {
                            await del.mutateAsync(r.id);
                            toast.success("Removed");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {all.length
                      ? `No one in this view yet.`
                      : "No team members yet. Add your first to start allocating."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
