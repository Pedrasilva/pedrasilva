import { supabase } from "@/integrations/supabase/client";

export const ACTION_BUCKET = "marketing-assets";
export const ACTION_MAX_BYTES = 500 * 1024 * 1024;
const TUS_THRESHOLD = 6 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/|audio\/|video\/)/;
const ALLOWED_EXT = /\.(pdf|docx|jpe?g|png|webp|heic|heif|gif|mp3|m4a|wav|ogg|webm|aac|mp4|mov|m4v)$/i;

export function checkActionFile(f: File): "type" | "size" | null {
  if (f.size > ACTION_MAX_BYTES) return "size";
  if (!ALLOWED.test(f.type) && !ALLOWED_EXT.test(f.name)) return "type";
  return null;
}

/** Best-effort MIME when the browser leaves it empty. */
export function mimeOf(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", mov: "video/quicktime", heic: "image/heic",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Upload into marketing-assets/actions/<actionId>/<purpose>/…, resumable (TUS) above 6 MB like the Inbox. */
export async function uploadActionFile(actionId: string, purpose: "brief" | "outcome", file: File, onProgress?: (pct: number) => void) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `actions/${actionId}/${purpose}/${crypto.randomUUID()}-${safe}`;
  const contentType = mimeOf(file);
  if (file.size > TUS_THRESHOLD) {
    const { Upload } = await import("tus-js-client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No session");
    await new Promise<void>((resolve, reject) => {
      const up = new Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: ACTION_BUCKET, objectName: path, contentType, cacheControl: "3600" },
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
        onSuccess: () => resolve(),
      });
      up.findPreviousUploads().then((prev) => {
        if (prev.length) up.resumeFromPreviousUpload(prev[0]);
        up.start();
      });
    });
  } else {
    const { error } = await supabase.storage.from(ACTION_BUCKET).upload(path, file, { contentType });
    if (error) throw error;
    onProgress?.(100);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (supabase as any).from("marketing_action_files").insert({
    action_id: actionId, purpose, storage_path: path, file_name: file.name, mime_type: contentType,
  }).select("id").single();
  if (error) throw error;
  return row.id as string;
}
