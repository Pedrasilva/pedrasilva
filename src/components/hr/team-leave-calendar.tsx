import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDateLocale } from "@/i18n/use-date-locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The database projection is the boundary: never fetch detailed requests here. */
export function TeamLeaveCalendar() {
  const { t } = useTranslation(["hr", "common"]);
  const locale = useDateLocale();
  const query = useQuery({
    queryKey: ["hr-team-leave-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_team_leave_calendar")
        .select("collaborator_id,nome,data_inicio,data_fim,tipo").order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">{t("hr:availability.title")}</h1>
    {query.isError ? <p role="alert">{t("common:error")}</p> : query.isLoading ? <p>{t("common:loading")}</p> :
      <Table><TableHeader><TableRow>
        <TableHead>{t("common:name")}</TableHead>
        <TableHead>{t("hr:diasUteis.holidays.headers.date")}</TableHead>
        <TableHead>{t("common:status")}</TableHead>
      </TableRow></TableHeader><TableBody>{query.data?.map((row, index) =>
        <TableRow key={`${row.collaborator_id}:${row.data_inicio}:${row.data_fim}:${index}`}>
          <TableCell>{row.nome}</TableCell>
          <TableCell>{row.data_inicio ? format(parseISO(row.data_inicio), "dd MMM yyyy", { locale }) : "—"} – {row.data_fim ? format(parseISO(row.data_fim), "dd MMM yyyy", { locale }) : "—"}</TableCell>
          <TableCell>{t("common:absent")}</TableCell>
        </TableRow>)}</TableBody></Table>}
  </section>;
}