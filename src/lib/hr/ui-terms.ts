import i18n from "@/i18n/index";

/** Explicit first-occurrence flag keeps glossary glosses deterministic, including SSR. */
export function payrollTerm(key: string, firstAppearance = false): string {
  const label = i18n.t(`glossary:hr.${key}`);
  if (!firstAppearance || !i18n.language.startsWith("en")) return label;
  const canonical = i18n.t(`glossary:ptCanonical.${key}`);
  return `${label} (${canonical})`;
}

export function allowanceLabel(value: string): string {
  return i18n.t(`hr:snapshot.allowanceModes.${value}.label`);
}

export function allowanceHint(value: string): string {
  return i18n.t(`hr:snapshot.allowanceModes.${value}.hint`);
}