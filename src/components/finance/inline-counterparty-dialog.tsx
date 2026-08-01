/**
 * Inline create dialog for a financial supplier or client.
 *
 * Used from places where the user is already mid-flow (bank reconciliation
 * classify dialog, financial document editor) and discovers that the
 * counterparty does not exist yet.
 *
 * Unified: this is now a thin wrapper around the single company creation form
 * (`NewCompanyDialog`), pre-ticking the right role flag:
 *   - client   → companies.is_client = true
 *   - supplier → companies.is_supplier = true
 *
 * The shared form handles NIF normalization, duplicate-NIF warnings, the
 * optional primary contact and all cache invalidation.
 */

import { useState } from "react";
import { NewCompanyDialog } from "@/components/crm/new-company-dialog";

export type CounterpartyKind = "supplier" | "client";

type Props = {
  kind: CounterpartyKind;
  /** Optional initial name pre-filled from the calling context. */
  defaultName?: string;
  /** Render the trigger inside the dialog (so callers can place it). */
  trigger?: React.ReactNode;
  /** Open state if you want to control externally. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Called once the row exists. */
  onCreated: (row: { id: string; name: string }) => void;
};

export function InlineCounterpartyDialog({
  kind,
  defaultName,
  trigger,
  open: openProp,
  onOpenChange,
  onCreated,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="contents">
          {trigger}
        </span>
      ) : null}
      <NewCompanyDialog
        open={open}
        onClose={() => setOpen(false)}
        defaultName={defaultName}
        defaultIsClient={kind === "client"}
        defaultIsSupplier={kind === "supplier"}
        onCreated={(id, nome) => onCreated({ id, name: nome })}
      />
    </>
  );
}
