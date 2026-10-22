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
};

export function metaAdminAllowed(role: unknown, error: unknown): boolean {
  return !error && role === true;
}

export function permissionChecks(granted: readonly string[]) {
  return META_EXPECTED_PERMISSIONS.map((permission) => ({ permission, granted: granted.includes(permission) }));
}