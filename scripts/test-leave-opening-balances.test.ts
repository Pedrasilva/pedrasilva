import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Read-only integration checks. June fixtures are the approved literal values;
// boundary tests use an explicitly disposable collaborator, never real requests.
const raw = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const session = raw ? JSON.parse(raw) : null;
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key && session ? createClient(url, key, { accessToken: async () => session.access_token, auth: { persistSession: false } }) : null;

async function balances(year: number) {
  if (!db) throw new Error("Authenticated integration-test environment required");
  const { data, error } = await db.rpc("hr_leave_balances", { _year: year });
  if (error) throw error;
  return data as { collaborator_id: string; total: number; approved: number; pending: number; balance: number; carry_over: number }[];
}

describe("approved June 2026 opening totals", () => {
  const cases = [
    ["Bernardo", "86fa7aca-dede-44f8-a242-6674e5b5a135", 23, 16, 7],
    ["Francisco", "b4e1fbe7-1a6c-4b46-bfda-137522c5784d", 18, 6, 12],
    ["Irene", "fea8232b-fe21-45ef-ac27-438d9808477c", 18, 0, 18],
    ["João", "a32de35d-2a0c-4d19-830b-7fffb472daca", 20.5, 13.5, 7],
    ["Luis", "1d5c940e-a587-4493-85dd-d37093899585", 15, 23, -8],
    ["Mariana", "fb2533bd-7a7f-4ba9-a2d0-238623277b73", 22, 0, 22],
    ["Patricia", "a88c0aeb-3358-4b46-965a-44b34d6053da", 23, 17, 6],
    ["Ricardo Conceição", "c376256c-f61b-4e3c-98c8-a0ab3bc67ac3", 16, 21, -5],
    ["Tatiana", "ca83d0c3-8bac-4bca-ad64-b49ca044d02d", 18, 11, 7],
  ] as const;
  for (const [name, id, total, counted, balance] of cases) it(name, async () => {
    const row = (await balances(2026)).find(b => b.collaborator_id === id);
    expect(row?.total).toBe(total);
    expect((row?.approved ?? NaN) + (row?.pending ?? NaN)).toBe(counted);
    expect(row?.balance).toBe(balance);
    expect((await balances(2027)).find(b => b.collaborator_id === id)?.carry_over).toBe(balance);
  });
  for (const [id, total, balance] of [["0391b2bb-e59a-43d9-9bad-df82988677d4",22,22],["ece2030e-2c07-47bb-b95e-d799ae99b335",22,22],["793f17d4-2fc7-42e9-a402-54d85539afdb",22,21]] as const) it(`unchanged ${id}`, async () => {
    const row = (await balances(2026)).find(b => b.collaborator_id === id);
    expect(row?.total).toBe(total); expect(row?.balance).toBe(balance);
  });
});

describe("disposable reference-date fixture", () => {
  it("whole pre-reference request is excluded; June boundary and approved/pending vacation count; sick/unpaid do not", async () => {
    const row = (await balances(2099)).find(b => b.collaborator_id === "eeeeeeee-0001-4000-8000-000000000001");
    expect(row?.total).toBe(18); expect(row?.approved).toBe(3); expect(row?.pending).toBe(2); expect(row?.balance).toBe(13);
  });
  it("corrected opening propagates to next-year carry-over", async () => {
    const row = (await balances(2100)).find(b => b.collaborator_id === "eeeeeeee-0001-4000-8000-000000000001");
    expect(row?.carry_over).toBe(13); expect(row?.total).toBe(35);
  });
});