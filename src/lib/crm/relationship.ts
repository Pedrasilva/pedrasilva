/**
 * Single source of truth for how an individual `companies` record is labelled
 * in the UI.
 *
 * Rule: never show the generic word "Company"/"Empresa" on an individual
 * record. The per-record label is driven by the relationship type
 * (client / supplier / both). "Empresas" stays valid as the plural /
 * navigational term only.
 */

export type Relationship = "client" | "supplier" | "both" | "uncategorized";

type RelationshipSource = {
  relationship_type?: string | null;
  is_client?: boolean | null;
  is_supplier?: boolean | null;
};

/** Resolve the relationship, falling back to the boolean role flags. */
export function relationshipOf(c: RelationshipSource | null | undefined): Relationship {
  if (!c) return "uncategorized";
  const rt = c.relationship_type;
  if (rt === "client" || rt === "supplier" || rt === "both") return rt;
  if (c.is_client && c.is_supplier) return "both";
  if (c.is_client) return "client";
  if (c.is_supplier) return "supplier";
  return "uncategorized";
}

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  client: "Cliente",
  supplier: "Fornecedor",
  both: "Cliente e Fornecedor",
  uncategorized: "Sem categoria",
};

/** Per-record display label, e.g. "Cliente" / "Fornecedor". */
export function relationshipLabel(c: RelationshipSource | null | undefined): string {
  return RELATIONSHIP_LABEL[relationshipOf(c)];
}

/** Which side of the ledger the statement should use for this record. */
export function statementSideOf(c: RelationshipSource | null | undefined): "client" | "supplier" {
  return relationshipOf(c) === "supplier" ? "supplier" : "client";
}

export function relationshipVariant(
  r: Relationship,
): "default" | "secondary" | "outline" | "destructive" {
  if (r === "client") return "default";
  if (r === "supplier") return "secondary";
  if (r === "both") return "outline";
  return "destructive";
}
