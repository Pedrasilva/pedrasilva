import { describe, it, expect } from "vitest";
import { sortInbox } from "../src/lib/finance/intake-sort";
const rows = [
  { id: "a", extracted_date: "2026-01-05", extracted_amount: 10, extracted_seller_name: "Beta", created_at: "2026-02-01" },
  { id: "b", extracted_date: null, extracted_amount: null, extracted_seller_name: "alfa", created_at: "2026-03-01" },
  { id: "c", extracted_date: "2026-06-01", extracted_amount: 99, extracted_seller_name: "Zeta", created_at: "2026-01-01" },
];
const ids = (k: Parameters<typeof sortInbox>[1]) => sortInbox(rows, k).map((r) => r.id).join("");
describe("intake sort", () => {
  it("document date newest, missing last", () => expect(ids("doc_desc")).toBe("cab"));
  it("document date oldest, missing last", () => expect(ids("doc_asc")).toBe("acb"));
  it("arrival newest", () => expect(ids("arrived_desc")).toBe("bac"));
  it("name A-Z ignores case", () => expect(ids("name_asc")).toBe("bac"));
  it("amount highest, missing last", () => expect(ids("amount_desc")).toBe("cab"));
  it("amount lowest, missing last", () => expect(ids("amount_asc")).toBe("acb"));
  it("does not mutate input", () => { sortInbox(rows, "name_desc"); expect(rows[0].id).toBe("a"); });
});
