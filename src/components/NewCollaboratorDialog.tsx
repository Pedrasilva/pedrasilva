import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

type ExistingCollab = {
  id: string;
  nome: string;
  email: string | null;
  numero_colaborador: string | null;
  departamento: "Projecto" | "Backoffice";
};

const collaboratorSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .max(255)
    .optional()
    .or(z.literal("")),
  numero_colaborador: z.string().trim().max(50).optional().or(z.literal("")),
  departamento: z.enum(["Projecto", "Backoffice"]),
  situacao_contractual: z.string().trim().max(100).optional().or(z.literal("")),
  inicio_carreira: z.string().optional().or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
});

type Props = {
  /** Custom trigger; defaults to a "Novo colaborador" button. */
  trigger?: React.ReactNode;
  /** Callback invoked with the new collaborator id on success. */
  onCreated?: (id: string) => void;
};

const EMPTY = {
  nome: "",
  email: "",
  numero_colaborador: "",
  departamento: "Projecto" as "Projecto" | "Backoffice",
  situacao_contractual: "Contracto a termo",
  inicio_carreira: "",
  data_nascimento: "",
};

export function NewCollaboratorDialog({ trigger, onCreated }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState("");

  const { data: existing = [] } = useQuery({
    queryKey: ["collaborators-existing-list"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome, email, numero_colaborador, departamento")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ExistingCollab[];
    },
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return existing;
    return existing.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.numero_colaborador ?? "").toLowerCase().includes(q),
    );
  }, [existing, filter]);

  const duplicateEmail = useMemo(() => {
    const email = form.email.trim().toLowerCase();
    if (!email) return null;
    return existing.find((c) => (c.email ?? "").toLowerCase() === email) ?? null;
  }, [existing, form.email]);


  const create = useMutation({
    mutationFn: async () => {
      const parsed = collaboratorSchema.parse(form);
      const payload = {
        nome: parsed.nome,
        email: parsed.email || null,
        numero_colaborador: parsed.numero_colaborador || null,
        departamento: parsed.departamento,
        situacao_contractual: parsed.situacao_contractual || null,
        inicio_carreira: parsed.inicio_carreira || null,
        data_nascimento: parsed.data_nascimento || null,
      };
      const { data, error } = await supabase
        .from("collaborators")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      toast.success("Colaborador criado");
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["collaborators-picker"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setForm(EMPTY);
      setOpen(false);
      onCreated?.(c.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" /> Novo colaborador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo colaborador</DialogTitle>
          <DialogDescription>
            Preencha os dados base. O email deve corresponder ao usado para
            criar conta — assim que o colaborador fizer login, fica ligado à
            ficha automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input
              className="input-yellow"
              value={form.nome}
              onChange={(e) =>
                setForm((f) => ({ ...f, nome: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              className="input-yellow"
              placeholder="nome@psa.pt"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nº colaborador</Label>
            <Input
              className="input-yellow"
              value={form.numero_colaborador}
              onChange={(e) =>
                setForm((f) => ({ ...f, numero_colaborador: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Departamento *</Label>
            <Select
              value={form.departamento}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  departamento: v as "Projecto" | "Backoffice",
                }))
              }
            >
              <SelectTrigger className="input-yellow">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Projecto">Equipa Projecto</SelectItem>
                <SelectItem value="Backoffice">Equipa Backoffice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Situação contractual</Label>
            <Input
              className="input-yellow"
              value={form.situacao_contractual}
              onChange={(e) =>
                setForm((f) => ({ ...f, situacao_contractual: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Início de carreira</Label>
            <Input
              type="date"
              className="input-yellow"
              value={form.inicio_carreira}
              onChange={(e) =>
                setForm((f) => ({ ...f, inicio_carreira: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data de nascimento</Label>
            <Input
              type="date"
              className="input-yellow"
              value={form.data_nascimento}
              onChange={(e) =>
                setForm((f) => ({ ...f, data_nascimento: e.target.value }))
              }
            />
          </div>
          </div>

          <aside className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Já registados ({existing.length})
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            {duplicateEmail && (
              <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                Já existe ficha com este email:{" "}
                <strong>{duplicateEmail.nome}</strong>
              </div>
            )}
            <ScrollArea className="h-[320px] pr-2">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {existing.length === 0
                    ? "Sem colaboradores."
                    : "Nenhum resultado."}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{c.nome}</span>
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {c.departamento === "Backoffice" ? "BO" : "Proj"}
                        </Badge>
                      </div>
                      {(c.email || c.numero_colaborador) && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {c.numero_colaborador && (
                            <>#{c.numero_colaborador} · </>
                          )}
                          {c.email ?? "sem email"}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </aside>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.nome.trim()}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
