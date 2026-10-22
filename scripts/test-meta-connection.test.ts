import { describe, it, expect } from "vitest";
import { checkMetaConnection } from "../src/lib/marketing/meta-connection-check.server";
import { metaAdminAllowed, permissionChecks } from "../src/lib/marketing/meta-connection";

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