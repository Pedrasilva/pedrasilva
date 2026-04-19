import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Save, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { fmtEUR } from "@/lib/salary";

type Rate = {
  id: string;
  ano: number;
  valor_cartao: number;
  valor_dinheiro: number;
  notas: string | null;
};

export const Route = createFileRoute("/_app/subsidio-alimentacao")({
  component: () => (
    <AdminOnly>
      <SubsidioAlimentacaoPage />
    </AdminOnly>
  ),
});

function SubsidioAlimentacaoPage() {
  const qc = useQueryClient();

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["meal-allowance-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_allowance_rates")
        .select("*")
        .order("ano", { ascending: false });
      if (error) throw error;
      return data as Rate[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (r: Partial<Rate> & { ano: number }) => {
      const payload = {
        ano: r.ano,
        valor_cartao: Number(r.valor_cartao) || 0,
        valor_dinheiro: Number(r.valor_dinheiro) || 0,
        notas: r.notas ?? null,
      };
      const { error } = await supabase
        .from("meal_allowance_rates")
        .upsert(payload, { onConflict: "ano" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meal-allowance-rates"] });
      toast.success("Valor guardado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meal_allowance_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meal-allowance-rates"] });
      toast.success("Linha eliminada");
    },
  });

  const proximoAno = (rates[0]?.ano ?? new Date().getFullYear()) + 1;
  const [novoAno, setNovoAno] = useState<number>(proximoAno);
  const [novoCartao, setNovoCartao] = useState<number>(0);
  const [novoDinheiro, setNovoDinheiro] = useState<number>(0);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--sage)_15%,transparent)] text-[var(--sage)]">
          <Utensils className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Subsídio de alimentação</h1>
          <p className="text-sm text-muted-foreground">
            Histórico do valor diário (cartão e dinheiro) por ano. O valor é aplicado automaticamente nas fichas conforme o ano fiscal do colaborador.
          </p>
        </div>
      </div>

      {/* Adicionar novo ano */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar novo ano</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Input
                type="number"
                className="input-yellow text-right tabular-nums"
                value={novoAno}
                onChange={(e) => setNovoAno(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Em cartão (€/dia)</Label>
              <Input
                type="number"
                step="0.01"
                className="input-yellow text-right tabular-nums"
                value={novoCartao}
                onChange={(e) => setNovoCartao(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Em dinheiro (€/dia)</Label>
              <Input
                type="number"
                step="0.01"
                className="input-yellow text-right tabular-nums"
                value={novoDinheiro}
                onChange={(e) => setNovoDinheiro(Number(e.target.value))}
              />
            </div>
            <Button
              onClick={() => {
                if (rates.some((r) => r.ano === novoAno)) {
                  toast.error("Já existe uma entrada para esse ano. Edita na tabela.");
                  return;
                }
                upsert.mutate({
                  ano: novoAno,
                  valor_cartao: novoCartao,
                  valor_dinheiro: novoDinheiro,
                });
                setNovoAno((a) => a + 1);
                setNovoCartao(0);
                setNovoDinheiro(0);
              }}
              disabled={upsert.isPending}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : rates.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem valores definidos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Ano</TableHead>
                  <TableHead>Em cartão (€/dia)</TableHead>
                  <TableHead>Em dinheiro (€/dia)</TableHead>
                  <TableHead className="text-right">Anual (220 dias)</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <RateRow
                    key={r.id}
                    rate={r}
                    onSave={(patch) => upsert.mutate({ ano: r.ano, ...patch })}
                    onDelete={() => remove.mutate(r.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RateRow({
  rate,
  onSave,
  onDelete,
}: {
  rate: Rate;
  onSave: (patch: Partial<Rate>) => void;
  onDelete: () => void;
}) {
  const [cartao, setCartao] = useState(rate.valor_cartao);
  const [dinheiro, setDinheiro] = useState(rate.valor_dinheiro);
  const dirty = cartao !== rate.valor_cartao || dinheiro !== rate.valor_dinheiro;

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">{rate.ano}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          className="input-yellow h-8 text-right tabular-nums"
          value={cartao}
          onChange={(e) => setCartao(Number(e.target.value))}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          className="input-yellow h-8 text-right tabular-nums"
          value={dinheiro}
          onChange={(e) => setDinheiro(Number(e.target.value))}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtEUR(cartao * 220)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={!dirty}
            onClick={() => onSave({ valor_cartao: cartao, valor_dinheiro: dinheiro })}
            title="Guardar"
          >
            <Save className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar {rate.ano}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acção é irreversível. As fichas existentes mantêm os valores guardados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
