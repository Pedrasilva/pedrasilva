/**
 * LanguageProvider — single source of truth for the app's active language.
 *
 * Behaviour:
 *   - Reads from `localStorage` immediately on mount so the UI never flashes
 *     in the wrong language.
 *   - When the user is authenticated, reads `collaborators.language_preference`
 *     and treats the backend value as authoritative (and overrides local cache).
 *   - On `setLanguage`, writes through to localStorage AND to the backend so
 *     the choice follows the user across devices.
 *
 * Children must call `useLanguage()` to read/write the language. The actual
 * string lookup is handled by `react-i18next`'s `useTranslation()` hook —
 * this provider only wires the lifecycle around it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import i18n, {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type SupportedLanguage,
} from "./index";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => {},
});

function readInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const cached = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(cached)) return cached;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("en")) return "en";
  if (nav.startsWith("pt")) return "pt-PT";
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => readInitialLanguage());

  // Apply the initial language to i18next (it may have been initialised before
  // the provider mounted with a different default).
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  // When the user signs in, the backend value wins. We also persist any local
  // override that's missing on the backend (best-effort fix-up).
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("collaborators")
        .select("language_preference")
        .ilike("email", user.email!)
        .maybeSingle();
      if (cancelled) return;
      const remote = (data as { language_preference?: string | null } | null)?.language_preference;
      if (isSupportedLanguage(remote) && remote !== language) {
        setLanguageState(remote);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LANGUAGE_STORAGE_KEY, remote);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only react to user changes, not to language changes, to
    // avoid flapping when the user selects a new value before the backend
    // round-trip resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const setLanguage = useCallback(
    async (next: SupportedLanguage) => {
      setLanguageState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      }
      await i18n.changeLanguage(next);
      if (user?.email) {
        // Best-effort; we don't surface the error to the user because the local
        // change already succeeded and the next sign-in will retry the sync.
        await supabase
          .from("collaborators")
          .update({ language_preference: next } as never)
          .ilike("email", user.email);
      }
    },
    [user?.email],
  );

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
