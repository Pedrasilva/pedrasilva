export function projectClientName(companyName: string | null | undefined, legacyClient: string | null | undefined) {
  return companyName?.trim() || legacyClient?.trim() || null;
}