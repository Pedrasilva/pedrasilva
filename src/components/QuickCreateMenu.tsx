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
import {
  Plus, Building2, User, Briefcase,
  CheckSquare, Receipt, CalendarDays,
  Clock, Play,
} from "lucide-react";
import { toast } from "sonner";

type Sheet =
  | null
  | "task" | "logTime" | "startTimer"
  | "company" | "contact" | "project"
  | "expense" | "request";

type Variant = "full" | "time" | "icon";

export function QuickCreateMenu({
  variant = "full",
}: {
  variant?: Variant;
} = {}) {
  const [sheet, setSheet] = useState<Sheet>(null);

  const trigger =
    variant === "time" ? (
      <button
        type="button"
        aria-label="Registar tempo"
        title="Registar tempo"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground transition hover:bg-accent"
      >
        <Clock className="h-4 w-4" />
      </button>
    ) : variant === "icon" ? (
      <button
        type="button"
        aria-label="Criar novo"
        title="Criar entrada"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
      </button>
    ) : (
      <Button
        size="sm"
        className="ml-1 gap-1.5"
        aria-label="Criar novo"
        title="Criar entrada"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden md:inline">Novo</span>
      </Button>
    );

  const showTime = variant === "full" || variant === "icon" || variant === "time";
  const showRest = variant === "full" || variant === "icon";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="bg-primary/10 text-primary -mx-1 -mt-1 mb-1 rounded-sm px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
            {variant === "time" ? "Tempo" : "Criar"}
          </DropdownMenuLabel>
          {showTime && (
            <>
              <DropdownMenuItem onClick={() => setSheet("logTime")} className="gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Registar tempo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("startTimer")} className="gap-2">
                <Play className="h-4 w-4 text-muted-foreground" /> Iniciar timer
              </DropdownMenuItem>
            </>
          )}
          {showRest && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSheet("task")} className="gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" /> Tarefa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSheet("company")} className="gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Empresa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("contact")} className="gap-2">
                <User className="h-4 w-4 text-muted-foreground" /> Contacto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("project")} className="gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" /> Projecto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("expense")} className="gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" /> Despesa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSheet("request")} className="gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" /> Pedido (férias/ausência)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <LogTimeDialog open={sheet === "logTime"} onClose={() => setSheet(null)} />
      <StartTimerDialog open={sheet === "startTimer"} onClose={() => setSheet(null)} />
      <TaskDialog open={sheet === "task"} onClose={() => setSheet(null)} />
      <CompanyDialog open={sheet === "company"} onClose={() => setSheet(null)} />
      <ContactDialog open={sheet === "contact"} onClose={() => setSheet(null)} />
      <ProjectDialog open={sheet === "project"} onClose={() => setSheet(null)} />
      <ExpenseDialog open={sheet === "expense"} onClose={() => setSheet(null)} />
      <RequestDialog open={sheet === "request"} onClose={() => setSheet(null)} />
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

// ─────────────────────────────────────────────
// Tarefa (pm_tasks ligada a uma allocation existente)
// ─────────────────────────────────────────────
const taskSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  allocation_id: z.string().uuid("Escolhe uma alocação"),
});

function TaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allocations = [] } = useQuery({
    queryKey: ["allocations-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .select("id, stage_id, resource_id, pm_stages(name, project_id, pm_projects(name)), pm_resources(name)")
        .order("start_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        stage_id: string;
        resource_id: string;
        pm_stages: { name: string; project_id: string; pm_projects: { name: string } | null } | null;
        pm_resources: { name: string } | null;
      }>;
    },
    enabled: open,
  });

  const [form, setForm] = useState({ name: "", allocation_id: "" });
  const reset = () => setForm({ name: "", allocation_id: "" });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = taskSchema.parse(form);
      const { error } = await supabase.from("pm_tasks").insert({
        name: parsed.name,
        allocation_id: parsed.allocation_id,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["pm_tasks"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" /> Nova tarefa
          </DialogTitle>
          <DialogDescription>
            Liga a uma alocação existente (projecto · fase · recurso).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Nome *">
            <Input className="input-yellow" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Alocação *">
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={allocations.length ? "Escolher…" : "Sem alocações disponíveis"} />
              </SelectTrigger>
              <SelectContent>
                {allocations.map((a) => {
                  const proj = a.pm_stages?.pm_projects?.name ?? "—";
                  const stage = a.pm_stages?.name ?? "—";
                  const res = a.pm_resources?.name ?? "—";
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {proj} · {stage} · {res}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim() || !form.allocation_id}>
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Despesa (benefit_expenses do utilizador autenticado)
// ─────────────────────────────────────────────
const expenseSchema = z.object({
  categoria: z.enum(["carro", "ticket", "premio", "outros"]),
  data_despesa: z.string().min(1, "Data obrigatória"),
  valor: z.number().positive("Valor > 0"),
  descricao: z.string().trim().min(1, "Descrição obrigatória").max(500),
  notas_colaborador: z.string().trim().max(2000).optional().or(z.literal("")),
});

function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    categoria: "outros" as "carro" | "ticket" | "premio" | "outros",
    data_despesa: today,
    valor: "" as string,
    descricao: "",
    notas_colaborador: "",
  });

  const reset = () => setForm({
    categoria: "outros", data_despesa: today, valor: "", descricao: "", notas_colaborador: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.parse({
        ...form,
        valor: form.valor ? Number(form.valor) : NaN,
      });
      // Obter o collaborator_id do utilizador actual
      const { data: collabId, error: rpcErr } = await supabase.rpc("get_my_collaborator_id");
      if (rpcErr) throw rpcErr;
      if (!collabId) throw new Error("O teu utilizador não está ligado a nenhum colaborador.");
      const { error } = await supabase.from("benefit_expenses").insert({
        collaborator_id: collabId,
        categoria: parsed.categoria,
        data_despesa: parsed.data_despesa,
        valor: parsed.valor,
        descricao: parsed.descricao,
        notas_colaborador: parsed.notas_colaborador || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa submetida");
      qc.invalidateQueries({ queryKey: ["benefit_expenses"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Nova despesa
          </DialogTitle>
          <DialogDescription>Submete uma despesa para aprovação.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Categoria">
            <Select value={form.categoria}
              onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as typeof form.categoria }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="carro">Carro</SelectItem>
                <SelectItem value="ticket">Ticket</SelectItem>
                <SelectItem value="premio">Prémio</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data *">
            <Input type="date" className="input-yellow" value={form.data_despesa}
              onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))} />
          </Field>
          <Field label="Valor (€) *">
            <Input type="number" step="0.01" min={0}
              className="input-yellow tabular-nums" value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
          </Field>
          <Field label="Descrição *" full>
            <Input className="input-yellow" value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas_colaborador}
              onChange={(e) => setForm((f) => ({ ...f, notas_colaborador: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.descricao.trim() || !form.valor}>
            Submeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Pedido (vacation_requests do utilizador autenticado)
// ─────────────────────────────────────────────
const requestSchema = z.object({
  tipo: z.enum([
    "ferias", "casamento", "falecimento_familiar", "assistencia_filho",
    "nascimento_filho", "trabalhador_estudante", "doacao_sangue",
    "autorizada_paga", "autorizada_nao_paga",
  ]),
  data_inicio: z.string().min(1, "Data início obrigatória"),
  data_fim: z.string().min(1, "Data fim obrigatória"),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    tipo: "ferias" as
      | "ferias" | "casamento" | "falecimento_familiar" | "assistencia_filho"
      | "nascimento_filho" | "trabalhador_estudante" | "doacao_sangue"
      | "autorizada_paga" | "autorizada_nao_paga",
    data_inicio: today, data_fim: today, notas: "",
  });

  const reset = () => setForm({
    tipo: "ferias", data_inicio: today, data_fim: today, notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = requestSchema.parse(form);
      if (parsed.data_fim < parsed.data_inicio) {
        throw new Error("Data fim antes da data início.");
      }
      const { data: collabId, error: rpcErr } = await supabase.rpc("get_my_collaborator_id");
      if (rpcErr) throw rpcErr;
      if (!collabId) throw new Error("O teu utilizador não está ligado a nenhum colaborador.");
      const { error } = await supabase.from("vacation_requests").insert({
        collaborator_id: collabId,
        tipo: parsed.tipo,
        data_inicio: parsed.data_inicio,
        data_fim: parsed.data_fim,
        notas: parsed.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido submetido");
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Novo pedido
          </DialogTitle>
          <DialogDescription>Férias ou outras ausências.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo" full>
            <Select value={form.tipo}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as typeof form.tipo }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ferias">Férias</SelectItem>
                <SelectItem value="casamento">Casamento</SelectItem>
                <SelectItem value="falecimento_familiar">Falecimento familiar</SelectItem>
                <SelectItem value="assistencia_filho">Assistência a filho</SelectItem>
                <SelectItem value="nascimento_filho">Nascimento de filho</SelectItem>
                <SelectItem value="trabalhador_estudante">Trabalhador-estudante</SelectItem>
                <SelectItem value="doacao_sangue">Doação de sangue</SelectItem>
                <SelectItem value="autorizada_paga">Autorizada (paga)</SelectItem>
                <SelectItem value="autorizada_nao_paga">Autorizada (não paga)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Início *">
            <Input type="date" className="input-yellow" value={form.data_inicio}
              onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
          </Field>
          <Field label="Fim *">
            <Input type="date" className="input-yellow" value={form.data_fim}
              onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.data_inicio || !form.data_fim}>
            Submeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Tempo — partilhado: query de alocações + helper para obter task_id
// ─────────────────────────────────────────────
type AllocationLite = {
  id: string;
  pm_stages: { name: string; pm_projects: { name: string } | null } | null;
  pm_resources: { name: string } | null;
};

function useAllocations(open: boolean) {
  return useQuery({
    queryKey: ["allocations-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .select("id, pm_stages(name, pm_projects(name)), pm_resources(name)")
        .order("start_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AllocationLite[];
    },
    enabled: open,
  });
}

async function getTaskIdForAllocation(allocationId: string): Promise<string> {
  const { data, error } = await supabase
    .from("pm_tasks")
    .select("id")
    .eq("allocation_id", allocationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Esta alocação não tem tarefa associada.");
  return data.id;
}

function AllocationOptions({ allocations }: { allocations: AllocationLite[] }) {
  return (
    <>
      {allocations.map((a) => {
        const proj = a.pm_stages?.pm_projects?.name ?? "—";
        const stage = a.pm_stages?.name ?? "—";
        const res = a.pm_resources?.name ?? "—";
        return (
          <SelectItem key={a.id} value={a.id}>
            {proj} · {stage} · {res}
          </SelectItem>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Registar tempo (manual)
// ─────────────────────────────────────────────
const logTimeSchema = z.object({
  allocation_id: z.string().uuid("Escolhe uma alocação"),
  entry_date: z.string().min(1, "Data obrigatória"),
  hours: z.number().positive("Horas > 0").max(24, "Máx 24h"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function LogTimeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allocations = [] } = useAllocations(open);
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    allocation_id: "",
    entry_date: today,
    hours: "" as string,
    notes: "",
  });
  const reset = () => setForm({ allocation_id: "", entry_date: today, hours: "", notes: "" });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = logTimeSchema.parse({
        ...form,
        hours: form.hours ? Number(form.hours) : NaN,
      });
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const taskId = await getTaskIdForAllocation(parsed.allocation_id);
      const { error } = await supabase.from("pm_time_entries").insert({
        task_id: taskId,
        user_id: uid,
        entry_date: parsed.entry_date,
        hours: parsed.hours,
        notes: parsed.notes || null,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tempo registado");
      qc.invalidateQueries({ queryKey: ["pm_time_entries"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Registar tempo
          </DialogTitle>
          <DialogDescription>
            Lança horas numa alocação (projecto · fase · recurso).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Alocação *" full>
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={allocations.length ? "Escolher…" : "Sem alocações disponíveis"} />
              </SelectTrigger>
              <SelectContent>
                <AllocationOptions allocations={allocations} />
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data *">
            <Input type="date" className="input-yellow" value={form.entry_date}
              onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} />
          </Field>
          <Field label="Horas *">
            <Input type="number" step="0.25" min="0" className="input-yellow" value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
          </Field>
          <Field label="Notas" full>
            <Textarea className="input-yellow" rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.allocation_id || !form.hours}>
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Iniciar timer (cria entry com started_at = now, hours = 0)
// ─────────────────────────────────────────────
const startTimerSchema = z.object({
  allocation_id: z.string().uuid("Escolhe uma alocação"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function StartTimerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allocations = [] } = useAllocations(open);

  const [form, setForm] = useState({ allocation_id: "", notes: "" });
  const reset = () => setForm({ allocation_id: "", notes: "" });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = startTimerSchema.parse(form);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const taskId = await getTaskIdForAllocation(parsed.allocation_id);
      const now = new Date();
      const { error } = await supabase.from("pm_time_entries").insert({
        task_id: taskId,
        user_id: uid,
        entry_date: now.toISOString().slice(0, 10),
        hours: 0,
        started_at: now.toISOString(),
        notes: parsed.notes || null,
        source: "timer",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer iniciado");
      qc.invalidateQueries({ queryKey: ["pm_time_entries"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" /> Iniciar timer
          </DialogTitle>
          <DialogDescription>
            Começa a contar tempo agora. Pára-o depois na página de timesheet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Alocação *">
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={allocations.length ? "Escolher…" : "Sem alocações disponíveis"} />
              </SelectTrigger>
              <SelectContent>
                <AllocationOptions allocations={allocations} />
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notas">
            <Textarea className="input-yellow" rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.allocation_id}>
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
