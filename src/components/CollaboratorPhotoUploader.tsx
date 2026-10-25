import { translateError } from '@/lib/translate-error';
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { toast } from '@/lib/toast';
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { COLLABORATOR_PHOTO_BUCKET } from "@/lib/collaborator-photo";

type Props = {
  collaboratorId: string;
  name: string;
  fotoPath: string | null;
  size?: number;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export function CollaboratorPhotoUploader({
  collaboratorId,
  name,
  fotoPath,
  size = 96,
}: Props) {
  useTranslation();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["collaborator", collaboratorId] });
    qc.invalidateQueries({ queryKey: ["collaborator-photo", collaboratorId] });
    qc.invalidateQueries({ queryKey: ["collaborators"] });
    qc.invalidateQueries({ queryKey: ["collaborators-existing-list"] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!ACCEPT.includes(file.type)) {
        throw new Error(uiI18n.t("common:collaboratorPhoto.invalidFormat"));
      }
      if (file.size > MAX_BYTES) {
        throw new Error(uiI18n.t("common:collaboratorPhoto.tooLarge"));
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${collaboratorId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(COLLABORATOR_PHOTO_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      // Remove previous file if any
      if (fotoPath && fotoPath !== path) {
        await supabase.storage.from(COLLABORATOR_PHOTO_BUCKET).remove([fotoPath]);
      }

      const { error: dbErr } = await supabase
        .from("collaborators")
        .update({ foto_path: path })
        .eq("id", collaboratorId);
      if (dbErr) throw dbErr;
      return path;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("common:collaboratorPhoto.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
    onSettled: () => setBusy(false),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (fotoPath) {
        await supabase.storage.from(COLLABORATOR_PHOTO_BUCKET).remove([fotoPath]);
      }
      const { error } = await supabase
        .from("collaborators")
        .update({ foto_path: null })
        .eq("id", collaboratorId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("common:collaboratorPhoto.removed"));
      invalidate();
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
    onSettled: () => setBusy(false),
  });

  const onPick = (file: File | null) => {
    if (!file) return;
    setBusy(true);
    upload.mutate(file);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <CollaboratorAvatar
          collaboratorId={collaboratorId}
          fotoPath={fotoPath}
          name={name}
          size={size}
          className="rounded-full ring-1 ring-border"
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Camera className="h-4 w-4" />
            {fotoPath ? uiI18n.t("common:collaboratorPhoto.change") : uiI18n.t("common:collaboratorPhoto.upload")}
          </Button>
          {fotoPath && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setBusy(true);
                remove.mutate();
              }}
              disabled={busy}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
               {uiI18n.t("common:remove")} </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
           {uiI18n.t("common:collaboratorPhoto.hint")} </p>
      </div>
    </div>
  );
}
