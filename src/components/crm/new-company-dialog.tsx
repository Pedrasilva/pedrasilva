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
import { Building2, User, Tag } from "lucide-react";
import { toast } from "sonner";

const companySchema = z.object({
  // Company details
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  status: z.enum(["activo", "prospecto", "inactivo"]),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  telefone: z.string().trim().max(50).optional().or(z.literal("")),
  morada: z.string().trim().max(500).optional().or(z.literal("")),
  nif: z.string().trim().max(50).optional().or(z.literal("")),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
  // Classification
  industria: z.string().trim().max(100).optional().or(z.literal("")),
  company_type: z.string().trim().max(50).optional().or(z.literal("")),
  // Primary contact (all optional; if any name is provided we'll create one)
  contact_titulo: z.string().trim().max(20).optional().or(z.literal("")),
  contact_primeiro_nome: z.string().trim().max(100).optional().or(z.literal("")),
  contact_apelido: z.string().trim().max(100).optional().or(z.literal("")),
  contact_email: z.string().trim().email("Email do contacto inválido").max(255).optional().or(z.literal("")),
  contact_telefone: z.string().trim().max(50).optional().or(z.literal("")),
  contact_telemovel: z.string().trim().max(50).optional().or(z.literal("")),
  contact_posicao: z.string().trim().max(100).optional().or(z.literal("")),
  contact_notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

type CompanyStatus = "activo" | "prospecto" | "inactivo";

const COMPANY_TYPES = [
  { value: "cliente", label: "Cliente" },
  { value: "fornecedor", label: "Fornecedor" },
  { value: "parceiro", label: "Parceiro" },
  { value: "prospecto", label: "Prospecto" },
  { value: "outro", label: "Outro" },
];

const INITIAL_FORM = {
  nome: "",
  status: "activo" as CompanyStatus,
  website: "",
  email: "",
  telefone: "",
  morada: "",
  nif: "",
  notas: "",
  industria: "",
  company_type: "",
  contact_titulo: "",
  contact_primeiro_nome: "",
  contact_apelido: "",
  contact_email: "",
  contact_telefone: "",
  contact_telemovel: "",
  contact_posicao: "",
  contact_notas: "",
};

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
  const [form, setForm] = useState({ ...INITIAL_FORM, nome: defaultName ?? "" });

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, nome: defaultName ?? f.nome }));
    }
  }, [open, defaultName]);

  const reset = () => setForm({ ...INITIAL_FORM });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: async () => {
      const parsed = companySchema.parse(form);

      // 1) Create company
      const companyPayload = {
        nome: parsed.nome,
        status: parsed.status,
        website: parsed.website || null,
        email: parsed.email || null,
        telefone: parsed.telefone || null,
        morada: parsed.morada || null,
        nif: parsed.nif || null,
        notas: parsed.notas || null,
        industria: parsed.industria || null,
        company_type: parsed.company_type || null,
      };
      const { data: companyRow, error: companyErr } = await supabase
        .from("companies")
        .insert(companyPayload)
        .select("id")
        .single();
      if (companyErr) throw companyErr;
      const companyId = companyRow.id as string;

      // 2) Create primary contact if any meaningful field provided
      const hasContact =
        parsed.contact_primeiro_nome ||
        parsed.contact_apelido ||
        parsed.contact_email ||
        parsed.contact_telefone ||
        parsed.contact_telemovel;

      if (hasContact) {
        const contactPayload = {
          company_id: companyId,
          titulo: parsed.contact_titulo || null,
          primeiro_nome: parsed.contact_primeiro_nome || "—",
          apelido: parsed.contact_apelido || null,
          email: parsed.contact_email || null,
          telefone: parsed.contact_telefone || null,
          telemovel: parsed.contact_telemovel || null,
          posicao: parsed.contact_posicao || null,
          notas: parsed.contact_notas || null,
        };
        const { error: contactErr } = await supabase
          .from("contacts")
          .insert(contactPayload);
        if (contactErr) throw contactErr;
      }

      return companyId;
    },
    onSuccess: (companyId) => {
      toast.success("Empresa criada");
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-lite"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["company-contacts", companyId] });
      onCreated?.(companyId);
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nova empresa
          </DialogTitle>
          <DialogDescription>
            Crie uma empresa com o seu contacto principal e classificação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Company details */}
          <Section title="Detalhes da empresa" icon={<Building2 className="h-4 w-4" />}>
            <FieldRow label="Nome *" full>
              <Input className="input-yellow" value={form.nome}
                onChange={(e) => set("nome", e.target.value)} />
            </FieldRow>
            <FieldRow label="Estado">
              <Select value={form.status}
                onValueChange={(v) => set("status", v as CompanyStatus)}>
                <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="prospecto">Prospecto</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="NIF / Tax ID">
              <Input className="input-yellow" value={form.nif}
                onChange={(e) => set("nif", e.target.value)} />
            </FieldRow>
            <FieldRow label="Website">
              <Input className="input-yellow" placeholder="https://…" value={form.website}
                onChange={(e) => set("website", e.target.value)} />
            </FieldRow>
            <FieldRow label="Telefone">
              <Input className="input-yellow" value={form.telefone}
                onChange={(e) => set("telefone", e.target.value)} />
            </FieldRow>
            <FieldRow label="Email">
              <Input type="email" className="input-yellow" value={form.email}
                onChange={(e) => set("email", e.target.value)} />
            </FieldRow>
            <FieldRow label="Morada" full>
              <Input className="input-yellow" value={form.morada}
                onChange={(e) => set("morada", e.target.value)} />
            </FieldRow>
            <FieldRow label="Notas" full>
              <Textarea className="input-yellow" rows={2} value={form.notas}
                onChange={(e) => set("notas", e.target.value)} />
            </FieldRow>
          </Section>

          {/* Section 2: Primary contact */}
          <Section
            title="Contacto principal"
            icon={<User className="h-4 w-4" />}
            hint="Opcional — preencha para criar um contacto associado à empresa."
          >
            <FieldRow label="Título">
              <Input className="input-yellow" placeholder="Sr., Sra., Dr…" value={form.contact_titulo}
                onChange={(e) => set("contact_titulo", e.target.value)} />
            </FieldRow>
            <FieldRow label="Posição / Função">
              <Input className="input-yellow" value={form.contact_posicao}
                onChange={(e) => set("contact_posicao", e.target.value)} />
            </FieldRow>
            <FieldRow label="Primeiro nome">
              <Input className="input-yellow" value={form.contact_primeiro_nome}
                onChange={(e) => set("contact_primeiro_nome", e.target.value)} />
            </FieldRow>
            <FieldRow label="Apelido">
              <Input className="input-yellow" value={form.contact_apelido}
                onChange={(e) => set("contact_apelido", e.target.value)} />
            </FieldRow>
            <FieldRow label="Email">
              <Input type="email" className="input-yellow" value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)} />
            </FieldRow>
            <FieldRow label="Telefone">
              <Input className="input-yellow" value={form.contact_telefone}
                onChange={(e) => set("contact_telefone", e.target.value)} />
            </FieldRow>
            <FieldRow label="Telemóvel">
              <Input className="input-yellow" value={form.contact_telemovel}
                onChange={(e) => set("contact_telemovel", e.target.value)} />
            </FieldRow>
            <FieldRow label="Notas" full>
              <Textarea className="input-yellow" rows={2} value={form.contact_notas}
                onChange={(e) => set("contact_notas", e.target.value)} />
            </FieldRow>
          </Section>

          {/* Section 3: Classification */}
          <Section title="Classificação" icon={<Tag className="h-4 w-4" />}>
            <FieldRow label="Indústria">
              <Input className="input-yellow" placeholder="Construção, retalho…" value={form.industria}
                onChange={(e) => set("industria", e.target.value)} />
            </FieldRow>
            <FieldRow label="Tipo de empresa">
              <Select
                value={form.company_type || "__none__"}
                onValueChange={(v) => set("company_type", v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="input-yellow"><SelectValue placeholder="Seleccione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {COMPANY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </Section>
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

function Section({
  title, icon, hint, children,
}: { title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
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
