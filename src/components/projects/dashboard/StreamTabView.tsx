import { Inbox } from "lucide-react";
import type { StageWithAllocations } from "@/lib/projects/types";

interface Props {
  projectId: string;
  stages: StageWithAllocations[];
}

/**
 * Stream/notas: requer tabela `pm_activities`/`pm_activity_replies` que ainda
 * não existe. Mostramos um placeholder que sumariza as fases e prepara o
 * terreno para activar o feed assim que o schema for adicionado.
 */
export function StreamTabView({ stages }: Props) {
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="rounded-md border border-dashed border-border py-12 text-center">
        <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-foreground">Stream de actividade por activar</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Notas, comentários e respostas por fase ficarão aqui assim que a tabela `pm_activities` for criada.
        </p>
      </div>

      {stages.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fases deste projecto
          </header>
          <ul className="divide-y divide-border">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-foreground">
                  {i} — {s.name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.allocations.length} alocações
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
