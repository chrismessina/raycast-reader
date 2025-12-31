/**
 * Summary style types for article summarization
 */
export type SummaryStyle = "overview" | "opposite-sides" | "five-ws" | "eli5" | "translated" | "entities";

/**
 * Options for translated summary style
 */
export interface TranslationOptions {
  language: string;
  level?: "beginner" | "intermediate" | "advanced";
}

/**
 * Summary result from AI
 */
export interface SummaryResult {
  style: SummaryStyle;
  summary: string;
}
