import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  Clock, Play, Package, Wallet, Target, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { NewCompanyDialog } from "@/components/crm/new-company-dialog";
import { CompanyPicker } from "@/components/crm/company-picker";
import { NewOpportunityDialog } from "@/routes/_app.crm.opportunities";
import {
  QuickExpenseDialog,
  QuickMaterialDialog,
} from "@/components/quick-finance-dialogs";

type Sheet =
  | null
  | "task" | "logTime" | "startTimer"
  | "company" | "contact" | "project"
  | "expense" | "request"
  | "projectExpense" | "material"
  | "sale" | "quote";

export function QuickCreateMenu() {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<Sheet>(null);

  return (
    <>
      {/* Time button (clock) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="ml-1 h-9 w-9"
            aria-label={t("projects:quickCreate.registerTimeAria")}
            title={t("projects:quickCreate.time")}
          >
            <Clock className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="bg-primary/10 text-primary -mx-1 -mt-1 mb-1 rounded-sm px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
            {t("projects:quickCreate.time")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("logTime")} className="gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.registerTime")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("startTimer")} className="gap-2">
            <Play className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.startTimer")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create button (+) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="default"
            className="ml-1 h-9 w-9"
            aria-label={t("projects:quickCreate.createNewAria")}
            title={t("projects:quickCreate.createNew")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="bg-primary/10 text-primary -mx-1 -mt-1 mb-1 rounded-sm px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
            {t("projects:quickCreate.create")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("task")} className="gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" /> {t("glossary:entity.task")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("projects:quickCreate.groups.finance")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("projectExpense")} className="gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.projectExpense")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("material")} className="gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.material")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("projects:quickCreate.groups.crm")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("company")} className="gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" /> {t("glossary:entity.company")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("contact")} className="gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> {t("glossary:entity.contact")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("project")} className="gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" /> {t("glossary:entity.project")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("projects:quickCreate.groups.personal")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSheet("expense")} className="gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.benefitExpense")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSheet("request")} className="gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> {t("projects:quickCreate.request")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogTimeDialog open={sheet === "logTime"} onClose={() => setSheet(null)} />
      <StartTimerDialog open={sheet === "startTimer"} onClose={() => setSheet(null)} />
      <TaskDialog open={sheet === "task"} onClose={() => setSheet(null)} />
      <NewCompanyDialog open={sheet === "company"} onClose={() => setSheet(null)} />
      <ContactDialog open={sheet === "contact"} onClose={() => setSheet(null)} />
      <ProjectDialog open={sheet === "project"} onClose={() => setSheet(null)} />
      <ExpenseDialog open={sheet === "expense"} onClose={() => setSheet(null)} />
      <RequestDialog open={sheet === "request"} onClose={() => setSheet(null)} />
      <QuickExpenseDialog open={sheet === "projectExpense"} onClose={() => setSheet(null)} />
      <QuickMaterialDialog open={sheet === "material"} onClose={() => setSheet(null)} />
    </>
  );
}

// ─────────────────────────────────────────────
// Validation (zod) — company moved to new-company-dialog.tsx
// ─────────────────────────────────────────────
const contactSchema = z.object({
  primeiro_nome: z.string().trim().min(1).max(100),
  apelido: z.string().trim().max(100).optional().or(z.literal("")),
  titulo: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  telefone: z.string().trim().max(50).optional().or(z.literal("")),
  telemovel: z.string().trim().max(50).optional().or(z.literal("")),
  posicao: z.string().trim().max(100).optional().or(z.literal("")),
  company_id: z.string().uuid().nullable().optional(),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

const projectSchema = z.object({
  nome: z.string().trim().min(1).max(200),
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
// Contact
// ─────────────────────────────────────────────
function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

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
      toast.success(t("projects:quickCreate.toasts.contactCreated"));
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
            <User className="h-5 w-5" /> {t("projects:quickCreate.newContact")}
          </DialogTitle>
          <DialogDescription>{t("projects:quickCreate.newContactDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("projects:quickCreate.fields.title")}>
            <Select value={form.titulo || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, titulo: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={t("projects:quickCreate.fields.noneOption")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("projects:quickCreate.fields.noneOption")}</SelectItem>
                <SelectItem value="Sr.">Sr.</SelectItem>
                <SelectItem value="Sra.">Sra.</SelectItem>
                <SelectItem value="Dr.">Dr.</SelectItem>
                <SelectItem value="Dra.">Dra.</SelectItem>
                <SelectItem value="Eng.">Eng.</SelectItem>
                <SelectItem value="Arq.">Arq.</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.firstName")}>
            <Input className="input-yellow" value={form.primeiro_nome}
              onChange={(e) => setForm((f) => ({ ...f, primeiro_nome: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.lastName")}>
            <Input className="input-yellow" value={form.apelido}
              onChange={(e) => setForm((f) => ({ ...f, apelido: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.email")}>
            <Input type="email" className="input-yellow" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.phone")}>
            <Input className="input-yellow" value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.mobile")}>
            <Input className="input-yellow" value={form.telemovel}
              onChange={(e) => setForm((f) => ({ ...f, telemovel: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.position")} full>
            <Input
              className="input-yellow"
              placeholder={t("projects:quickCreate.fields.positionPlaceholder")}
              value={form.posicao}
              onChange={(e) => setForm((f) => ({ ...f, posicao: e.target.value }))}
            />
          </Field>
          <Field label={t("glossary:entity.company")} full>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder={t("projects:quickCreate.fields.noCompany")}
            />
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")} full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.primeiro_nome.trim()}>
            {t("projects:quickCreate.actions.createContact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Project
// ─────────────────────────────────────────────
export function ProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators_directory")
        .select("id, nome")
        .is("archived_at", null)
        .order("nome");
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
      // Map legacy quick-create form to pm_projects (the canonical Projects
      // module table). Fields without a direct equivalent (responsavel_id,
      // data_fim, orcamento, codigo) are folded into notes so they aren't lost.
      const statusMap: Record<typeof parsed.status, "active" | "paused" | "archived"> = {
        proposta: "active",
        em_curso: "active",
        pausado: "paused",
        concluido: "archived",
        cancelado: "archived",
      };
      const extraNotes = [
        parsed.codigo ? `Code: ${parsed.codigo}` : null,
        parsed.data_fim ? `End date: ${parsed.data_fim}` : null,
        parsed.orcamento != null ? `Budget: ${parsed.orcamento}` : null,
        parsed.responsavel_id ? `Owner: ${parsed.responsavel_id}` : null,
        parsed.notas || null,
      ].filter(Boolean).join("\n");
      const payload = {
        name: parsed.nome,
        company_id: parsed.company_id ?? null,
        start_date: parsed.data_inicio || new Date().toISOString().slice(0, 10),
        status: statusMap[parsed.status],
        external_id: parsed.codigo || null,
        notes: extraNotes || null,
      };
      const { error } = await supabase.from("pm_projects").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("projects:quickCreate.toasts.projectCreated"));
      qc.invalidateQueries({ queryKey: ["pm-projects"] });
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
            <Briefcase className="h-5 w-5" /> {t("projects:quickCreate.newProject")}
          </DialogTitle>
          <DialogDescription>{t("projects:quickCreate.newProjectDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("projects:quickCreate.fields.name")}>
            <Input className="input-yellow" value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.code")}>
            <Input className="input-yellow" placeholder="P-2026-001"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
          </Field>
          <Field label={t("glossary:entity.company")}>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder={t("projects:quickCreate.fields.noneOption")}
            />
          </Field>
          <Field label={t("projects:quickCreate.fields.owner")}>
            <Select value={form.responsavel_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, responsavel_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={t("projects:quickCreate.fields.noneOption")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("projects:quickCreate.fields.noneOption")}</SelectItem>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.startDate")}>
            <Input type="date" className="input-yellow" value={form.data_inicio}
              onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.endDate")}>
            <Input type="date" className="input-yellow" value={form.data_fim}
              onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.status")}>
            <Select value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proposta">{t("projects:status.proposta")}</SelectItem>
                <SelectItem value="em_curso">{t("projects:status.em_curso")}</SelectItem>
                <SelectItem value="pausado">{t("projects:status.pausado")}</SelectItem>
                <SelectItem value="concluido">{t("projects:status.concluido")}</SelectItem>
                <SelectItem value="cancelado">{t("projects:status.cancelado")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.budget")}>
            <Input type="number" step="0.01" min={0}
              className="input-yellow tabular-nums" value={form.orcamento}
              onChange={(e) => setForm((f) => ({ ...f, orcamento: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")} full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.nome.trim()}>
            {t("projects:quickCreate.actions.createProject")}
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
// Task (pm_tasks linked to an existing allocation)
// ─────────────────────────────────────────────
const taskSchema = z.object({
  name: z.string().trim().min(1).max(200),
  allocation_id: z.string().uuid(),
});

export function TaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
      toast.success(t("projects:quickCreate.toasts.taskCreated"));
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
            <CheckSquare className="h-5 w-5" /> {t("projects:quickCreate.newTask")}
          </DialogTitle>
          <DialogDescription>
            {t("projects:quickCreate.newTaskDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <Field label={t("projects:quickCreate.fields.name")}>
            <Input className="input-yellow" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.allocation")}>
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={
                  allocations.length
                    ? t("projects:quickCreate.fields.allocationPlaceholderPick")
                    : t("projects:quickCreate.fields.allocationPlaceholderEmpty")
                } />
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
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim() || !form.allocation_id}>
            {t("projects:quickCreate.actions.createTask")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Expense (benefit_expenses for the authenticated user)
// ─────────────────────────────────────────────
const expenseSchema = z.object({
  categoria: z.enum(["carro", "ticket", "premio", "outros"]),
  data_despesa: z.string().min(1),
  valor: z.number().positive(),
  descricao: z.string().trim().min(1).max(500),
  notas_colaborador: z.string().trim().max(2000).optional().or(z.literal("")),
});

export function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
      const { data: collabId, error: rpcErr } = await supabase.rpc("get_my_collaborator_id");
      if (rpcErr) throw rpcErr;
      if (!collabId) throw new Error(t("projects:quickCreate.errors.userNotLinked"));
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
      toast.success(t("projects:quickCreate.toasts.expenseSubmitted"));
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
            <Receipt className="h-5 w-5" /> {t("projects:quickCreate.newExpense")}
          </DialogTitle>
          <DialogDescription>{t("projects:quickCreate.newExpenseDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("projects:quickCreate.fields.category")}>
            <Select value={form.categoria}
              onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as typeof form.categoria }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="carro">{t("projects:quickCreate.expenseCategories.carro")}</SelectItem>
                <SelectItem value="ticket">{t("projects:quickCreate.expenseCategories.ticket")}</SelectItem>
                <SelectItem value="premio">{t("projects:quickCreate.expenseCategories.premio")}</SelectItem>
                <SelectItem value="outros">{t("projects:quickCreate.expenseCategories.outros")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.date")}>
            <Input type="date" className="input-yellow" value={form.data_despesa}
              onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.amount")}>
            <Input type="number" step="0.01" min={0}
              className="input-yellow tabular-nums" value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.description")} full>
            <Input className="input-yellow" value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")} full>
            <Textarea className="input-yellow" rows={3} value={form.notas_colaborador}
              onChange={(e) => setForm((f) => ({ ...f, notas_colaborador: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.descricao.trim() || !form.valor}>
            {t("projects:quickCreate.actions.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Request (vacation_requests for the authenticated user)
// ─────────────────────────────────────────────
const requestSchema = z.object({
  tipo: z.enum([
    "ferias", "casamento", "falecimento_familiar", "assistencia_filho",
    "nascimento_filho", "trabalhador_estudante", "doacao_sangue",
    "autorizada_paga", "autorizada_nao_paga",
  ]),
  data_inicio: z.string().min(1),
  data_fim: z.string().min(1),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
        throw new Error(t("projects:quickCreate.errors.endBeforeStart"));
      }
      const { data: collabId, error: rpcErr } = await supabase.rpc("get_my_collaborator_id");
      if (rpcErr) throw rpcErr;
      if (!collabId) throw new Error(t("projects:quickCreate.errors.userNotLinked"));
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
      toast.success(t("projects:quickCreate.toasts.requestSubmitted"));
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
            <CalendarDays className="h-5 w-5" /> {t("projects:quickCreate.newRequest")}
          </DialogTitle>
          <DialogDescription>{t("projects:quickCreate.newRequestDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("projects:quickCreate.fields.type")} full>
            <Select value={form.tipo}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as typeof form.tipo }))}>
              <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ferias">{t("projects:quickCreate.leaveType.ferias")}</SelectItem>
                <SelectItem value="casamento">{t("projects:quickCreate.leaveType.casamento")}</SelectItem>
                <SelectItem value="falecimento_familiar">{t("projects:quickCreate.leaveType.falecimento_familiar")}</SelectItem>
                <SelectItem value="assistencia_filho">{t("projects:quickCreate.leaveType.assistencia_filho")}</SelectItem>
                <SelectItem value="nascimento_filho">{t("projects:quickCreate.leaveType.nascimento_filho")}</SelectItem>
                <SelectItem value="trabalhador_estudante">{t("projects:quickCreate.leaveType.trabalhador_estudante")}</SelectItem>
                <SelectItem value="doacao_sangue">{t("projects:quickCreate.leaveType.doacao_sangue")}</SelectItem>
                <SelectItem value="autorizada_paga">{t("projects:quickCreate.leaveType.autorizada_paga")}</SelectItem>
                <SelectItem value="autorizada_nao_paga">{t("projects:quickCreate.leaveType.autorizada_nao_paga")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.start")}>
            <Input type="date" className="input-yellow" value={form.data_inicio}
              onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.end")}>
            <Input type="date" className="input-yellow" value={form.data_fim}
              onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")} full>
            <Textarea className="input-yellow" rows={3} value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.data_inicio || !form.data_fim}>
            {t("projects:quickCreate.actions.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Time — shared: allocations query + helper to get task_id
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

async function getTaskIdForAllocation(allocationId: string, errorMsg: string): Promise<string> {
  const { data, error } = await supabase
    .from("pm_tasks")
    .select("id")
    .eq("allocation_id", allocationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(errorMsg);
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
// Log time (manual)
// ─────────────────────────────────────────────
const logTimeSchema = z.object({
  allocation_id: z.string().uuid(),
  entry_date: z.string().min(1),
  hours: z.number().positive().max(24),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export function LogTimeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
      if (!uid) throw new Error(t("projects:quickCreate.errors.sessionExpired"));
      const taskId = await getTaskIdForAllocation(
        parsed.allocation_id,
        t("projects:quickCreate.errors.noTaskForAllocation"),
      );
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
      toast.success(t("projects:quickCreate.toasts.timeLogged"));
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
            <Clock className="h-5 w-5" /> {t("projects:quickCreate.logTimeTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("projects:quickCreate.logTimeDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("projects:quickCreate.fields.allocation")} full>
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={
                  allocations.length
                    ? t("projects:quickCreate.fields.allocationPlaceholderPick")
                    : t("projects:quickCreate.fields.allocationPlaceholderEmpty")
                } />
              </SelectTrigger>
              <SelectContent>
                <AllocationOptions allocations={allocations} />
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.date")}>
            <Input type="date" className="input-yellow" value={form.entry_date}
              onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.hours")}>
            <Input type="number" step="0.25" min="0" className="input-yellow" value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")} full>
            <Textarea className="input-yellow" rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.allocation_id || !form.hours}>
            {t("projects:quickCreate.actions.logTime")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Start timer (creates entry with started_at = now, hours = 0)
// ─────────────────────────────────────────────
const startTimerSchema = z.object({
  allocation_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export function StartTimerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
      if (!uid) throw new Error(t("projects:quickCreate.errors.sessionExpired"));
      const taskId = await getTaskIdForAllocation(
        parsed.allocation_id,
        t("projects:quickCreate.errors.noTaskForAllocation"),
      );
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
      toast.success(t("projects:quickCreate.toasts.timerStarted"));
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
            <Play className="h-5 w-5" /> {t("projects:quickCreate.startTimerTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("projects:quickCreate.startTimerDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <Field label={t("projects:quickCreate.fields.allocation")}>
            <Select value={form.allocation_id || ""}
              onValueChange={(v) => setForm((f) => ({ ...f, allocation_id: v }))}>
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={
                  allocations.length
                    ? t("projects:quickCreate.fields.allocationPlaceholderPick")
                    : t("projects:quickCreate.fields.allocationPlaceholderEmpty")
                } />
              </SelectTrigger>
              <SelectContent>
                <AllocationOptions allocations={allocations} />
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("projects:quickCreate.fields.notes")}>
            <Textarea className="input-yellow" rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("projects:quickCreate.actions.cancel")}</Button>
          <Button onClick={() => create.mutate()}
            disabled={create.isPending || !form.allocation_id}>
            {t("projects:quickCreate.actions.startTimer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
