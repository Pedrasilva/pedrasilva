import { describe, it, expect } from "vitest";
import { checkMetaConnection } from "../src/lib/marketing/meta-connection-check.server";
import { formatMetaError, metaAdminAllowed, permissionChecks } from "../src/lib/marketing/meta-connection";

const grants = ["instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];
function mocked(debug: unknown, pages: unknown = [{ id: "100", name: "Pedra Silva Arquitectos", instagram_business_account: { id: "200", username: "pedrasilva_arquitectos" } }]): typeof fetch {
  return (async () => Response.json([
    { code: 200, body: JSON.stringify({ id: "300", name: "PSA Hub" }) },
    { code: 200, body: JSON.stringify({ data: pages }) },
    { code: 200, body: JSON.stringify({ data: debug }) },
  ])) as typeof fetch;
}
describe("Meta connection rules", () => {
  it("permits only a confirmed server admin role and fails closed on errors", () => {
    expect(metaAdminAllowed(true, null)).toBe(true);
    expect(metaAdminAllowed(false, null)).toBe(false);
    expect(metaAdminAllowed("admin", null)).toBe(false);
    expect(metaAdminAllowed(true, new Error("denied"))).toBe(false);
  });
  it("checks exactly the seven permissions requested by Luis", () => {
    expect(permissionChecks(grants).map((p) => p.permission)).toEqual(grants);
    expect(permissionChecks(grants.slice(1))[0]?.granted).toBe(false);
  });
  it("treats business_management as optional and connects with the six required grants", async () => {
    const required = grants.filter((permission) => permission !== "business_management");
    expect(permissionChecks(required).find((p) => p.permission === "business_management")).toEqual({ permission: "business_management", granted: false, required: false });
    const result = await checkMetaConnection("test-only", mocked({ is_valid: true, scopes: required, expires_at: 0 }));
    expect(result.connection_ok).toBe(true);
    expect(result.last_error_code).toBeNull();
    expect(result.granted_permissions).toEqual(required);
  });
  it.each(grants.filter((permission) => permission !== "business_management"))("still requires %s", async (missing) => {
    const result = await checkMetaConnection("test-only", mocked({ is_valid: true, scopes: grants.filter((permission) => permission !== missing), expires_at: 0 }));
    expect(result.connection_ok).toBe(false);
    expect(result.last_error_code).toBe("missingPermissions");
  });
  it("selects the expected Instagram, projects only safe metadata and confirms no expiry", async () => {
    const result = await checkMetaConnection("test-only", mocked({ is_valid: true, scopes: grants, expires_at: 0, access_token: "do-not-return" }));
    expect(result.connection_ok).toBe(true);
    expect(result.instagram_username).toBe("pedrasilva_arquitectos");
    expect(result.meta_page_id).toBe("100");
    expect(result.token_never_expires).toBe(true);
    expect(JSON.stringify(result)).not.toContain("do-not-return");
    expect(JSON.stringify(result)).not.toContain("test-only");
  });
  it("does not silently choose a different Instagram account", async () => {
    const result = await checkMetaConnection("test-only", mocked({ is_valid: true, scopes: grants, expires_at: 0 }, [{ id: "100", instagram_business_account: { id: "200", username: "another_account" } }]));
    expect(result.connection_ok).toBe(false);
    expect(result.meta_page_id).toBeNull();
    expect(result.last_error_code).toBe("pageNotFound");
  });
  it("does not assume expiry or grants when introspection is missing", async () => {
    const result = await checkMetaConnection("test-only", mocked(null));
    expect(result.connection_ok).toBe(false);
    expect(result.token_never_expires).toBe(false);
    expect(result.granted_permissions).toEqual([]);
    expect(result.last_error_code).toBe("debugFailed");
  });
  it("keeps sensitive Graph parameters out of request URLs and redacts provider failures", async () => {
    const request: typeof fetch = (async (url, init) => {
      expect(String(url)).toBe("https://graph.facebook.com/v26.0/");
      expect(init?.method).toBe("POST");
      throw new Error("provider echoed test-only");
    }) as typeof fetch;
    const result = await checkMetaConnection("test-only", request);
    expect(result.last_error_code).toBe("identityFailed");
    expect(JSON.stringify(result)).not.toContain("test-only");
  });
});
describe("Meta failure reasons", () => {
  it("keeps Meta's code, subcode, type, message and fbtrace_id without the token", async () => {
    const err = { error: { message: "Error validating access token: Session has been invalidated because the user changed their password. test-only", type: "OAuthException", code: 190, error_subcode: 460, fbtrace_id: "AbC123" } };
    const request = (async () => Response.json([
      { code: 400, body: JSON.stringify(err) }, { code: 400, body: JSON.stringify(err) }, { code: 400, body: JSON.stringify(err) },
    ])) as typeof fetch;
    const result = await checkMetaConnection("test-only", request);
    expect(result.last_error_code).toBe("identityFailed");
    expect(result.meta_error_call).toBe("me");
    expect(result.meta_error_code).toBe(190);
    expect(result.meta_error_subcode).toBe(460);
    expect(result.meta_error_type).toBe("OAuthException");
    expect(result.meta_error_fbtrace_id).toBe("AbC123");
    expect(formatMetaError(result)).toMatch(/^\(#190\/460\) Error validating access token/);
    expect(JSON.stringify(result)).not.toContain("test-only");
  });
  it("reports a top-level HTTP failure with Meta's reason", async () => {
    const request = (async () => Response.json({ error: { message: "Invalid OAuth access token.", code: 190, type: "OAuthException", fbtrace_id: "X1" } }, { status: 400 })) as typeof fetch;
    const result = await checkMetaConnection("test-only", request);
    expect(result.meta_error_call).toBe("batch");
    expect(formatMetaError(result)).toBe("(#190) Invalid OAuth access token.");
  });
  it("leaves the reason empty when the connection works", async () => {
    const result = await checkMetaConnection("test-only", mocked({ is_valid: true, scopes: grants, expires_at: 0 }));
    expect(result.meta_error_code).toBeNull();
    expect(formatMetaError(result)).toBeNull();
  });
  it("uses redirect manual, which the Workers runtime accepts", async () => {
    let mode: RequestRedirect | undefined;
    const base = mocked({ is_valid: true, scopes: grants, expires_at: 0 });
    const request = (async (url: RequestInfo | URL, init?: RequestInit) => { mode = init?.redirect; return base(url, init); }) as typeof fetch;
    await checkMetaConnection("test-only", request);
    expect(mode).toBe("manual");
  });
  it("refuses a 3xx from Meta without following it", async () => {
    const request = (async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } })) as typeof fetch;
    const result = await checkMetaConnection("test-only", request);
    expect(result.connection_ok).toBe(false);
    expect(result.meta_error_message).toBe("Meta redirected unexpectedly (HTTP 302)");
  });
  it("stores the thrown error's name and redacted message", async () => {
    const request = (async () => { throw new TypeError("Invalid redirect value test-only"); }) as typeof fetch;
    const result = await checkMetaConnection("test-only", request);
    expect(result.meta_error_message).toBe("Meta could not be reached (TypeError: Invalid redirect value [redacted])");
  });
});
