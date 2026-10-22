import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware: () => ({ handler: (handler: unknown) => handler }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../src/lib/marketing/meta-connection-check.server", () => ({ checkMetaConnection: vi.fn() }));

import { metaConnectionCheck } from "../src/lib/marketing/meta-connection-check.functions";
import { checkMetaConnection } from "../src/lib/marketing/meta-connection-check.server";

describe("Meta endpoint role authorization", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects a non-admin on the server before any Meta request or settings write", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const from = vi.fn();
    const handler = metaConnectionCheck as unknown as (arg: unknown) => Promise<unknown>;
    await expect(handler({ context: { userId: "non-admin", supabase: { rpc, from } } })).rejects.toThrow("Forbidden");
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "non-admin", _role: "admin" });
    expect(checkMetaConnection).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects role lookup failures rather than bypassing caller RLS", async () => {
    const handler = metaConnectionCheck as unknown as (arg: unknown) => Promise<unknown>;
    await expect(handler({ context: { userId: "admin", supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: { message: "denied" } }) } } })).rejects.toThrow("Forbidden");
    expect(checkMetaConnection).not.toHaveBeenCalled();
  });
});