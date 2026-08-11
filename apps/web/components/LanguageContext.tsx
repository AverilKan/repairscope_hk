"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Lang, LocalizedText } from "@/domain/i18n";
import { localize } from "@/domain/i18n";

const LANGUAGE_STORAGE_KEY = "repairscope:language";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: LocalizedText) => string;
}

// Default (no provider in the tree) is plain English — used by surfaces
// that have not adopted bilingual rendering yet (e.g. the operator UI),
// so shared components like GeneratedBriefDocument work either way rather
// than requiring every host tree to add a provider.
const defaultLanguageContext: LanguageContextValue = {
  lang: "en",
  setLang: () => {},
  t: (text) => text.en,
};

const LanguageContext = createContext<LanguageContextValue>(defaultLanguageContext);

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

/**
 * Wraps the public intake/brief/confirmation surfaces. Deliberately a plain
 * setState toggle, not tied to any journey/route state — switching language
 * must never remount, reset, or navigate the questionnaire (see
 * domain/journey.ts and the HK-A0 rework's language-switch requirement), so
 * this provider must sit above journey-scoped components without any `key`
 * that would remount them on a language change.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // zh-Hant is the default — Traditional Chinese is first-class for the HK
  // pilot, not a secondary/afterthought locale.
  const [lang, setLangState] = useState<Lang>("zh");

  // Restore a previously chosen language after mount (localStorage is
  // unavailable during server rendering, so this can't run in useState's
  // initializer without a hydration mismatch).
  useEffect(() => {
    const timer = window.setTimeout(() => setLangState(readStoredLang()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore — preference just will not survive a reload
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t: (text) => localize(text, lang) }),
    [lang, setLang],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
