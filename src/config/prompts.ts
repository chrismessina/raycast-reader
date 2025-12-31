import { SummaryStyle, TranslationOptions } from "../types/summary";

/**
 * Prompt configuration for each summary style
 */
interface PromptConfig {
  label: string;
  buildPrompt: (context: string, options?: TranslationOptions) => string;
}

/**
 * Build the base context string for prompts
 */
export function buildBaseContext(title: string, content: string): string {
  return `Article Title: "${title}"\n\nArticle Content:\n${content}`;
}

/**
 * Summary prompts configuration
 * Each style has a label and a function to build the prompt
 */
export const SUMMARY_PROMPTS: Record<SummaryStyle, PromptConfig> = {
  overview: {
    label: "Overview",
    buildPrompt: (context) => `${context}

Summarize this article with:
1. A single one-liner summary (one sentence capturing the main point)
2. Three bullet points highlighting the key information

Format your response EXACTLY like this:
[one-liner summary]

- [key point 1]
- [key point 2]
- [key point 3]`,
  },

  "opposite-sides": {
    label: "Opposite Sides",
    buildPrompt: (context) => `${context}

Analyze this article and present two contrasting viewpoints or perspectives that emerge from or relate to the content. If the article itself presents opposing views, summarize them. If not, identify the main argument and present a reasonable counterargument.

Format your response EXACTLY like this:
**Perspective A:** [first viewpoint summary]

**Perspective B:** [contrasting viewpoint summary]`,
  },

  "five-ws": {
    label: "The 5 Ws",
    buildPrompt: (context) => `${context}

Summarize this article using the 5 Ws framework. Extract the key information for each category. If any category is not applicable or not mentioned, indicate "Not specified."

Format your response EXACTLY like this:
- **Who:** [who is involved]
- **What:** [what happened or is being discussed]
- **Where:** [where it takes place]
- **When:** [when it happened or is happening]
- **Why:** [why it matters or the reason behind it]`,
  },

  eli5: {
    label: "Explain Like I'm 5",
    buildPrompt: (context) => `${context}

Explain this article in very simple terms that a 5-year-old could understand. Use simple words, short sentences, and relatable analogies. Avoid jargon and technical terms.

Format your response as a simple, friendly explanation in 2-3 short paragraphs.`,
  },

  translated: {
    label: "Translated Overview",
    buildPrompt: (context, options) => {
      const lang = options?.language || "Spanish";
      const level = options?.level || "intermediate";
      return `${context}

Provide an overview summary of this article translated into ${lang} at a ${level} language level.

Format your response EXACTLY like this:
**Summary (${lang}):** [one-liner summary in ${lang}]

- [key point 1 in ${lang}]
- [key point 2 in ${lang}]
- [key point 3 in ${lang}]`;
    },
  },

  entities: {
    label: "People, Places & Things",
    buildPrompt: (context) => `${context}

Extract and list the key entities (people, places, and things) mentioned in this article. For each entity, provide brief context about their relevance to the article.

Format your response EXACTLY like this:
**People:**
- **[Name]:** [brief context]

**Places:**
- **[Location]:** [brief context]

**Things:**
- **[Entity]:** [brief context]

If a category has no relevant entities, you may omit it.`,
  },
};

/**
 * Default/fallback prompt for unknown styles
 */
export const DEFAULT_PROMPT = {
  label: "Summary",
  buildPrompt: (context: string) => `${context}

Summarize this article concisely.`,
};

/**
 * Get prompt config for a style, with fallback to default
 */
export function getPromptConfig(style: SummaryStyle): PromptConfig {
  return SUMMARY_PROMPTS[style] ?? DEFAULT_PROMPT;
}

/**
 * Get the label for a summary style
 */
export function getStyleLabel(style: SummaryStyle): string {
  return getPromptConfig(style).label;
}

/**
 * Build the full prompt for a given style
 */
export function buildPromptForStyle(
  style: SummaryStyle,
  title: string,
  content: string,
  translationOptions?: TranslationOptions,
): string {
  const context = buildBaseContext(title, content);
  const config = getPromptConfig(style);
  return config.buildPrompt(context, translationOptions);
}
