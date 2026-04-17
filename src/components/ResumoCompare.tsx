import { useMemo, useState } from "react";
import { computeSnapshot, fmtDate, fmtEUR, type Snapshot } from "@/lib/salary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ResumoCompare({ snapshots }: { snapshots: Snapshot[] }) {
  const effectives = snapshots.filter((s) => s.is_effective);
  const proposals = snapshots.filter((s) => !s.is_effective);

  const lastEffective = useMemo(
    () => [...effectives].sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0],
    [effectives],
  );
  const lastProposed = useMemo(
    () => [...proposals].sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0],
    [proposals],
  );

  const [leftId, setLeftId] = useState<string>(lastEffective?.id ?? "");
  const [rightId, setRightId] = useState<string>(lastProposed?.id ?? "");

  const left = snapshots.find((s) => s.id === leftId) ?? lastEffective;
  const right = snapshots.find((s) => s.id === rightId) ?? lastProposed;

  if (!left && !right) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Crie pelo menos uma ficha para ver o resumo.
        </CardContent>
      </Card>
    );
  }

  const cl = left ? computeSnapshot(left) : null;
  const cr = right ? computeSnapshot(right) : null;

  const rows: Array<{ label: string; l: number | null; r: number | null; pct?: boolean }> = [
    { label: "Bruto anual", l: cl?.brutoAnual ?? null, r: cr?.brutoAnual ?? null },
    { label: "Bruto mensal", l: cl?.brutoMensal ?? null, r: cr?.brutoMensal ?? null },
    { label: "Valor base x meses", l: cl?.baseAnual ?? null, r: cr?.baseAnual ?? null },
    { label: "Líquido mensal (12)", l: cl?.liquido12m ?? null, r: cr?.liquido12m ?? null },
    { label: "Subsídio alimentação diário", l: left?.subsidio_alimentacao_diario ?? null, r: right?.subsidio_alimentacao_diario ?? null },
    { label: "Subsídio alimentação mensal", l: cl?.alimentacaoMensal ?? null, r: cr?.alimentacaoMensal ?? null },
    { label: "Ajudas de custo (anual)", l: left?.ajudas_custo_anual ?? null, r: right?.ajudas_custo_anual ?? null },
    { label: "Ajudas de custo (mensal)", l: cl?.ajudasMensal ?? null, r: cr?.ajudasMensal ?? null },
    { label: "Líquido total mensal", l: cl?.liquidoTotalMensal ?? null, r: cr?.liquidoTotalMensal ?? null },
    { label: "Benefícios anual", l: cl?.beneficiosAnual ?? null, r: cr?.beneficiosAnual ?? null },
    { label: "Custo VBG anual", l: cl?.custoVBG ?? null, r: cr?.custoVBG ?? null },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparação</CardTitle>
          <CardDescription>
            Por defeito: última ficha efectiva vs. última ficha proposta. Pode escolher quaisquer
            duas fichas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Picker
              label="Coluna A"
              value={leftId || left?.id || ""}
              onChange={setLeftId}
              snapshots={snapshots}
            />
            <Picker
              label="Coluna B"
              value={rightId || right?.id || ""}
              onChange={setRightId}
              snapshots={snapshots}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">
                  {left ? `${left.label} · ${fmtDate(left.reference_date)}` : "—"}
                </TableHead>
                <TableHead className="text-right">
                  {right ? `${right.label} · ${fmtDate(right.reference_date)}` : "—"}
                </TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const delta = r.l != null && r.r != null ? r.r - r.l : null;
                const pct = r.l && r.r != null ? (r.r - r.l) / r.l : null;
                const cls =
                  delta == null
                    ? "text-muted-foreground"
                    : delta > 0
                      ? "text-positive"
                      : delta < 0
                        ? "text-negative"
                        : "";
                return (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.l == null ? "—" : fmtEUR(r.l)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.r == null ? "—" : fmtEUR(r.r)}
                    </TableCell>
                    <TableCell className={"text-right tabular-nums " + cls}>
                      {delta == null ? "—" : (delta > 0 ? "+" : "") + fmtEUR(delta)}
                    </TableCell>
                    <TableCell className={"text-right tabular-nums " + cls}>
                      {pct == null
                        ? "—"
                        : new Intl.NumberFormat("pt-PT", {
                            style: "percent",
                            maximumFractionDigits: 2,
                          }).format(pct)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  snapshots,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  snapshots: Snapshot[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Escolha uma ficha" />
        </SelectTrigger>
        <SelectContent>
          {snapshots.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label} · {fmtDate(s.reference_date)} {s.is_effective ? "· EFE" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
