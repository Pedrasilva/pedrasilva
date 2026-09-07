import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AvailabilityPerson } from "@/lib/hr/use-team-availability";

/**
 * Leave balance table — reuses the existing formula exactly:
 * annual allowance + extra days + carry-over − approved − pending (holiday only).
 */
export function AvailabilityBalances({ people }: { people: AvailabilityPerson[] }) {
  const { t } = useTranslation("hr");
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("availability.grid.person")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.allowance")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.extra")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.carryOver")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.taken")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.booked")}</TableHead>
            <TableHead className="text-right">{t("availability.balance.remaining")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((p) => {
            const remaining =
              p.allowance + p.extra + p.carryOver - p.taken - p.booked;
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="text-right tabular-nums">{p.allowance}</TableCell>
                <TableCell className="text-right tabular-nums">{p.extra}</TableCell>
                <TableCell className="text-right tabular-nums">{p.carryOver}</TableCell>
                <TableCell className="text-right tabular-nums">{p.taken}</TableCell>
                <TableCell className="text-right tabular-nums">{p.booked}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {remaining}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
