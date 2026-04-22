import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const companySchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  telefone: z.string().trim().max(50).optional().or(z.literal("")),
  morada: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["activo", "prospecto", "inactivo"]),
  industria: z.string().trim().max(100).optional().or(z.literal("")),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

type CompanyStatus = "activo" | "prospecto" | "inactivo";

export interface NewCompanyDialogProps {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
  onCreated?: (companyId: string) => void;
}

export function NewCompanyDialog({
  open, onClose, defaultName, onCreated,
}: NewCompanyDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: defaultName ?? "",
    website: "", email: "", telefone: "", morada: "",
    status: "activo" as CompanyStatus,
    industria: "", notas: "",
  });

  // Sync defaultName when dialog reopens with a different prefilled name
  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, nome: defaultName ?? f.nome }));
    }
  }, [open, defaultName]);

  const reset = () => setForm({
    nome: "", website: "", email: "", telefone: "", morada: "",
    status: "activo", industria: "", notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = companySchema.parse(form);
      const payload = {
        nome: parsed.nome,
        website: parsed.website || null,
        email: parsed.email || null,
        telefone: parsed.telefone || null,
        morada: parsed.morada || null,
        status: parsed.status,
        industria: parsed.industria || null,
        notas: parsed.notas || null,
      };
      const { data, error } = await supabase
        .from("companies")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (companyId) => {
      toast.success("Empresa criada");
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-lite"] });
      onCreated?.(companyId);
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nova empresa
          </DialogTitle>
          <DialogDescription>Adicione um cliente, fornecedor ou prospecto.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow label="Nome *" full>
            <Input className="input-yellow" value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Website">
            <Input className="input-yellow" placeholder="https://…" value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Email">
            <Input type="email" className="input-yellow" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Telefone">
            <Input className="input-yellow" value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Estado">
            <Select value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as CompanyStatus }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="prospecto">Prospecto</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Indústria">
            <Input className="input-yellow" placeholder="Construção, retalho…" value={form.industria}
              onChange={(e) => setForm((f) => ({ ...f, industria: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Morada" full>
            <Input className="input-yellow" value={form.morada}
              onChange={(e) => setForm((f) => ({ ...f, morada: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.nome.trim()}>
            Criar empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  label, children, full,
}: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-full" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
