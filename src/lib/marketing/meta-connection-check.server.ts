import { META_EXPECTED_USERNAME, META_GRAPH_VERSION, permissionChecks, type MetaSettings } from "./meta-connection";

type Page = { id?: string; name?: string; instagram_business_account?: { id?: string; username?: string } };
type Debug = { is_valid?: boolean; scopes?: string[]; expires_at?: number; data_access_expires_at?: number };
type GraphBody = { id?: string; name?: string; data?: Page[] | Debug; paging?: { cursors?: { after?: string }; next?: string }; error?: unknown };
type BatchResult = { code: number; body: string };
const stamp = (value: number | undefined) => typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : null;

/** Batch GET operations keep input_token in the HTTPS POST body, not a logged URL.
 * Never log requests, provider bodies, headers or thrown provider errors. Only DTO fields leave this module. */
export async function checkMetaConnection(token: string, request: typeof fetch = fetch): Promise<MetaSettings> {
  const testedAt = new Date().toISOString();
  const result: MetaSettings = {
    id: true, meta_page_id: null, meta_page_name: null, instagram_account_id: null,
    instagram_username: null, connected_at: null, last_tested_at: testedAt,
    granted_permissions: [], token_expires_at: null, data_access_expires_at: null,
    token_never_expires: false, token_valid: null, connection_ok: false,
    last_error_code: null, graph_api_version: META_GRAPH_VERSION,
  };
  const fields = "id,name,instagram_business_account{id,username}";
  async function batch(paths: string[]): Promise<(GraphBody | null)[]> {
    try {
      const response = await request(`https://graph.facebook.com/${META_GRAPH_VERSION}/`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: new URLSearchParams({ batch: JSON.stringify(paths.map((relative_url) => ({ method: "GET", relative_url }))), include_headers: "false" }),
        signal: AbortSignal.timeout(20000), redirect: "error",
      });
      if (!response.ok) return paths.map(() => null);
      const rows = await response.json() as BatchResult[];
      if (!Array.isArray(rows) || rows.length !== paths.length) return paths.map(() => null);
      return rows.map((row) => {
        if (row.code < 200 || row.code >= 300) return null;
        try { const body = JSON.parse(row.body) as GraphBody; return body.error ? null : body; }
        catch { return null; }
      });
    } catch { return paths.map(() => null); }
  }
  const [me, accounts, inspected] = await batch([
    "me?fields=id,name", `me/accounts?fields=${encodeURIComponent(fields)}&limit=100`,
    `debug_token?input_token=${encodeURIComponent(token)}`,
  ]);
  if (!me?.id) result.last_error_code = "identityFailed";
  const debug = inspected?.data && !Array.isArray(inspected.data) ? inspected.data : null;
  if (debug) {
    result.token_valid = typeof debug.is_valid === "boolean" ? debug.is_valid : null;
    result.granted_permissions = Array.isArray(debug.scopes) ? debug.scopes.filter((s): s is string => typeof s === "string" && /^[a-z_]+$/.test(s)) : [];
    result.token_never_expires = debug.expires_at === 0;
    result.token_expires_at = stamp(debug.expires_at);
    result.data_access_expires_at = stamp(debug.data_access_expires_at);
  } else result.last_error_code ??= "debugFailed";
  const pages: Page[] = Array.isArray(accounts?.data) ? [...accounts.data] : [];
  let current = accounts;
  let pageCount = 0;
  while (current?.paging?.next && current.paging.cursors?.after && pageCount < 20) {
    const [next] = await batch([`me/accounts?fields=${encodeURIComponent(fields)}&limit=100&after=${encodeURIComponent(current.paging.cursors.after)}`]);
    if (!next || !Array.isArray(next.data)) { result.last_error_code ??= "accountsFailed"; break; }
    pages.push(...next.data); current = next; pageCount++;
  }
  if (current?.paging?.next) result.last_error_code ??= "accountsFailed";
  if (!accounts) result.last_error_code ??= "accountsFailed";
  const matches = [...new Map(pages.filter((p) => p.instagram_business_account?.username === META_EXPECTED_USERNAME).map((p) => [p.id, p])).values()];
  const page = matches.length === 1 ? matches[0] : undefined;
  if (page?.id && page.name && page.instagram_business_account?.id) {
    result.meta_page_id = page.id; result.meta_page_name = page.name;
    result.instagram_account_id = page.instagram_business_account.id;
    result.instagram_username = META_EXPECTED_USERNAME;
  } else result.last_error_code ??= matches.length > 1 ? "ambiguousPage" : "pageNotFound";
  if (result.token_valid === false) result.last_error_code ??= "invalidToken";
  if (permissionChecks(result.granted_permissions).some((p) => !p.granted)) result.last_error_code ??= "missingPermissions";
  result.connection_ok = !result.last_error_code && result.token_valid === true && !!result.meta_page_id;
  if (result.connection_ok) result.connected_at = testedAt;
  return result;
}