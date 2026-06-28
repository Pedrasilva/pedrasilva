/**
 * Phase 1 — Lock banner shown on the CRM quote workspace once the quote has
 * been approved AND converted into a live project. The DB trigger
 * `fee_proposals_autolock_trg` sets `is_locked = true` automatically; this
 * banner is purely informational + a deep link to the project that now owns
 * the live planning. Non-admin viewers also see all editors disabled via a
 * surrounding <fieldset disabled>.
 */
import { Link } from "@tanstack/react-router";
import { Lock, ExternalLink } from "lucide-react";

type Props = {
  projectId: string | null;
  projectName?: string | null;
  isAdmin: boolean;
};

export function QuoteLockBanner({ projectId, projectName, isAdmin }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">
          Proposta bloqueada — convertida em projecto
        </p>
        <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
          Esta proposta foi aprovada e o plano vivo passou para o projecto.
          Datas, fases, honorários e schedule são geridos no módulo de
          Projectos. Alterações são comparadas contra esta proposta como
          baseline contratual.
          {!isAdmin && (
            <span className="block mt-1">
              Está em modo leitura. Apenas administradores podem editar uma
              proposta bloqueada.
            </span>
          )}
        </p>
        {projectId && (
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir projecto{projectName ? ` — ${projectName}` : ""}
          </Link>
        )}
      </div>
    </div>
  );
}
