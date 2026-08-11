export type Lang = "zh" | "en";

/** Every user-facing questionnaire/brief string carries both languages together. */
export interface LocalizedText {
  zh: string;
  en: string;
}

export function localize(text: LocalizedText, lang: Lang): string {
  return lang === "zh" ? text.zh : text.en;
}

export function lt(zh: string, en: string): LocalizedText {
  return { zh, en };
}
