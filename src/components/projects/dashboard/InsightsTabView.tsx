import {
  Bar,
  ComposedChart,
  Line,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProjectInsights } from "@/lib/projects/use-project-insights";
import { euros } from "@/lib/projects/gantt-utils";
import { formatHM } from "@/lib/projects/time-format";

interface Props {
  projectId: string;
}

export function InsightsTabView({ projectId }: Props) {
  const { data, isLoading, error } = useProjectInsights(projectId);

  if (isLoading) {
    return <div className="px-5 py-12 text-center text-sm text-muted-foreground">A carregar insights…</div>;
  }
  if (error || !data) {
    return <div className="px-5 py-12 text-center text-sm text-destructive">Não foi possível carregar insights.</div>;
  }

  const { monthly, byResource, totals, financials, workInProgressHours, workDonePct } = data;

  return (
    <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <SectionTitle>Actividades vs. Horas</SectionTitle>
        <div className="rounded-lg border border-border bg-card p-4">
          {monthly.length === 0 ? (
            <EmptyChart label="Ainda sem horas registadas neste projecto." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={monthly} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="activities" name="Actividades" fill="#0d9488" radius={[2, 2, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="hours"
                    name="Horas"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#10b981"
                    fillOpacity={0.25}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <SectionTitle>Valor</SectionTitle>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <ValueBar
              label="Earned Value"
              value={euros(totals.earnedValue)}
              pct={totals.earnedPct}
              over={totals.earnedPct > 100}
            />
            <ValueBar
              label="Forecast Value"
              value={euros(totals.forecastValue)}
              pct={totals.forecastPct}
              over={totals.forecastPct > 100}
            />
          </div>
        </div>

        <div>
          <SectionTitle>Rentabilidade</SectionTitle>
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4">
            <Donut label="Actual" value={euros(financials.total.profit)} pct={totals.profitPctCurrent} />
            <Donut label="Previsto" value={euros(financials.total.value - financials.total.cost)} pct={totals.profitPctForecast} />
          </div>
        </div>
      </section>

      <section className="lg:col-span-2">
        <SectionTitle>Financeiro</SectionTitle>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium" />
                <th className="px-4 py-2 text-right font-medium">Serviços</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              <FinRow label="Orçamento" cells={[financials.services.budget, financials.total.budget]} bold />
              <FinRow
                label="Valor"
                cells={[financials.services.value, financials.total.value]}
                pcts={[
                  financials.services.budget > 0 ? Math.round((financials.services.value / financials.services.budget) * 100) : null,
                  financials.total.budget > 0 ? Math.round((financials.total.value / financials.total.budget) * 100) : null,
                ]}
              />
              <FinRow label="Custo" cells={[financials.services.cost, financials.total.cost]} />
              <FinRow
                label="Lucro"
                cells={[financials.services.profit, financials.total.profit]}
                pcts={[
                  financials.services.value > 0 ? Math.round((financials.services.profit / financials.services.value) * 100) : null,
                  financials.total.value > 0 ? Math.round((financials.total.profit / financials.total.value) * 100) : null,
                ]}
              />
              <FinRow label="Facturado" cells={[0, 0]} muted />
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Trabalho</SectionTitle>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4">
          <div className="text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Em progresso</p>
            <Donut label="" value={formatHM(workInProgressHours) || "0h00"} pct={Math.min(100, 100 - workDonePct)} muted />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Concluído</p>
            <Donut label="" value={`${workDonePct}%`} pct={workDonePct} />
          </div>
        </div>
      </section>

      <section className="lg:col-span-3">
        <SectionTitle>Trabalho por recurso</SectionTitle>
        <div className="rounded-lg border border-border bg-card p-4">
          {byResource.length === 0 ? (
            <EmptyChart label="Sem horas registadas por recurso." />
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const max = Math.max(...byResource.map((r) => r.hours), 1);
                return byResource.map((r) => (
                  <div key={r.resource_id} className="flex items-center gap-3">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.initial}
                    </div>
                    <div className="flex-1">
                      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${(r.hours / max) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-20 text-right font-mono text-xs font-semibold text-foreground">
                      {formatHM(r.hours) || "0h00"}
                    </span>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-foreground">{children}</h3>;
}

function ValueBar({ label, value, pct, over }: { label: string; value: string; pct: number; over: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {label}: <span className="font-mono">{value}</span>{" "}
          <span className={`text-[11px] ${over ? "font-semibold text-destructive" : "text-muted-foreground"}`}>({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${over ? "bg-destructive" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function Donut({ label, value, pct, muted = false }: { label: string; value: string; pct: number; muted?: boolean }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  const stroke = muted ? "hsl(var(--muted-foreground))" : pct >= 100 ? "#ef4444" : "#10b981";
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 70 70" className="h-full w-full -rotate-90">
          <circle cx={35} cy={35} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={6} />
          <circle
            cx={35}
            cy={35}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={6}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-foreground">{pct}%</span>
        </div>
      </div>
      <p className="font-mono text-xs font-semibold text-foreground">{value}</p>
      {label && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>}
    </div>
  );
}

function FinRow({
  label,
  cells,
  pcts,
  bold,
  muted,
}: {
  label: string;
  cells: number[];
  pcts?: (number | null)[];
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={muted ? "text-muted-foreground" : ""}>
      <td className={`px-4 py-2 text-left font-sans text-xs ${bold ? "font-semibold text-foreground" : "text-foreground"}`}>{label}</td>
      {cells.map((v, i) => (
        <td key={i} className="px-4 py-2 text-right">
          <div>{euros(v)}</div>
          {pcts?.[i] != null && (
            <div className="text-[10px] text-muted-foreground">{pcts[i]}%</div>
          )}
        </td>
      ))}
    </tr>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
