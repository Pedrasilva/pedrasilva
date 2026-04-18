import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Building2, User, Briefcase } from "lucide-react";
import { toast } from "sonner";

type Sheet = null | "company" | "contact" | "project";

export function QuickCreateMenu() {
  const [sheet, setSheet] = useState<Sheet>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="ml-1 gap-1.5"
            aria-label="Criar novo"
            title="Criar empresa, contacto ou projecto"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Novo</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Criar novo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSheet("company")} className="gap-2">
            <Building2 className="h-4 w-4" /> Empresa
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("contact")} className="gap-2">
            <User className="h-4 w-4" /> Contacto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("project")} className="gap-2">
            <Briefcase className="h-4 w-4" /> Projecto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CompanyDialog open={sheet === "company"} onClose={() => setSheet(null)} />
      <ContactDialog open={sheet === "contact"} onClose={() => setSheet(null)} />
      <ProjectDialog open={sheet === "project"} onClose={() => setSheet(null)} />
    </>
  );
}

// ─────────────────────────────────────────────
// Validação (zod)
// ─────────────────────────────────────────────
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

const contactSchema = z.object({
  primeiro_nome: z.string().trim().min(1, "Primeiro nome obrigatório").max(100),
  apelido: z.string().trim().max(100).optional().or(z.literal("")),
  titulo: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  telefone: z.string().trim().max(50).optional().or(z.literal("")),
  telemovel: z.string().trim().max(50).optional().or(z.literal("")),
  posicao: z.string().trim().max(100).optional().or(z.literal("")),
  company_id: z.string().uuid().nullable().optional(),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

const projectSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  codigo: z.string().trim().max(50).optional().or(z.literal("")),
  company_id: z.string().uuid().nullable().optional(),
  responsavel_id: z.string().uuid().nullable().optional(),
  data_inicio: z.string().optional().or(z.literal("")),
  data_fim: z.string().optional().or(z.literal("")),
  status: z.enum(["proposta", "em_curso", "pausado", "concluido", "cancelado"]),
  orcamento: z.number().nullable().optional(),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

// ─────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────
function CompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "", website: "", email: "", telefone: "", morada: "",
    status: "activo" as "activo" | "prospecto" | "inactivo",
    industria: "", notas: "",
  });

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
      const { error } = await supabase.from("companies").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa criada");
      qc.invalidateQueries({ queryKey: ["companies"] });
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
          <Field label="Nome *" full>
            <Input className="input-yellow" value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </Field>
          <Field label="Website">
            <Input className="input-yellow" placeholder="https://…" value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input type="email" className="input-yellow" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Telefone">
            <Input className="input-yellow" value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </Field>
          <Field label="Estado">
            <Select value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="prospecto">Prospecto</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Indústria">
            <Input className="input-yellow" placeholder="Construção, retalho…" value={form.industria}
              onChange={(e) => setForm((f) => ({ ...f, industria: e.target.value }))} />
          </Field>
          <Field label="Morada" full>
            <Input className="input-yellow" value={form.morada}
              onChange={(e) => setForm((f) => ({ ...f, morada: e.target.value }))} />
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
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

