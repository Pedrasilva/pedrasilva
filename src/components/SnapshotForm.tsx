import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { calcIrs, loadBrackets, pickTabela, ESTADOS_CIVIS, LOCALIZACOES } from "@/lib/irs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Save, Trash2, Sparkles, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Props = { snapshot: Snapshot };

const numericKeys = [
  "valor_base", "ss_atelier_pct", "ss_colaborador_pct", "meses_pagos",
  "subsidio_alimentacao_diario", "dias_uteis", "ajudas_custo_anual",
  "beneficio_carro", "beneficio_ticket", "premio_associado", "outros_beneficios",
  "numero_titulares", "numero_dependentes", "dependentes_com_deficiencia", "ano_fiscal",
] as const;

export function SnapshotForm({ snapshot }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Snapshot>(snapshot);

  useEffect(() => setDraft(snapshot), [snapshot]);

  const tabela = pickTabela(draft.estado_civil, draft.numero_titulares);
  const { data: brackets = [] } = useQuery({
    queryKey: ["irs", draft.ano_fiscal, draft.localizacao, tabela],
    queryFn: () => loadBrackets(draft.ano_fiscal, draft.localizacao, tabela),
  });

  const irsAuto = useMemo(
    () => calcIrs(draft.valor_base || 0, brackets, draft.numero_dependentes),
    [draft.valor_base, draft.numero_dependentes, brackets],
  );

  const draftEffective = useMemo<Snapshot>(
    () => (draft.irs_calculado_auto ? { ...draft, irs_pct: irsAuto.irs_pct_efectiva } : draft),
    [draft, irsAuto.irs_pct_efectiva],
  );

  const c = computeSnapshot(draftEffective);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {
        label: draft.label,
        reference_date: draft.reference_date,
        is_effective: draft.is_effective,
        notas: draft.notas,
        localizacao: draft.localizacao,
        estado_civil: draft.estado_civil,
        irs_calculado_auto: draft.irs_calculado_auto,
        irs_pct: draft.irs_calculado_auto ? irsAuto.irs_pct_efectiva :
