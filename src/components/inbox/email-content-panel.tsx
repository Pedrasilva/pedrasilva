/**
 * Full message view for one queued email: sanitised body, attachment list
 * (downloaded through the connector gateway, never direct Gmail auth) and a
 * Forward action. Purely additive — the triage actions live in the parent row.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Forward,
  Image as ImageIcon,
  Loader2,
  Paperclip,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadEmailAttachment,
  forwardEmailEvent,
  getEmailMessageContent,
} from "@/lib/inbox/inbox.functions";

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function EmailContentPanel({
  eventId,
  category,
}: {
  eventId: string;
  category: string | null;
}) {
  const { t } = useTranslation(["inbox", "common"]);
  const contentFn = useServerFn(getEmailMessageContent);
  const downloadFn = useServerFn(downloadEmailAttachment);
  const forwardFn = useServerFn(forwardEmailEvent);

  const [forwardOpen, setForwardOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busyAttachment, setBusyAttachment] = useState<string | null>(null);

  const contentQ = useQuery({
    queryKey: ["email-content", eventId],
    queryFn: () => contentFn({ data: { id: eventId } }),
    staleTime: 5 * 60 * 1000,
  });

  const forwardM = useMutation({
    mutationFn: (address: string) =>
      forwardFn({
        data: { id: eventId, to: address, ...(note.trim() ? { note } : {}) },
      }),
    onSuccess: () => {
      setForwardOpen(false);
      setTo("");
      setNote("");
      toast.success(t("inbox:content.forwarded"));
    },
    onError: (e: unknown) =>
      toast.error(t("inbox:content.forwardFailed"), {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  async function openAttachment(
    attachmentId: string,
    filename: string,
    mimeType: string,
  ) {
    setBusyAttachment(attachmentId);
    try {
      const { base64 } = await downloadFn({
        data: { id: eventId, attachmentId },
      });
      const url = URL.createObjectURL(base64ToBlob(base64, mimeType));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(t("inbox:content.attachmentFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusyAttachment(null);
    }
  }

  const docsAddress = contentQ.data?.docsIntakeAddress ?? null;
  const showDocsShortcut = category === "supplier_invoice" && !!docsAddress;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("inbox:content.title")}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setForwardOpen(true)}
          disabled={contentQ.isLoading}
        >
          <Forward className="mr-1.5 h-4 w-4" />
          {t("inbox:content.forward")}
        </Button>
      </div>

      {contentQ.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("inbox:content.loading")}
        </p>
      )}

      {contentQ.isError && (
        <p className="text-sm text-destructive">
          {contentQ.error instanceof Error
            ? contentQ.error.message
            : t("inbox:content.loadError")}
        </p>
      )}

      {contentQ.data && (
        <>
          {contentQ.data.html ? (
            <div
              className="max-h-[28rem] overflow-auto rounded-md border bg-background p-3 text-sm [&_a]:underline [&_img]:max-w-full [&_table]:w-auto"
              // Sanitised server-side with sanitize-html before it ever reaches the client.
              dangerouslySetInnerHTML={{ __html: contentQ.data.html }}
            />
          ) : contentQ.data.text ? (
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
              {contentQ.data.text}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("inbox:content.empty")}
            </p>
          )}

          {contentQ.data.attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Paperclip className="h-4 w-4" />
                {t("inbox:content.attachments", {
                  count: contentQ.data.attachments.length,
                })}
              </p>
              <ul className="space-y-1.5">
                {contentQ.data.attachments.map((att) => (
                  <li
                    key={att.attachmentId}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    {att.mimeType.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{att.filename}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatSize(att.size)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyAttachment === att.attachmentId}
                      onClick={() =>
                        void openAttachment(
                          att.attachmentId,
                          att.filename,
                          att.mimeType,
                        )
                      }
                    >
                      {busyAttachment === att.attachmentId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        {t("inbox:content.download")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Separator />

      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox:content.forwardTitle")}</DialogTitle>
            <DialogDescription>
              {t("inbox:content.forwardBody")}
            </DialogDescription>
          </DialogHeader>

          {showDocsShortcut && (
            <Button
              variant="secondary"
              disabled={forwardM.isPending}
              onClick={() => forwardM.mutate(docsAddress!)}
            >
              <Forward className="mr-1.5 h-4 w-4" />
              {t("inbox:content.forwardDocs", { address: docsAddress })}
            </Button>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor={`fwd-${eventId}`}>
              {t("inbox:content.forwardTo")}
            </label>
            <Input
              id={`fwd-${eventId}`}
              type="email"
              value={to}
              placeholder="name@example.com"
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor={`fwdnote-${eventId}`}>
              {t("inbox:content.forwardNote")}
            </label>
            <Textarea
              id={`fwdnote-${eventId}`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardOpen(false)}>
              {t("inbox:confirm.cancel")}
            </Button>
            <Button
              disabled={forwardM.isPending || !to.trim()}
              onClick={() => forwardM.mutate(to.trim())}
            >
              {forwardM.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {t("inbox:content.forward")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
