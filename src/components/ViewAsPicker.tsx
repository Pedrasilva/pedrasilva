import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Eye, EyeOff, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CollabRow = { id: string; nome: string; email: string | null; numero_colaborador: string | null };

/**
 * Botão admin para activar/desactivar "modo colaborador" e escolher
 * que colaborador impersonar. Quando activo, /minha-ficha mostra a
 * ficha desse colaborador.
 */
export function ViewAsPicker({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const navigate = useNavigate();
  const {
    isRealAdmin,
    viewAsUser,
    setViewAsUser,
    viewAsCollaboratorId,
    setViewAsCollaboratorId,
  } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-picker"],
    enabled: isRealAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome, email, numero_colaborador")
        .is("archived_at", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CollabRow[];
    },
  });

  const selected = useMemo(
    () => collaborators.find((c) => c.id === viewAsCollaboratorId) ?? null,
    [collaborators, viewAsCollaboratorId],
  );

  if (!isRealAdmin) return null;

  const handlePick = (id: string) => {
    setViewAsUser(true);
    setViewAsCollaboratorId(id);
    setOpen(false);
    navigate({ to: "/hr/minha-ficha" });
  };

  const handleExit = () => {
    setViewAsUser(false);
    setViewAsCollaboratorId(null);
    setOpen(false);
  };

  if (variant === "mobile") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
            {viewAsUser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {viewAsUser
              ? selected
                ? `A ver como ${selected.nome}`
                : "Sair da vista colaborador"
              : "Ver como colaborador…"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0">
          <PickerBody
            collaborators={collaborators}
            selectedId={viewAsCollaboratorId}
            onPick={handlePick}
            onExit={handleExit}
            viewAsUser={viewAsUser}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={viewAsUser ? "default" : "ghost"}
          size="sm"
          className="hidden md:inline-flex gap-2"
          title={
            viewAsUser
              ? "A ver como colaborador. Clique para escolher outro ou sair."
              : "Pré-visualizar a app como um colaborador"
          }
        >
          {viewAsUser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="max-w-[140px] truncate">
            {viewAsUser ? (selected?.nome ?? "Modo colaborador") : "Ver como…"}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        <PickerBody
          collaborators={collaborators}
          selectedId={viewAsCollaboratorId}
          onPick={handlePick}
          onExit={handleExit}
          viewAsUser={viewAsUser}
        />
      </PopoverContent>
    </Popover>
  );
}

function PickerBody({
  collaborators,
  selectedId,
  onPick,
  onExit,
  viewAsUser,
}: {
  collaborators: CollabRow[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onExit: () => void;
  viewAsUser: boolean;
}) {
  return (
    <Command>
      <CommandInput placeholder="Procurar colaborador…" />
      <CommandList>
        <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
        <CommandGroup heading="Ver a app como…">
          {collaborators.map((c) => (
            <CommandItem
              key={c.id}
              value={`${c.nome} ${c.email ?? ""} ${c.numero_colaborador ?? ""}`}
              onSelect={() => onPick(c.id)}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedId === c.id ? "opacity-100" : "opacity-0",
                )}
              />
              <div className="flex flex-col">
                <span className="text-sm">{c.nome}</span>
                {c.email && (
                  <span className="text-[11px] text-muted-foreground">{c.email}</span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        {viewAsUser && (
          <CommandGroup>
            <CommandItem onSelect={onExit} className="text-destructive">
              <EyeOff className="mr-2 h-4 w-4" />
              Sair do modo colaborador
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
