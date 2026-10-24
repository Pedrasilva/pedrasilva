export const META_GRAPH_VERSION = "v26.0";
export const META_EXPECTED_USERNAME = "pedrasilva_arquitectos";
export const META_EXPECTED_PERMISSIONS = [
  "instagram_basic", "instagram_content_publish", "instagram_manage_comments",
  "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management",
] as const;

export type MetaSettings = {
  id: boolean; meta_page_id: string | null; meta_page_name: string | null;
  instagram_account_id: string | null; instagram_username: string | null;
  connected_at: string | null; last_tested_at: string; granted_permissions: string[];
  token_expires_at: string | null; data_access_expires_at: string | null;
  token_never_expires: boolean; token_valid: boolean | null; connection_ok: boolean;
  last_error_code: string | null; graph_api_version: string;
  /** Meta's own reason for the first failed call (redacted; never the token). */
  meta_error_call: string | null; meta_error_code: number | null; meta_error_subcode: number | null;
  meta_error_type: string | null; meta_error_message: string | null; meta_error_fbtrace_id: string | null;
};

export type MetaErrorDetail = { call: string; code: number | null; subcode: number | null; type: string | null; message: string | null; fbtrace_id: string | null };

/** Redacts the token, URLs and any access_token fragments from a provider message. */
export function redactMetaMessage(message: unknown, token: string): string | null {
  if (typeof message !== "string" || !message) return null;
  return (token ? message.split(token).join("[redacted]") : message)
    .replace(/https?:\/\/\S+/g, "[url]").replace(/access_token[=:\s]+\S+/gi, "[redacted]")
    .replace(/EA[A-Za-z0-9]{30,}/g, "[redacted]").slice(0, 500);
}

/** Card label, e.g. "(#190/460) Session invalidated…"; null when there is nothing from Meta. */
export function formatMetaError(s: { meta_error_code?: number | null; meta_error_subcode?: number | null; meta_error_message?: string | null } | null | undefined): string | null {
  if (!s || (s.meta_error_code == null && !s.meta_error_message)) return null;
  const code = s.meta_error_code != null ? `(#${s.meta_error_code}${s.meta_error_subcode != null ? `/${s.meta_error_subcode}` : ""}) ` : "";
  return `${code}${s.meta_error_message ?? ""}`.trim();
}

export function metaAdminAllowed(role: unknown, error: unknown): boolean {
  return !error && role === true;
}

export function permissionChecks(granted: readonly string[]) {
  return META_EXPECTED_PERMISSIONS.map((permission) => ({ permission, granted: granted.includes(permission), required: permission !== "business_management" }));
}