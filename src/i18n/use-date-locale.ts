/**
 * useDateLocale — returns the date-fns locale matching the active i18n language.
 *
 * Used by date formatters (e.g. `format(d, "MMMM yyyy", { locale })`) so month
 * and weekday names follow the active UI language. Keep the import set narrow
 * so we don't pull every locale into the bundle.
 */
import { useTranslation } from "react-i18next";
import { enUS, pt } from "date-fns/locale";
import type { Locale } from "date-fns";

export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  const lang = i18n.language || "pt-PT";
  if (lang.toLowerCase().startsWith("en")) return enUS;
  return pt;
}
