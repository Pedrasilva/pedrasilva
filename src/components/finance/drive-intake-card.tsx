import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getDriveIntakeFolder } from "@/lib/finance/drive-intake.functions";

type Row = {
  id: string;
  drive_file_id: string;
  file_name: string | null;
  mime_type: string | null;
  status: string;
  reason: string | null;
  error: string | null;
  moved_to: string | null;
  processed_at: string;
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "default",
  skipped: "secondary",
  failed: "destructive",
};

export function DriveIntakeCard() {
  const fetchFolder = useServerFn(getDriveIntakeFolder);

  const folderQ = useQuery({
    queryKey: ["finance", "drive-intake-folder"],
    queryFn: () => fetchFolder({}),
    staleTime: 5 * 60 * 1000,
  });

  const logQ = useQuery({
    queryKey: ["finance", "drive-intake-log"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("financial_drive_processed_files")
        .select("id, drive_file_id, file_name, mime_type, status, reason, error, moved_to, processed_at")
        .order("processed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const folderId = folderQ.data?.ok ? folderQ.data.inboxFolderId : undefined;
  const rows = logQ.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" /> Drive folder intake
        </CardTitle>
        <CardDescription>
          Drop scanned documents (PDF, JPEG, PNG) into the shared “Finance Intake” Drive folder.
          They are picked up every 5 minutes, queued in the document review queue, and moved to
          “Processed” (or “Failed” when they could not be read).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {folderId ? (
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open intake folder <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : folderQ.data && !folderQ.data.ok ? (
          <p className="text-sm text-destructive">{folderQ.data.error}</p>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files picked up yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.file_name ?? r.drive_file_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.processed_at).toLocaleString()}
                    {r.moved_to ? ` · moved to ${r.moved_to}` : ""}
                  </p>
                  {(r.reason || r.error) && (
                    <p className="mt-1 text-xs text-destructive">{r.reason ?? r.error}</p>
                  )}
                </div>
                <Badge variant={statusVariant[r.status] ?? "outline"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
