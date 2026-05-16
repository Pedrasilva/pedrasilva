import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { Collaborator } from "@/lib/salary";
import { computeCollaboratorFte } from "@/lib/hr/fte";
import { cn } from "@/lib/utils";

export type CollabSortKey = "nome" | "departamento" | "numero" | "situacao" | "status";
export type SortDir = "asc" | "desc";

type Props = {
  rows: Collaborator[];
  sortKey: CollabSortKey;
  sortDir: SortDir;
  onSortChange: (key: CollabSortKey) => void;
  onArchive?: (c: Collaborator) => void;
  onRestore?: (c: Collaborator) => void;
  busyId?: string | null;
};

export function CollaboratorsTable({
  rows,
  sortKey,
  sortDir,
  onSortChange,
}: Props) {
...
          <SortHead label={t("hr:colaboradores.columns.status")} k="status" current={sortKey} dir={sortDir} onClick={onSortChange} />
          <TableHead className="text-right">{t("hr:colaboradores.columns.fte", "FTE")}</TableHead>
          <TableHead className="text-right">{t("hr:colaboradores.columns.chargeability", "Chargeability")}</TableHead>
        </TableRow>
...
              <TableCell className="text-right tabular-nums">
                {computeCollaboratorFte(c.daily_hours, c.days_per_week).toFixed(2)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {c.target_chargeability_pct == null
                  ? "—"
                  : `${Number(c.target_chargeability_pct).toFixed(0)}%`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SortHead({
  label,
  k,
  current,
  dir,
  onClick,
}: {
  label: string;
  k: CollabSortKey;
  current: CollabSortKey;
  dir: SortDir;
  onClick: (k: CollabSortKey) => void;
}) {
  const active = k === current;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 select-none transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}
