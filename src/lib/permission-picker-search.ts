/** Display-only matching; never used for authorization. */
export function normalizePickerSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function matchesPickerSearch(query: string, labels: readonly string[]): boolean {
  const haystack = normalizePickerSearch(labels.join(' '));
  return normalizePickerSearch(query).split(/\s+/).every(word => haystack.includes(word));
}