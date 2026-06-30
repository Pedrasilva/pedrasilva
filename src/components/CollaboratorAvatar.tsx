import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COLLABORATOR_PHOTO_BUCKET, getInitials } from "@/lib/collaborator-photo";
import { cn } from "@/lib/utils";

type Props = {
  /** Collaborator id (preferred). */
  collaboratorId?: string | null;
  /** Direct photo path override (skips lookup). */
  fotoPath?: string | null;
  /** Display name (used for fallback initials). */
  name?: string | null;
  /** Optional ring color (hex). */
  color?: string | null;
  className?: string;
  /** Size in px. Defaults to 28. */
  size?: number;
};

/**
 * Reusable avatar for a collaborator. Resolves the photo from
 * `collaborators.foto_path` and falls back to coloured initials.
 */
export function CollaboratorAvatar({
  collaboratorId,
  fotoPath,
  name,
  color,
  className,
  size = 28,
}: Props) {
  const { data: lookup } = useQuery({
    queryKey: ["collaborator-photo", collaboratorId],
    enabled: !!collaboratorId && fotoPath === undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators_directory")
        .select("foto_path, nome")
        .eq("id", collaboratorId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const path = fotoPath !== undefined ? fotoPath : lookup?.foto_path ?? null;
  const displayName = name ?? lookup?.nome ?? null;
  const url = collaboratorPhotoUrl(path);
  const initials = getInitials(displayName);

  return (
    <Avatar
      className={cn("shrink-0", className)}
      style={{
        width: size,
        height: size,
        boxShadow: color ? `0 0 0 2px ${color}` : undefined,
      }}
    >
      {url && <AvatarImage src={url} alt={displayName ?? "colaborador"} />}
      <AvatarFallback
        className="text-[10px] font-semibold"
        style={
          color
            ? {
                backgroundColor: `${color}20`,
                color: color,
              }
            : undefined
        }
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