// ─────────────────────────────────────────────
// Contacto
// ─────────────────────────────────────────────
function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("id, nome").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    enabled: open,
  });

  const [form, setForm] = useState({
    primeiro_nome: "", apelido: "", titulo: "", email: "",
    telefone: "", telemovel: "", posicao: "",
    company_id: "" as string | "",
    notas: "",
  });

  const reset = () => setForm({
    primeiro_nome: "", apelido: "", titulo: "", email: "",
    telefone: "", telemovel: "", posicao: "", company_id: "", notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = contactSchema.parse({
        ...form,
        company_id: form.company_id || null,
      });
      const payload = {
        primeiro_nome: parsed.primeiro_nome,
        apelido: parsed.apelido || null,
        titulo: parsed.titulo || null,
        email: parsed.email || null,
        telefone: parsed.telefone || null,
        telemovel: parsed.telemovel || null,
        posicao: parsed.posicao || null,
        company_id: parsed.company_id ?? null,
        notas: parsed.notas || null,
      };
      const { error } = await supabase.from("contacts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contacto criado");
      qc.invalidateQueries({ queryKey: ["contacts"] });
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
            <User className="h-5 w-5" /> Novo contacto
          </DialogTitle>
          <DialogDescription>Pessoa associada (ou não) a uma empresa.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Título">
            <Select value={form.titulo || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, titulo: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="Sr.">Sr.</SelectItem>
                <SelectItem value="Sra.">Sra.</SelectItem>
                <SelectItem value="Dr.">Dr.</SelectItem>
                <SelectItem value="Dra.">Dra.</SelectItem>
                <SelectItem value="Eng.">Eng.</SelectItem>
                <SelectItem value="Arq.">Arq.</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Primeiro nome *">
            <Input className="input-yellow" value={form.primeiro_nome}
              onChange={(e) => setForm((f) => ({ ...f, primeiro_nome: e.target.value }))} />
          </Field>
          <Field label="Apelido">
            <Input className="input-yellow" value={form.apelido}
              onChange={(e) => setForm((f) => ({ ...f, apelido: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input type="email" className="input-yellow" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Telefone">
            <Input className="input-yellow" value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </Field>
          <Field label="Telemóvel">
            <Input className="input-yellow" value={form.telemovel}
              onChange={(e) => setForm((f) => ({ ...f, telemovel: e.target.value }))} />
          </Field>
          <Field label="Posição" full>
            <Input className="input-yellow" placeholder="Director, gestor de projectos…"
              value={form.posicao}
              onChange={(e) => setForm((f) => ({ ...f, posicao: e.target.value }))} />
          </Field>
          <Field label="Empresa" full>
            <Select value={form.company_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, company_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder="Sem empresa associada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem empresa associada</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.primeiro_nome.trim()}>
            Criar contacto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Projecto
// ─────────────────────────────────────────────
function ProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("id, nome").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    enabled: open,
  });
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators").select("id, nome").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    enabled: open,
  });

  const [form, setForm] = useState({
    nome: "", codigo: "",
    company_id: "" as string | "",
    responsavel_id: "" as string | "",
    data_inicio: "", data_fim: "",
    status: "proposta" as "proposta" | "em_curso" | "pausado" | "concluido" | "cancelado",
    orcamento: "" as string,
    notas: "",
  });

  const reset = () => setForm({
    nome: "", codigo: "", company_id: "", responsavel_id: "",
    data_inicio: "", data_fim: "", status: "proposta",
    orcamento: "", notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = projectSchema.parse({
        ...form,
        company_id: form.company_id || null,
        responsavel_id: form.responsavel_id || null,
        orcamento: form.orcamento ? Number(form.orcamento) : null,
      });
      const payload = {
        nome: parsed.nome,
        codigo: parsed.codigo || null,
        company_id: parsed.company_id ?? null,
        responsavel_id: parsed.responsavel_id ?? null,
        data_inicio: parsed.data_inicio || null,
        data_fim: parsed.data_fim || null,
        status: parsed.status,
        orcamento: parsed.orcamento ?? null,
        notas: parsed.notas || null,
      };
      const { error } = await supabase.from("projects").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projecto criado");
      qc.invalidateQueries({ queryKey: ["projects"] });
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
            <Briefcase className="h-5 w-5" /> Novo projecto
          </DialogTitle>
          <DialogDescription>Cria uma proposta ou projecto em curso.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome *">
            <Input className="input-yellow" value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </Field>
          <Field label="Código">
            <Input className="input-yellow" placeholder="P-2026-001"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
          </Field>
          <Field label="Cliente (empresa)">
            <Select value={form.company_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, company_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={form.responsavel_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, responsavel_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data início">
            <Input type="date" className="input-yellow" value={form.data_inicio}
              onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
          </Field>
          <Field label="Data fim">
            <Input type="date" className="input-yellow" value={form.data_fim}
              onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
          </Field>
          <Field label="Estado">
            <Select value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proposta">Proposta</SelectItem>
                <SelectItem value="em_curso">Em curso</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Orçamento (€)">
            <Input type="number" step="0.01" min={0}
              className="input-yellow tabular-nums" value={form.orcamento}
              onChange={(e) => setForm((f) => ({ ...f, orcamento: e.target.value }))} />
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.nome.trim()}>
            Criar projecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
function Field({
  label, children, full,
}: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-full" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
