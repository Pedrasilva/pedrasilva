/**
 * i18n bootstrap for the application.
 *
 * Phase 1 of the standardisation: English is the source language and Portuguese
 * (pt-PT) is the primary translation. Additional namespaces and modules will be
 * added in later phases (CRM, HR, etc).
 *
 * Initialisation strategy:
 *   1. Read cached language from localStorage (fast UI boot).
 *   2. Fall back to navigator.language.
 *   3. Final fallback is Portuguese (pt-PT) per project default.
 *
 * Backend persistence (collaborators.language_preference) is handled by the
 * `LanguageProvider` after auth resolves — it overrides the local cache when
 * authoritative.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enCrm from "./locales/en/crm.json";
import enGlossary from "./locales/en/glossary.json";
import enHome from "./locales/en/home.json";
import enHr from "./locales/en/hr.json";
import enProjects from "./locales/en/projects.json";
import ptCommon from "./locales/pt-PT/common.json";
import ptCrm from "./locales/pt-PT/crm.json";
import ptGlossary from "./locales/pt-PT/glossary.json";
import ptHome from "./locales/pt-PT/home.json";
import ptHr from "./locales/pt-PT/hr.json";
import ptProjects from "./locales/pt-PT/projects.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-PT"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "pt-PT";
export const LANGUAGE_STORAGE_KEY = "psa.language";

export const resources = {
  en: {
    common: enCommon,
    glossary: enGlossary,
    projects: enProjects,
    crm: enCrm,
    hr: enHr,
    home: enHome,
  },
  "pt-PT": {
    common: ptCommon,
    glossary: ptGlossary,
    projects: ptProjects,
    crm: ptCrm,
    hr: ptHr,
    home: ptHome,
  },
} as const;

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      ns: ["common", "glossary", "projects", "crm", "hr", "home"],
      defaultNS: "common",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ["localStorage"],
      },
      returnNull: false,
    });
}

export default i18n;
