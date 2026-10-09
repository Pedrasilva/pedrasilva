/**
 * Platform suppliers (Uber, Bolt, taxi apps, Amazon). Receipts come from
 * many legal issuers (each TVDE operator, Amazon EU, marketplace sellers);
 * the platform supplier (companies.is_platform) groups them and the real
 * issuer is stored on each document (issuer_name / issuer_nif /
 * issuer_tax_country / issuer_foreign_tax_id).
 */
import { normalizePortugueseNif, isValidPortugueseNif } from "./nif";

export type PlatformKey = "uber" | "bolt" | "taxi" | "amazon";

const PATTERNS: Array<[PlatformKey, RegExp]> = [
  ["uber", /\buber\b|uber\s*eats|uber\s*b\.?v\.?|ubr\*/i],
  ["bolt", /\bbolt\b(?!\s*(&|e)\s)|bolt\.eu|bolt\s*operations/i],
  ["taxi", /\bt[aá]xis?\b|free\s*now|freenow|cabify|mytaxi/i],
  ["amazon", /\bamazon\b|amzn|amazon\s*business/i],
];

/** Which platform a receipt belongs to, from its text (names, filename, description). */
export function detectPlatform(...texts: Array<string | null | undefined>): PlatformKey | null {
  const t = texts.filter(Boolean).join(" \n ");
  if (!t) return null;
  for (const [k, re] of PATTERNS) if (re.test(t)) return k;
  return null;
}

/** Platform key of a platform supplier record, from its name. */
export function platformKeyOfName(name: string | null | undefined): PlatformKey | null {
  return detectPlatform(name);
}

/**
 * Split a printed tax number into the document's issuer columns.
 * Portuguese numbers (PT prefix, or 9 digits with a PT issuer) go to
 * issuer_nif only when they pass the check digit; others go to
 * issuer_foreign_tax_id.
 */
export function issuerTaxColumns(raw: string | null | undefined, country: string | null | undefined): {
  issuer_nif: string | null;
  issuer_tax_country: string | null;
  issuer_foreign_tax_id: string | null;
} {
  const v = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const c = (country ?? "").toUpperCase() || null;
  if (!v) return { issuer_nif: null, issuer_tax_country: c, issuer_foreign_tax_id: null };
  const digits = v.replace(/^PT/, "");
  if (/^\d{9}$/.test(digits) && (v.startsWith("PT") || !c || c === "PT")) {
    const n = normalizePortugueseNif(digits);
    return isValidPortugueseNif(n)
      ? { issuer_nif: n, issuer_tax_country: "PT", issuer_foreign_tax_id: null }
      : { issuer_nif: null, issuer_tax_country: "PT", issuer_foreign_tax_id: null };
  }
  const prefix = /^[A-Z]{2}/.test(v) ? v.slice(0, 2) : null;
  return { issuer_nif: null, issuer_tax_country: prefix ?? c, issuer_foreign_tax_id: v };
}
