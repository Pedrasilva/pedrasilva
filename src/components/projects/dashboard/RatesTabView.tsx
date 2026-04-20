import { useEffect, useMemo, useState } from "react";
import { Search, Info, Check, X } from "lucide-react";
import { useResources } from "@/lib/projects/use-planner";
import type { Project } from "@/lib/projects/types";

/**
 * Project rate overrides are stored client-side only for now (não há tabela
 * `project_rate_overrides` no schema). A UI permite editar tarifas por projecto
 * mas as alterações persistem apenas em memória até existir suporte de BD.
 */
interface RateOverride {
  resource_id: string;
  enabled: boolean;
  project_rate: number;
}

export function RatesTabView({ project }: { project: Project }) {
  const { data: resources } = useResources();
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Map<string, RateOverride>>(new Map());

  const rows = useMemo(() => {
    const list = (resources ?? []).filter((r) => r.active);
    const q = search.trim().toLowerCase();
    return q ? list.filter((r) => r.name.toLowerCase().includes(q)) : list;
  }, [resources, search]);

  const updateOverride = (resourceId: string, patch: Partial<RateOverride>) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(resourceId) ?? { resource_id: resourceId, enabled: true, project_rate: 0 };
      next.set(resourceId, { ...cur, ...patch });
      return next;
    });
  };

  return (
    <div className="bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">Tarifas do projecto</h3>
          <p className="text-xs text-muted-foreground">
            Sobreposição opcional de tarifas por hora para este projecto. Projecto {project.name}.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar recurso…"
            className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-[24px_1fr_140px_140px] items-center gap-3 bg-primary/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground">
        <span aria-hidden />
        <span>Recurso</span>
        <span className="text-right">Tarifa default</span>
        <span className="flex items-center justify-end gap-1">
          <Info className="h-3 w-3 text-muted-foreground" /> Tarifa do projecto
        </span>
      </div>

      <ul className="divide-y divide-border">
        {rows.length === 0 && (
          <li className="px-5 py-8 text-center text-xs text-muted-foreground">
            Nenhum recurso corresponde à pesquisa.
          </li>
        )}
        {rows.map((r) => {
          const o = overrides.get(r.id);
          const enabled = o?.enabled ?? true;
          const projectRate = o?.project_rate ?? 0;
          return (
            <RateRow
              key={r.id}
              name={r.name}
              color={r.color}
              defaultRate={Number(r.hourly_rate)}
              enabled={enabled}
              projectRate={projectRate}
              onToggle={(next) => updateOverride(r.id, { enabled: next })}
              onRateChange={(next) => updateOverride(r.id, { project_rate: next })}
            />
          );
        })}
      </ul>

      <p className="border-t border-border px-5 py-3 text-[11px] italic text-muted-foreground">
        Nota: as alterações às tarifas do projecto não são guardadas (a tabela ainda não existe na base de dados).
      </p>
    </div>
  );
}

function RateRow({
  name,
  color,
  defaultRate,
  enabled,
  projectRate,
  onToggle,
  onRateChange,
}: {
  name: string;
  color: string;
  defaultRate: number;
  enabled: boolean;
  projectRate: number;
  onToggle: (next: boolean) => void;
  onRateChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(projectRate.toString());
  useEffect(() => {
    setDraft(projectRate.toString());
  }, [projectRate]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== projectRate) onRateChange(n);
    else setDraft(projectRate.toString());
  };

  return (
    <li
      className={`grid grid-cols-[24px_1fr_140px_140px] items-center gap-3 px-5 py-2.5 transition-colors ${
        enabled ? "" : "opacity-50"
      } hover:bg-accent/30`}
    >
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
          enabled
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-transparent hover:border-primary/60"
        }`}
      >
        {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-6 w-6 shrink-0 rounded-full text-[10px] font-semibold flex items-center justify-center text-white"
          style={{ backgroundColor: color }}
        >
          {name.slice(0, 1)}
        </span>
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>

      <span className="text-right font-mono text-sm text-foreground">€{defaultRate}</span>

      <div className="flex items-center justify-end gap-1">
        <span className="text-sm text-muted-foreground">€</span>
        <input
          type="number"
          min={0}
          step="1"
          value={draft}
          disabled={!enabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          className="h-7 w-20 rounded-md border border-border bg-background px-2 text-right font-mono text-sm outline-none focus:border-primary disabled:cursor-not-allowed"
        />
      </div>
    </li>
  );
}
