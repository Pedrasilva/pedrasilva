/**
 * Two-step picker shared by the timesheet's "Add project, stage or lead" and the
 * assistant's "Other…" search. Step 1: Projects / Proposals (CRM) / Internal.
 * Step 2 (projects only): that project's stages, monthly retainer stages ordered
 * around the reference date. Pure UI — callers decide what a pick does.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickerStage = { id: string; name: string; start_date: string; end_date: string };
export type PickerProject = { id: string; name: string; client: string | null; aliases?: string[]; stages: PickerStage[] };
export type PickerLead = { id: string; name: string; client: string | null };
/** A ranked calendar match shown above the normal sections (best first). */
export type PickerSuggestion = {
  key: string;
  label: string;
  /** Why it is suggested: remembered choice, matched word, project number, attendee company. */
  reason: "remembered" | "word" | "number" | "attendee";
  project?: PickerProject;
  stage?: PickerStage | null;
  lead?: PickerLead;
  category?: string;
  preselect?: boolean;
};

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** A stage that covers exactly one calendar month (retainer-style). */
function monthKey(s: PickerStage): string | null {
  const [y, m, d] = s.start_date.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = s.end_date.slice(0, 10).split("-").map(Number);
  if (!y || d !== 1 || y !== y2 || m !== m2) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d2 === last ? `${y}-${String(m).padStart(2, "0")}` : null;
}
const monthIndex = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;

type Props = {
  projects: PickerProject[];
  leads: PickerLead[];
  categories: string[];
  /** Date the time is for (assistant: the draft's date; timesheet: the week start). */
  refDate?: string;
  onQueryChange?: (q: string) => void;
  /** Shown when there is no query and no project to list (timesheet searches the server). */
  emptyProjectsHint?: string;
  searching?: boolean;
  busy?: boolean;
  autoFocus?: boolean;
  onPickStage: (p: PickerProject, s: PickerStage) => void;
  /** Optional: offer "only the project" in step 2 and fill the answer as soon as a project is opened. */
  onPickProject?: (p: PickerProject) => void;
  /** Optional: return true to accept the project at once (e.g. retainers — no month choice). */
  onPickDirect?: (p: PickerProject) => boolean;
  onPickLead: (l: PickerLead) => void;
  onPickCategory: (c: string) => void;
  /** Calendar matches, best first (max 3), shown in a "Suggestions" section at the top. */
  suggestions?: PickerSuggestion[];
};

