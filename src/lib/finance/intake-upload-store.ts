/**
 * Upload progress for Entrada › Carregar documentos.
 *
 * Kept at module level (outside any component) so an upload keeps running and
 * its status stays visible while the user moves around the app. Each file goes
 * through: uploading (with %) → reading (AI, elapsed time) → done | failed.
 * Nothing fails silently: every failure keeps its reason on screen.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { IngestResult } from "@/lib/finance/doc-intake.functions";

export type UploadStage = "uploading" | "reading" | "done" | "failed";
export type UploadJob = {
  id: string;
  fileName: string;
  size: number;
  stage: UploadStage;
  progress: number;
  startedAt: number;
  uploadedAt?: number;
  finishedAt?: number;
  error?: string;
  result?: IngestResult;
};

/** Hard limit: larger scans are refused with a clear message, never half-processed. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const LARGE_UPLOAD_BYTES = 10 * 1024 * 1024;

let jobs: UploadJob[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (id: string, p: Partial<UploadJob>) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
  emit();
};

export function useUploadJobs(): UploadJob[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => jobs,
    () => jobs,
  );
}

export function dismissUploadJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

/** Classifies the failure reason a user can act on. */
export function uploadErrorReason(size: number, message?: string): string {
  if (size > MAX_UPLOAD_BYTES) return "too_large";
  if (!message) return "unknown";
  if (/network|failed to fetch|timeout/i.test(message)) return "network";
  return "other";
}

function putWithProgress(bucket: string, path: string, file: File, token: string, onProgress: (p: number) => void): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.message ?? msg; } catch { /* keep status */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}

export function startUpload(
  file: File,
  bucket: string,
  ingest: (path: string) => Promise<IngestResult>,
  onFinished: (job: UploadJob) => void,
) {
  const id = crypto.randomUUID();
  const job: UploadJob = { id, fileName: file.name, size: file.size, stage: "uploading", progress: 0, startedAt: Date.now() };
  jobs = [job, ...jobs];
  emit();

  if (file.size > MAX_UPLOAD_BYTES) {
    patch(id, { stage: "failed", error: "too_large", finishedAt: Date.now() });
    onFinished(jobs.find((j) => j.id === id)!);
    return;
  }

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("not signed in");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `intake/${crypto.randomUUID()}-${safe}`;
      await putWithProgress(bucket, path, file, token, (p) => patch(id, { progress: p }));
      patch(id, { stage: "reading", progress: 100, uploadedAt: Date.now() });
      const res = await ingest(path);
      if (!res.ok) throw new Error(res.error ?? "extraction failed");
      patch(id, { stage: "done", result: res, finishedAt: Date.now() });
    } catch (e) {
      patch(id, { stage: "failed", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    } finally {
      onFinished(jobs.find((j) => j.id === id)!);
    }
  })();
}
