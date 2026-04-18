import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtEUR } from "@/lib/salary";

export type DonutSlice = {
  name: string;
  value: number;
  color: string;
};

export function CompositionDonut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue?: number;
}) {
  const data = slices.map((s) => ({ ...s, value: Math.max(0, s.value) }));
  const total = data.reduce((s, d) => s + d.value, 0);
  const center = centerValue ?? total;

  return (
    <div className="space-y-3">
      <div className="relative h-[220px] w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => fmtEUR(v)}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {centerLabel}
          </div>
          <div className="text-lg font-semibold tabular-nums">{fmtEUR(center)}</div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <li
              key={d.name}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: d.color }}
                />
                <span className="truncate">{d.name}</span>
              </div>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span>{fmtEUR(d.value)}</span>
                <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SalaryDonut({
  liquido,
  ssColaborador,
  irs,
  brutoMensalGlobal,
  ssAtelierMensal,
  liquidoTotalMensal,
}: {
  liquido: number;
  ssColaborador: number;
  irs: number;
  brutoMensalGlobal?: number;
  ssAtelierMensal?: number;
  liquidoTotalMensal?: number;
}) {
  const empregadorTotal = (ssAtelierMensal ?? 0) + irs + ssColaborador;
  return (
    <div className="space-y-4">
      <CompositionDonut
        centerLabel="Bruto mensal global"
        centerValue={brutoMensalGlobal}
        slices={[
          { name: "Líquido", value: liquido, color: "var(--sage)" },
          { name: "SS Colaborador", value: ssColaborador, color: "var(--clay)" },
          { name: "IRS", value: irs, color: "oklch(0.65 0.13 50)" },
        ]}
      />
      {(ssAtelierMensal !== undefined || liquidoTotalMensal !== undefined) && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2">
          <p className="text-muted-foreground leading-relaxed">
            Do bruto mensal global, o empregador entrega ao Estado e o colaborador
            leva para casa:
          </p>
          <div className="space-y-1">
            <Row
              label="Empregador → Estado (SS Atelier + IRS + SS Colab.)"
              value={fmtEUR(empregadorTotal)}
              color="oklch(0.65 0.13 50)"
            />
            <Row
              label="Colaborador → para casa (líquido + subs. + ajudas)"
              value={fmtEUR(liquidoTotalMensal ?? liquido)}
              color="var(--sage)"
              strong
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: color }}
        />
        <span className="truncate">{label}</span>
      </div>
      <span className={`font-mono tabular-nums ${strong ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
