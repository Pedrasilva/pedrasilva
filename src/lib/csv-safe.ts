/** Neutralize spreadsheet formula injection: prefix formula-leading cells with an apostrophe. */
export function csvSafeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
}
