import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Phone, Mail, Calendar, StickyNote, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ACTIVITY_TYPES, type CrmActivity, type CrmActivityType } from "@/lib/crm/types";

type Props = {
  companyId?: string | null;
  contactId?: string | null;
  proposalId?: string | null;
};

const ICONS: Record<CrmActivityType, React.ComponentType<{ className?: string }>> = {
  chamada: Phone,
  email: Mail,
  reuniao: Calendar,
  nota: StickyNote,
  outro: MoreHorizontal,
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ActivityTimeline({ companyId, contactId, proposalId }: Props) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<CrmActivityType>("nota");
  const [resumo, setResumo] = useState("");
  const [detalhes, setDetalhes] = useState("");

  const queryKey = ["crm-activities", { companyId, contactId, proposalId }];

  const { data: activities = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("crm_activities").select("*").order("data_actividade", { ascending: false });
      if (companyId) q = q.eq("company_id", companyId);
      if (contactId) q = q.eq("contact_id", contactId);
      if (proposalId) q = q.eq("proposal_id", proposalId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmActivity[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!resumo.trim()) throw new Error("Resumo obrigatório");
      const { error } = await supabase.from("crm_activities").insert({
        tipo,
        resumo: resumo.trim(),
        detalhes: detalhes.trim() || null,
        company_id: companyId ?? null,
        contact_id: contactId ?? null,
        proposal_id: proposalId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Actividade registada");
      setResumo("");
      setDetalhes("");
      setTipo("nota");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Actividade removida");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as CrmActivityType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Resumo</Label>
            <Input
              placeholder="Ex: Chamada com cliente sobre orçamento"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Detalhes (opcional)</Label>
          <Textarea
            rows={2}
            placeholder="Notas adicionais…"
            value={detalhes}
            onChange={(e) => setDetalhes(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !resumo.trim()}>
            Registar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}
        {!isLoading && activities.length === 0 && (
          <p className="text-xs text-muted-foreground">Ainda sem actividades.</p>
        )}
        {activities.map((a) => {
          const Icon = ICONS[a.tipo];
          return (
            <div key={a.id} className="flex gap-3 rounded-md border p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{a.resumo}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {a.tipo} · {formatDateTime(a.data_actividade)}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(a.id)}
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {a.detalhes && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{a.detalhes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
