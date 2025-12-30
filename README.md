# Reader Mode

Read the web distraction-free in Raycast.

## Features

- **Clean Reading Experience** - Extracts article content and removes distractions
- **AI Summaries** - Multiple summary styles powered by Raycast AI
- **Browser Extension Fallback** - Access blocked pages via the Raycast browser extension
- **Smart URL Detection** - Automatically detects URLs from arguments, clipboard, selection, or active browser tab

## Configuration

The extension uses a modular configuration system located in `src/config/`:

### AI Model Configuration (`ai.ts`)

Controls which AI model and creativity level is used for each summary style. This allows fine-tuning performance per summary type.

```typescript
export const AI_SUMMARY_CONFIG: Record<SummaryStyle, AIStyleConfig> = {
  overview: { model: AI.Model["OpenAI_GPT-5_nano"], creativity: "low" },
  "opposite-sides": { model: AI.Model["OpenAI_GPT-5_nano"], creativity: "low" },
  // ...
};
```

### Prompt Templates (`prompts.ts`)

Contains all summary prompt templates in one place for easy comparison and editing.

```typescript
export const SUMMARY_PROMPTS: Record<SummaryStyle, PromptConfig> = {
  overview: {
    label: "Overview",
    buildPrompt: (context) => `${context}\n\nSummarize this article...`,
  },
  // ...
};
```

Each prompt config includes:
- **`label`** - Human-readable name shown in the UI
- **`buildPrompt`** - Function that generates the full prompt from article context

### Summary Styles

| Style | Description |
|-------|-------------|
| **Overview** | One-liner summary + 3 key bullet points |
| **Opposite Sides** | Two contrasting viewpoints from the article |
| **The 5 Ws** | Who, What, Where, When, Why breakdown |
| **Explain Like I'm 5** | Simplified explanation using simple language |
| **Translated Overview** | Overview translated to a specified language |
| **People, Places & Things** | Key entities extracted with context |


## Handling Blocked Pages

Some websites (like Politico, Bloomberg, etc.) use bot detection that prevents direct content fetching. When this happens, Reader Mode automatically offers a browser extension fallback:

### How It Works

1. **Detection** - When a 403 "Access Denied" error occurs, Reader Mode checks if you have the Raycast browser extension installed
2. **Instructions** - Shows a friendly message with clear steps to access the content
3. **Browser Fallback** - You can open the page in your browser and fetch content via the extension

### Usage

When you encounter a blocked page:

1. Press **Enter** to open the URL in your browser
2. Wait for the page to fully load
3. Press **⌘ + R** to fetch the content via the Raycast browser extension
4. The article loads normally with full content

**Note:** Requires the [Raycast browser extension](https://www.raycast.com/browser-extension) to be installed.

## Known Issues

### Bracket Rendering
Square brackets `[text]` that appear in article content (such as editorial insertions in quotes) are automatically converted to parentheses `(text)` to prevent Raycast's markdown renderer from interpreting them as LaTeX math notation. This is a workaround for a rendering limitation and means the displayed text may differ slightly from the original source material.

### Image Rendering
Image alt text and title attributes are automatically stripped to ensure proper rendering in Raycast. Images are displayed as `![](url)` without descriptive text. This prevents rendering issues where long alt text or title attributes (especially those containing quotes) can break the markdown image syntax.

Additionally, relative image URLs (e.g., `/image.jpg`) are automatically converted to absolute URLs using the page's base URL to ensure images load properly.