export function ProjectStageLeadPicker(props: Props) {
  const { t } = useTranslation("projects");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<PickerProject | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [showLater, setShowLater] = useState(false);

  const q = norm(query);
  const match = (...xs: Array<string | null | undefined>) => !q || xs.some((x) => x && norm(x).includes(q));
  const projects = props.projects.filter((p) => match(p.name, p.client, ...(p.aliases ?? [])));
  const leads = props.leads.filter((l) => match(l.name, l.client));
  const categories = props.categories.filter((c) => match(c));

  function pickProject(p: PickerProject) {
    if (props.onPickDirect?.(p)) return;
    if (p.stages.length === 1) return props.onPickStage(p, p.stages[0]);
    setProject(p);
    setShowOlder(false);
    setShowLater(false);
  }

  const stageGroups = useMemo(() => {
    if (!project) return null;
    const ref = (props.refDate ?? new Date().toISOString()).slice(0, 7);
    const r = monthIndex(ref);
    const regular: PickerStage[] = [];
    const current: PickerStage[] = [];
    const recent: Array<[number, PickerStage]> = [];
    const older: Array<[number, PickerStage]> = [];
    const later: Array<[number, PickerStage]> = [];
    for (const s of project.stages) {
      const k = monthKey(s);
      if (!k) { regular.push(s); continue; }
      const i = monthIndex(k);
      if (i === r) current.push(s);
      else if (i >= r - 2 && i <= r + 1) recent.push([Math.abs(i - r) * 2 + (i > r ? 1 : 0), s]);
      else if (i < r) older.push([r - i, s]);
      else later.push([i - r, s]);
    }
    const by = (a: [number, PickerStage], b: [number, PickerStage]) => a[0] - b[0];
    return {
      top: [...current, ...recent.sort(by).map((x) => x[1])],
      regular,
      older: older.sort(by).map((x) => x[1]),
      later: later.sort(by).map((x) => x[1]),
    };
  }, [project, props.refDate]);

  useEffect(() => { props.onQueryChange?.(query); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [query]);

  const row = "flex w-full min-h-11 items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50";
  const heading = "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

  if (project && stageGroups) {
    const stageBtn = (s: PickerStage) => (
      <button key={s.id} type="button" disabled={props.busy} className={row} onClick={() => props.onPickStage(project, s)}>
        <span className="flex-1">{s.name}</span>
      </button>
    );
    const fold = (open: boolean, set: (v: boolean) => void, label: string, list: PickerStage[]) =>
      list.length > 0 && (
        <div>
          <button type="button" className={cn(row, "text-muted-foreground")} onClick={() => set(!open)} aria-expanded={open}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="flex-1">{label}</span>
            <span className="text-xs">{list.length}</span>
          </button>
          {open && <div className="pl-4">{list.map(stageBtn)}</div>}
        </div>
      );
    return (
      <div className="w-full">
        <div className="border-b border-border px-1 py-1">
          <button type="button" className={cn(row, "text-primary")} onClick={() => setProject(null)}>
            <ArrowLeft className="h-4 w-4" /> {t("picker.backToProjects")}
          </button>
          <div className="px-3 pb-2 font-medium">{project.name}</div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {props.onPickProject && (
            <button type="button" disabled={props.busy} className={cn(row, "font-medium text-primary")} onClick={() => props.onPickProject!(project)}>
              <span className="flex-1">{t("picker.justProject")}</span>
            </button>
          )}
          {project.stages.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("picker.noStages")}</div>}
          {stageGroups.top.map(stageBtn)}
          {stageGroups.regular.map(stageBtn)}
          {fold(showLater, setShowLater, t("picker.laterMonths"), stageGroups.later)}
          {fold(showOlder, setShowOlder, t("picker.olderMonths"), stageGroups.older)}
        </div>
      </div>
    );
  }

  const sugg = !q ? (props.suggestions ?? []).slice(0, 3) : [];
  const pickSuggestion = (sg: PickerSuggestion) => {
    if (sg.lead) return props.onPickLead(sg.lead);
    if (sg.category) return props.onPickCategory(sg.category);
    if (sg.project && sg.stage) return props.onPickStage(sg.project, sg.stage);
    if (sg.project) return pickProject(sg.project);
  };
  const preselected = sugg.find((x) => x.preselect);
  const nothing = projects.length === 0 && leads.length === 0 && categories.length === 0;
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus={props.autoFocus && !preselected}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("picker.searchPlaceholder")}
          aria-label={t("picker.searchPlaceholder")}
          className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {sugg.length > 0 && (
          <div className="border-b border-border pb-1">
            <div className={heading}>{t("picker.suggestions")}</div>
            {sugg.map((sg) => (
              <button
                key={sg.key}
                type="button"
                autoFocus={sg === preselected}
                disabled={props.busy}
                className={cn(row, sg === preselected && "bg-accent ring-1 ring-primary")}
                onClick={() => pickSuggestion(sg)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{sg.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{t(`picker.suggestionReason.${sg.reason}`)}</span>
              </button>
            ))}
          </div>
        )}
        {projects.length > 0 && (
          <div>
            <div className={heading}>{t("picker.projects")}</div>
            {projects.map((p) => (
              <button key={p.id} type="button" disabled={props.busy || p.stages.length === 0} className={row} onClick={() => pickProject(p)}>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.stages.length === 0 && <span className="text-[11px] text-muted-foreground">{t("picker.noActiveStages")}</span>}
                {p.stages.length > 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}
        {projects.length === 0 && !q && props.emptyProjectsHint && (
          <div className="px-3 py-3 text-xs text-muted-foreground">{props.emptyProjectsHint}</div>
        )}
        {q && props.searching && projects.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted-foreground">{t("picker.searching")}</div>
        )}
        {leads.length > 0 && (
          <div>
            <div className={heading}>{t("picker.leads")}</div>
            {leads.map((l) => (
              <button key={l.id} type="button" disabled={props.busy} className={row} onClick={() => props.onPickLead(l)}>
                <span className="min-w-0 flex-1 truncate">{[l.name, l.client].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <div className={heading}>{t("picker.internal")}</div>
            {categories.map((c) => (
              <button key={c} type="button" disabled={props.busy} className={row} onClick={() => props.onPickCategory(c)}>
                <span className="flex-1">{c}</span>
              </button>
            ))}
          </div>
        )}
        {nothing && q && !props.searching && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("picker.noMatch", { query })}</div>
        )}
      </div>
    </div>
  );
}
