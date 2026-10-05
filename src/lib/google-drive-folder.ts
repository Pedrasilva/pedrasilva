/**
 * Accepts a bare Google Drive folder / shared-drive id or a full Drive link
 * (".../folders/<id>?usp=…", "...?id=<id>", ".../drive/u/0/folders/<id>").
 * Used wherever GOOGLE_DRIVE_* folder settings are read.
 */
export function parseDriveFolderId(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/\/folders\/([a-zA-Z0-9_-]+)/) ?? v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^https?:\/\//i.test(v)) return null;
  return v.replace(/[?#].*$/, "") || null;
}
