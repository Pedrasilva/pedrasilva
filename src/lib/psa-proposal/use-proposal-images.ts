/**
 * Shared image library for the PSA proposal composer.
 * Backed by public.psa_image_library + storage bucket 'proposal-images'.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const PROPOSAL_IMAGE_BUCKET = "proposal-images";

export type PsaImageCategory =
  | "general"
  | "residential"
  | "workplace"
  | "hospitality"
  | "team";

export interface PsaImageLibraryEntry {
  id: string;
  name: string;
  storage_path: string;
  bucket: string;
  size_hint: string | null;
  width: number | null;
  height: number | null;
  category: PsaImageCategory;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useProposalImages() {
  return useQuery({
    queryKey: ["psa-image-library"],
    queryFn: async (): Promise<PsaImageLibraryEntry[]> => {
      const { data, error } = await sb
        .from("psa_image_library")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PsaImageLibraryEntry[];
    },
  });
}

export function useUploadProposalImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      file: File;
      name?: string;
      category?: PsaImageCategory;
    }): Promise<PsaImageLibraryEntry> => {
      const { file, name, category } = args;
      const cleanName = (name ?? file.name).replace(/\.[^.]+$/, "");
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(PROPOSAL_IMAGE_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (up.error) throw up.error;

      // Read intrinsic dimensions for aspect display (best-effort).
      const dims = await new Promise<{ w: number | null; h: number | null }>((resolve) => {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
            URL.revokeObjectURL(url);
          };
          img.onerror = () => resolve({ w: null, h: null });
          img.src = url;
        } catch {
          resolve({ w: null, h: null });
        }
      });

      const { data: user } = await supabase.auth.getUser();
      const userId = user.user?.id;
      if (!userId) throw new Error("You must be signed in to upload images.");
      const { data, error } = await sb
        .from("psa_image_library")
        .insert({
          name: cleanName,
          storage_path: path,
          bucket: PROPOSAL_IMAGE_BUCKET,
          width: dims.w,
          height: dims.h,
          category: category ?? "general",
          created_by: userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as PsaImageLibraryEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["psa-image-library"] }),
  });
}

export function useUpdateProposalImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      category?: PsaImageCategory;
      name?: string;
    }) => {
      const patch: Record<string, unknown> = {};
      if (args.category) patch.category = args.category;
      if (args.name) patch.name = args.name;
      const { error } = await sb
        .from("psa_image_library")
        .update(patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["psa-image-library"] }),
  });
}

export function useDeleteProposalImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: PsaImageLibraryEntry) => {
      await supabase.storage.from(entry.bucket).remove([entry.storage_path]).catch(() => {});
      const { error } = await sb.from("psa_image_library").delete().eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["psa-image-library"] }),
  });
}

/** Return a long-lived signed URL for a proposal-image path. Cached per path. */
export function useSignedProposalImageUrl(
  path: string | null | undefined,
  bucket: string = PROPOSAL_IMAGE_BUCKET,
) {
  return useQuery({
    enabled: !!path,
    queryKey: ["psa-image-signed-url", bucket, path],
    // 55 min cache; signed URL valid 1 hour
    staleTime: 55 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
