/**
 * Portuguese NIF (Número de Identificação Fiscal) helpers.
 *
 * Format: 9 digits. The 9th digit is a mod-11 checksum of the first 8.
 * Valid leading digits indicate the type of entity (1,2,3 = individual;
 * 5 = company; 6 = public entity; 8 = sole trader; 45/70/71/72/74/75/77/79/90/91/98/99 = other).
 */

export function normalizePortugueseNif(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = String(value)
    .trim()
    .toUpperCase()
    .replace(/^PT/, "")
    .replace(/\D/g, "");
  return cleaned.length === 0 ? null : cleaned;
}

const VALID_FIRST_DIGITS = ["1", "2", "3", "5", "6", "8", "9"];
const VALID_FIRST_TWO = ["45", "70", "71", "72", "74", "75", "77", "79", "90", "91", "98", "99"];

export function isValidPortugueseNif(value: string | null | undefined): boolean {
  const nif = normalizePortugueseNif(value);
  if (!nif || nif.length !== 9) return false;
  if (!/^\d{9}$/.test(nif)) return false;

  const first = nif[0];
  const firstTwo = nif.slice(0, 2);
  if (!VALID_FIRST_DIGITS.includes(first) && !VALID_FIRST_TWO.includes(firstTwo)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === Number(nif[8]);
}

export function formatPortugueseNif(value: string | null | undefined): string | null {
  const nif = normalizePortugueseNif(value);
  if (!nif || nif.length !== 9) return nif;
  return `${nif.slice(0, 3)} ${nif.slice(3, 6)} ${nif.slice(6, 9)}`;
}
