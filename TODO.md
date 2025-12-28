# Reader Extension — Implementation TODO

> **Goal:** Build a Raycast extension that renders web content in a clean, distraction-free Markdown view with optional AI summarization.

---

## Phase 1: Foundation

### 1.1 Project Setup
- [x] Install core dependencies:
  ```bash
  npm install @mozilla/readability turndown turndown-plugin-gfm jsdom @chrismessina/raycast-logger
  npm install -D @types/turndown
  ```
- [x] Add `verboseLogging` preference to `package.json`
- [x] Create `src/utils/logger.ts` with component-specific loggers:
  - `urlLog` — URL resolution events
  - `fetchLog` — HTTP fetch events
  - `parseLog` — Readability/Turndown parsing events
  - `aiLog` — AI summarization events

### 1.2 Command Configuration
- [x] Update `package.json` command to accept URL argument:
  ```json
  {
    "name": "open",
    "title": "Open Reader",
    "arguments": [
      {
        "name": "url",
        "type": "text",
        "placeholder": "https://example.com/article",
        "required": false
      }
    ]
  }
  ```
- [x] Add fallback input sources (priority order):
  1. Command argument
  2. Selected text (if valid URL)
  3. Clipboard (if valid URL)
  4. Browser extension (current tab)
- [x] Add logging for URL resolution:
  - `session:start` — command invoked
  - `resolve:try/success/skip` — each source attempt
  - `session:ready/error` — final outcome

### 1.3 Basic Fetch & Display
- [ ] Create `src/utils/fetcher.ts` — fetch HTML from URL
- [ ] Handle basic errors (network, 4xx, 5xx, robots.txt rejection)
- [ ] Display raw HTML in `<Detail>` as proof of concept
- [ ] Add logging for fetch operations:
  - `fetch:start` — request initiated with URL
  - `fetch:success` — response received with status, content length
  - `fetch:error` — failure with error type, status code

**Milestone:** Extension accepts URL and displays fetched content.

---

## Phase 2: Content Processing

### 2.1 Readability Integration
- [ ] Create `src/utils/readability.ts`
- [ ] Implement `isProbablyReaderable()` pre-check
- [ ] Parse with `new Readability(document).parse()`
- [ ] Extract: `title`, `content`, `byline`, `siteName`, `excerpt`
- [ ] Add logging for readability:
  - `parse:precheck` — isProbablyReaderable result
  - `parse:start` — parsing initiated
  - `parse:success` — extracted fields summary (title, content length, has byline)
  - `parse:error` — parsing failure details

### 2.2 Turndown Conversion
- [ ] Create `src/utils/markdown.ts`
- [ ] Configure TurndownService with sensible defaults:
  ```typescript
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(gfm); // tables, strikethrough, task lists
  ```
- [ ] Add custom rules if needed (e.g., strip remaining ads/tracking elements)
- [ ] Add logging for markdown conversion:
  - `parse:markdown:start` — conversion initiated
  - `parse:markdown:success` — output length, heading count
  - `parse:markdown:error` — conversion failure

### 2.3 Detail View Rendering
- [ ] Compose Markdown output:
  ```markdown
  # {title}
  
  *{byline} · {siteName}*
  
  ---
  
  {content}
  ```
- [ ] Render in `<Detail markdown={...} />`

**Milestone:** Clean article content displays in Raycast.

---

## Phase 3: AI Summarization

### 3.1 Raycast AI Integration
- [ ] Research Raycast AI API for summarization
- [ ] Create `src/utils/summarizer.ts`
- [ ] Implement summary generation from article content
- [ ] Add logging for AI summarization:
  - `ai:start` — summarization initiated with style, content length
  - `ai:success` — summary generated with length, style
  - `ai:error` — AI failure with error details

