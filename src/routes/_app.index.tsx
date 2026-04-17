import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ChevronRight, Briefcase, Building2 } from "lucide-react";
import { toast } from "sonner";
import type { Collaborator } from "@/lib/salary";

export const Route = createFileRoute("/_app/")({
  component: ListPage,
});

function ListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    numero_colaborador: "",
    departamento: "Projecto" as "Projecto" | "Backoffice",
    situacao_contractual: "Contracto a termo",
    inicio_carreira: "",
    data_nascimento: "",
  });

  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data as Collaborator[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome obrigatório");
      const payload = {
        nome: form.nome.trim(),
        numero_colaborador: form.numero_colaborador || null,
        departamento: form.departamento,
        situacao_contractual: form.situacao_contractual || null,
        inicio_carreira: form.inicio_carreira || null,
        data_nascimento: form.data_nascimento || null,
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
      setOpen(false);
      navigate({ to: "/colaborador/$id", params: { id: c.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projecto = collaborators.filter((c) => c.departamento === "Projecto");
  const backoffice = collaborators.filter((c) => c.departamento === "Backoffice");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Cada colaborador tem uma ficha com fichas salariais por data.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Novo colaborador
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo colaborador</DialogTitle>
              <DialogDescription>
                Preencha os dados base. Pode editar tudo na ficha do colaborador.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  className="input-yellow"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
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
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">A carregar…</div>
      ) : collaborators.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Sem colaboradores ainda. Crie o primeiro acima.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <DepartmentSection
            title="Equipa Projecto"
            icon={<Briefcase className="h-4 w-4" />}
            list={projecto}
          />
          <DepartmentSection
            title="Equipa Backoffice"
            icon={<Building2 className="h-4 w-4" />}
            list={backoffice}
          />
        </div>
      )}
    </div>
  );
}

function DepartmentSection({
  title,
  icon,
  list,
}: {
  title: string;
  icon: React.ReactNode;
  list: Collaborator[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon} {title}
          </CardTitle>
          <CardDescription>{list.length} colaborador(es)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {list.length === 0 ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">Sem colaboradores.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link to="/colaborador/$id" params={{ id: c.id }}>
                      {c.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.numero_colaborador || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.situacao_contractual || "—"}
                  </TableCell>
                  <TableCell>
                    <Link to="/colaborador/$id" params={{ id: c.id }}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
