export type SplitDrawers = { library: boolean; settings: boolean };

export function splitDrawerStorageKey(userId: string): string {
  return `psa.proposalComposer.splitDrawers.${userId}`;
}

export function parseSplitDrawers(value: string | null): SplitDrawers {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (parsed && typeof parsed === "object") {
      return {
        library: "library" in parsed && parsed.library === true,
        settings: "settings" in parsed && parsed.settings === true,
      };
    }
  } catch { /* Unavailable or outdated preferences default to closed. */ }
  return { library: false, settings: false };
}