/** Numeric storage ordinals are independent of document-language labels. */
export function revisionLetters(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error('Invalid revision ordinal');
  let result = '';
  for (let n = ordinal; n > 0;) {
    n -= 1;
    result = String.fromCharCode(65 + n % 26) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

export function workReference(number: string, version = '', ordinal = 0): string {
  return number + (version ? `-${version}` : '') + revisionLetters(ordinal);
}

export function annualWorkNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('Invalid annual work number');
  }
  return String(year).slice(-2) + String(sequence).padStart(3, '0');
}

export function restartKey(year: number, ordinal = 1): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isInteger(ordinal) || ordinal < 1) throw new Error('Invalid restart');
  return String(year).slice(-2) + (ordinal > 1 ? `-${String(ordinal).padStart(2, '0')}` : '');
}

export type WorkView = {
  mapped: boolean;
  reference: string | null;
  workId?: string;
  versionId?: string;
  canonicalNumber?: string;
  folder?: string;
  versionKey?: string;
  revision?: number;
  canEdit: boolean;
};