### 3.2 Summary Styles
- [ ] Implement summary style prompts:
  | Style | Prompt Pattern |
  |-------|----------------|
  | **Overview** | One-liner + 3 bullet points of key info |
  | **Opposite Sides** | Two contrasting viewpoints from the article |
  | **The 5 Ws** | Who, What, Where, When, Why |
  | **Explain Like I'm 5** | Simplified language explanation |
  | **Translated Overview** | Overview in selected language + level |
  | **People, Places, & Things** | Key entities with brief context |

### 3.3 Summary Display
- [ ] Add summary block at top of Detail view:
  ```markdown
  # {title}
  
  > **Summary ({style})**
  > {one-liner}
  > - {bullet 1}
  > - {bullet 2}
  > - {bullet 3}
  
  ---
  
  {content}
  ```
- [ ] Handle loading state while summary generates

**Milestone:** Articles display with AI-generated summaries.

---

## Phase 4: Polish & Actions

### 4.1 Preferences
- [ ] Add all preferences to `package.json`:
  | Preference | Type | Default | Description |
  |------------|------|---------|-------------|
  | `showSummary` | checkbox | `true` | Show AI summary at top |
  | `summaryStyle` | dropdown | `overview` | Default summary style |
  | `preCheckReadability` | checkbox | `true` | Skip if content unlikely readable |
  | `verboseLogging` | checkbox | `false` | Enable debug logging |

### 4.2 Actions
- [ ] Implement action panel:
  - **Copy as Markdown** (primary) — full article as Markdown
  - **Copy Summary** — just the summary text
  - **Open in Browser** — open original URL
  - **Copy URL** — copy source URL to clipboard

### 4.3 Error Handling
- [ ] Handle edge cases:
  | Scenario | Behavior |
  |----------|----------|
  | No URL provided | Show form to enter URL |
  | Invalid URL | Show error with suggestion |
  | Fetch failed (network) | "Unable to reach URL" |
  | Fetch failed (403/451) | "Access denied" or "Unavailable for legal reasons" |
  | Not readable (pre-check) | "This page doesn't appear to have article content" with bypass option |
  | Readability parse failed | "Unable to extract content" with option to view raw |
  | Empty content | "No content found" |

### 4.4 Loading States
- [ ] Show loading indicator while fetching
- [ ] Show loading indicator while generating summary
- [ ] Graceful degradation if summary fails (show content without summary)

**Milestone:** Production-ready extension with full feature set.

---

## Phase 5: Future Enhancements (v2+)

> Out of scope for v1, but worth tracking:

- [ ] Caching strategy for recently viewed articles
- [ ] Offline reading (save articles locally)
- [ ] Reading list integration
- [ ] Custom CSS/theming for Detail view
- [ ] Export to other formats (PDF, EPUB)
- [ ] Integration with read-later services (Pocket, Instapaper, Omnivore)
- [ ] Keyboard shortcuts for summary style switching

---

## Dependencies Summary

### Production
| Package | Purpose |
|---------|---------|
| `@mozilla/readability` | Content extraction & cleaning |
| `turndown` | HTML → Markdown conversion |
| `turndown-plugin-gfm` | GFM support (tables, etc.) |
| `jsdom` | DOM parsing in Node.js |
| `@chrismessina/raycast-logger` | Structured logging |

### Development
| Package | Purpose |
|---------|---------|
| `@types/turndown` | TypeScript definitions |

---

## Open Questions

1. **Raycast AI API**: How do we call Raycast AI for summarization? Need to research the API.
2. ~~**Browser Extension**: How do we get the current tab URL from Raycast Browser Extension?~~ ✅ Resolved: Use `BrowserExtension.getTabs()` and find active tab
3. **Rate Limiting**: Should we add any throttling for rapid URL fetches?
4. **Image Handling**: Should we strip images, keep them, or convert to placeholders?

---

## References

- [Mozilla Readability](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)
- [Raycast API Docs](https://developers.raycast.com)
- [Logger Integration Guide](./docs/logger-integration.md)
- [Extension Spec](./docs/about.md)
