import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtEUR } from "@/lib/salary";

const colors: Record<string, string> = {
  liquido: "var(--sage)",
  ss: "var(--clay)",
  irs: "oklch(0.65 0.13 50)",
};

export function SalaryDonut({
  liquido,
  ssColaborador,
  irs,
}: {
  liquido: number;
  ssColaborador: number;
  irs: number;
}) {
  const data = [
    { name: "Líquido", value: Math.max(0, liquido), key: "liquido" },
    { name: "SS Colaborador", value: ssColaborador, key: "ss" },
    { name: "IRS", value: irs, key: "irs" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative h-[260px] w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={colors[d.key]} />
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
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bruto mensal</div>
        <div className="text-lg font-semibold tabular-nums">{fmtEUR(total)}</div>
      </div>
    </div>
  );
}
