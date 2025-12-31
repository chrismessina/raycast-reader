/**
 * Summary style types for article summarization
 */
export type SummaryStyle = "overview" | "opposite-sides" | "five-ws" | "eli5" | "translated" | "entities";

/**
 * Supported languages for translation (ISO 639-1 codes)
 */
export type SupportedLanguage =
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "ja"
  | "zh-CN"
  | "zh-TW"
  | "ko"
  | "ru"
  | "ar"
  | "hi"
  | "nl"
  | "pl"
  | "sv"
  | "tr"
  | "vi"
  | "th"
  | "el"
  | "he";

/**
 * Options for translated summary style
 */
export interface TranslationOptions {
  language: SupportedLanguage;
  level?: "beginner" | "intermediate" | "advanced";
}

/**
 * Summary result from AI
 */
export interface SummaryResult {
  style: SummaryStyle;
  summary: string;
}
