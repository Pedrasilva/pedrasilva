/**
 * Multi-country tax number (VAT / Tax ID) helpers.
 *
 * Portugal stays the default and keeps the strict mod-11 NIF checksum
 * (see `./nif.ts`). Other countries — EU + Middle East, our markets — are
 * validated leniently by pattern/length only: we warn, never block.
 */

import { normalizePortugueseNif, isValidPortugueseNif, formatPortugueseNif } from "./nif";

export type TaxCountry = {
  code: string;
  /** Portuguese label shown in the picker. */
  label: string;
  /** Optional lenient pattern applied to the normalized value. */
  pattern?: RegExp;
  /** Example shown as the input placeholder. */
  example?: string;
};

/** EU member states + Middle East markets, Portugal first. */
export const TAX_COUNTRIES: TaxCountry[] = [
  { code: "PT", label: "Portugal", example: "500 000 000" },
  { code: "AT", label: "Áustria", pattern: /^U\d{8}$/, example: "U12345678" },
  { code: "BE", label: "Bélgica", pattern: /^0\d{9}$/, example: "0123456789" },
  { code: "BG", label: "Bulgária", pattern: /^\d{9,10}$/ },
  { code: "HR", label: "Croácia", pattern: /^\d{11}$/ },
  { code: "CY", label: "Chipre", pattern: /^\d{8}[A-Z]$/ },
  { code: "CZ", label: "Chéquia", pattern: /^\d{8,10}$/ },
  { code: "DK", label: "Dinamarca", pattern: /^\d{8}$/ },
  { code: "EE", label: "Estónia", pattern: /^\d{9}$/ },
  { code: "FI", label: "Finlândia", pattern: /^\d{8}$/ },
  { code: "FR", label: "França", pattern: /^[A-Z0-9]{2}\d{9}$/ },
  { code: "DE", label: "Alemanha", pattern: /^\d{9}$/ },
  { code: "GR", label: "Grécia", pattern: /^\d{9}$/ },
  { code: "HU", label: "Hungria", pattern: /^\d{8}$/ },
  { code: "IE", label: "Irlanda", pattern: /^(\d{7}[A-Z]{1,2}|\d[A-Z0-9]\d{5}[A-Z])$/, example: "4204578KH" },
  { code: "IT", label: "Itália", pattern: /^\d{11}$/ },
  { code: "LV", label: "Letónia", pattern: /^\d{11}$/ },
  { code: "LT", label: "Lituânia", pattern: /^(\d{9}|\d{12})$/ },
  { code: "LU", label: "Luxemburgo", pattern: /^\d{8}$/ },
  { code: "MT", label: "Malta", pattern: /^\d{8}$/ },
  { code: "NL", label: "Países Baixos", pattern: /^\d{9}B\d{2}$/, example: "123456789B01" },
  { code: "PL", label: "Polónia", pattern: /^\d{10}$/ },
  { code: "RO", label: "Roménia", pattern: /^\d{2,10}$/ },
  { code: "SK", label: "Eslováquia", pattern: /^\d{10}$/ },
  { code: "SI", label: "Eslovénia", pattern: /^\d{8}$/ },
  { code: "ES", label: "Espanha", pattern: /^[A-Z0-9]\d{7}[A-Z0-9]$/ },
  { code: "SE", label: "Suécia", pattern: /^\d{12}$/ },
  // Non-EU Europe / common trading partners
  { code: "GB", label: "Reino Unido", pattern: /^(\d{9}|\d{12}|(GD|HA)\d{3})$/ },
  { code: "CH", label: "Suíça", pattern: /^CHE\d{9}(MWST|TVA|IVA)?$/ },
  { code: "NO", label: "Noruega", pattern: /^\d{9}(MVA)?$/ },
  // Middle East
  { code: "AE", label: "Emirados Árabes Unidos", pattern: /^\d{15}$/ },
  { code: "SA", label: "Arábia Saudita", pattern: /^\d{15}$/ },
  { code: "QA", label: "Catar", pattern: /^\d{5,12}$/ },
  { code: "KW", label: "Koweit", pattern: /^\d{5,12}$/ },
  { code: "BH", label: "Barém", pattern: /^\d{15}$/ },
  { code: "OM", label: "Omã", pattern: /^[A-Z0-9]{8,15}$/ },
  { code: "IL", label: "Israel", pattern: /^\d{9}$/ },
  { code: "JO", label: "Jordânia", pattern: /^\d{5,12}$/ },
  { code: "LB", label: "Líbano", pattern: /^\d{5,12}$/ },
  { code: "EG", label: "Egipto", pattern: /^\d{9}$/ },
  { code: "TR", label: "Turquia", pattern: /^\d{10}$/ },
  { code: "OTHER", label: "Outro país", pattern: /^[A-Z0-9]{4,20}$/ },
];

export const DEFAULT_TAX_COUNTRY = "PT";

export function findTaxCountry(code: string | null | undefined): TaxCountry {
  const c = (code ?? DEFAULT_TAX_COUNTRY).toUpperCase();
  return TAX_COUNTRIES.find((x) => x.code === c) ?? TAX_COUNTRIES[TAX_COUNTRIES.length - 1];
}

/**
 * Normalize a tax number for the given country.
 * PT keeps digit-only normalization; other countries keep letters
 * (uppercased) and drop separators plus a leading country prefix.
 */
export function normalizeTaxId(
  value: string | null | undefined,
  country: string | null | undefined,
): string | null {
  if (!value) return null;
  const code = (country ?? DEFAULT_TAX_COUNTRY).toUpperCase();
  if (code === "PT") return normalizePortugueseNif(value);
  let cleaned = String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code !== "OTHER" && cleaned.startsWith(code)) cleaned = cleaned.slice(code.length);
  return cleaned.length === 0 ? null : cleaned;
}

export type TaxIdCheck = { ok: boolean; normalized: string | null; message?: string };

/** Never blocking — a failed check is only a warning for the user. */
export function checkTaxId(
  value: string | null | undefined,
  country: string | null | undefined,
): TaxIdCheck {
  const code = (country ?? DEFAULT_TAX_COUNTRY).toUpperCase();
  const normalized = normalizeTaxId(value, code);
  if (!normalized) return { ok: true, normalized: null };

  if (code === "PT") {
    return isValidPortugueseNif(normalized)
      ? { ok: true, normalized }
      : {
          ok: false,
          normalized,
          message: `NIF ${normalized} não passa a validação portuguesa (dígito de controlo).`,
        };
  }

  const def = findTaxCountry(code);
  if (def.pattern && !def.pattern.test(normalized)) {
    return {
      ok: false,
      normalized,
      message: `O formato ${normalized} não corresponde ao habitual em ${def.label}. Verifique — pode guardar assim mesmo.`,
    };
  }
  return { ok: true, normalized };
}

/** Display helper: PT gets the 3-3-3 grouping, others show the prefixed form. */
export function formatTaxId(
  value: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const code = (country ?? DEFAULT_TAX_COUNTRY).toUpperCase();
  if (code === "PT") return formatPortugueseNif(value);
  const normalized = normalizeTaxId(value, code);
  if (!normalized) return null;
  return code === "OTHER" ? normalized : `${code}${normalized}`;
}
