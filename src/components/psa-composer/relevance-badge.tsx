/**
 * Coloured pill badge showing whether a block is Proposta, Contrato,
 * Ambos or Interno. Used in the canvas, library and settings panels.
 */
import { cn } from "@/lib/utils";
import {
  RELEVANCE_LABEL,
  RELEVANCE_TONE,
  type PsaContractRelevance,
} from "@/lib/psa-proposal/types";

export function RelevanceBadge({
  value,
  className,
}: {
  value: PsaContractRelevance;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        RELEVANCE_TONE[value],
        className,
      )}
    >
      {RELEVANCE_LABEL[value]}
    </span>
  );
}
