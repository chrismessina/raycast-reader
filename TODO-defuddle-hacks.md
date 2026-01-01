# Defuddle-Inspired Improvements

After evaluating Defuddle, we've decided to stick with Readability for content extraction but cherry-pick valuable features from Defuddle's approach. This document outlines the improvements to make.

## Why Not Full Defuddle Migration?

- **linkedom limitations**: Can't use Defuddle's markdown conversion (requires jsdom)
- **Content isolation**: Readability's scoring algorithm produces cleaner output for generic articles
- **Existing architecture**: Our html-cleaner.ts + quirks.ts approach is already well-suited

## What We're Taking From Defuddle

1. **Schema.org metadata extraction** - Better author, publish date, site name detection
2. **Site-specific extractors** - Convert to quirks for Twitter, YouTube, GitHub, HN, etc.
3. **Improved selector patterns** - Additional cleanup selectors from Defuddle's constants

---

## Phase 1: Schema.org Metadata Extraction

Add schema.org/JSON-LD parsing to extract richer metadata before Readability processing.

### 1.1 Create Metadata Extractor
- [x] Create `src/utils/metadata-extractor.ts`
- [x] Parse `<script type="application/ld+json">` tags
- [x] Extract from schema.org types: Article, NewsArticle, BlogPosting, WebPage
- [x] Handle nested schema (e.g., `author.name`, `publisher.name`)

### 1.2 Metadata Fields to Extract
- [x] `author` - from schema `author.name` or `author[].name`
- [x] `published` - from schema `datePublished`
- [x] `modified` - from schema `dateModified`
- [x] `siteName` - from schema `publisher.name` or `WebSite.name`
- [x] `description` - from schema `description`
- [x] `image` - from schema `image` or `thumbnailUrl`

### 1.3 Fallback Chain
Implement fallback priority for each field:
```
1. Schema.org JSON-LD
2. Open Graph meta tags (og:*)
3. Twitter meta tags (twitter:*)
4. Standard meta tags (author, description)
5. HTML elements ([itemprop], .author, etc.)
```

### 1.4 Integration
- [x] Call metadata extractor before Readability parsing
- [x] Merge extracted metadata with Readability output
- [x] Update `ArticleContent` interface if needed

**Milestone:** Richer metadata for articles without changing content extraction.

---

## Phase 2: Site-Specific Quirks from Defuddle Extractors

Convert Defuddle's site extractors to our quirks model. Focus on sites that benefit from custom handling.

### 2.1 Hacker News Quirk
Source: `defuddle/src/extractors/hacker-news.ts`
- [x] Add `news.ycombinator.com` to quirks.ts
- [x] `articleSelector`: `.fatitem` for main content
- [x] `removeSelectors`: Navigation, footer, vote elements, forms
- [x] Handle comment threads vs story pages (via comprehensive removeSelectors)
- [ ] Extract: title, author, points, comment count (metadata extractor handles this)

### 2.2 GitHub Issues/PRs Quirk
Source: `defuddle/src/extractors/github.ts`
- [x] Add `github.com` to quirks.ts
- [x] `articleSelector`: `[data-testid="issue-viewer-issue-container"], .markdown-body, .js-comment-body`
- [x] Extract: issue title, author, body, comments (via Schema.org + metadata extractor)
- [x] Handle both Issues and Pull Requests
- [x] Clean up React UI artifacts (buttons, menus, labels, etc.)

### 2.3 YouTube Quirk
Source: `defuddle/src/extractors/youtube.ts`
- [x] Add `youtube.com`, `youtu.be` to quirks.ts
- [x] Extract video description from schema.org VideoObject (via metadata extractor)
- [x] Get: title, channel name, upload date, description (via preferSchemaOrg)
- [x] Note: Video embed won't work in Raycast, but description is useful

### 2.4 Twitter/X Quirk (Limited Value)
Source: `defuddle/src/extractors/twitter.ts`
- [x] Evaluate: Most Twitter content requires auth - **SKIPPED** (auth barriers make this impractical)
- [ ] ~~If useful: Extract tweet text, author, date from available HTML~~
- [x] Consider: Not worth implementing due to auth barriers

### 2.5 Reddit Quirk
Not in Defuddle, but commonly requested:
- [x] Add `reddit.com`, `old.reddit.com` to quirks.ts
- [x] `articleSelector`: Post content area (multiple selectors for new/old Reddit)
- [x] Handle: self posts vs link posts (via comprehensive selectors)
- [x] Extract: title, subreddit, author, score (via Schema.org + metadata extractor)

**Milestone:** Better handling for developer-focused sites.

---

## Phase 3: Enhanced Cleanup Selectors

Add cleanup patterns from Defuddle's constants that we're missing.

### 3.1 Review Defuddle's Selector Lists
Source: `defuddle/src/constants.ts`
- [x] Compare `EXACT_SELECTORS` with our NEGATIVE_SELECTORS
- [x] Compare `PARTIAL_SELECTORS` with our partial matches
- [x] Identify gaps in our coverage

### 3.2 Add Missing Patterns
Categories to check:
- [x] Cookie consent banners (additional patterns)
- [x] GDPR notices
- [x] Print/PDF buttons (noprint, print-only)
- [x] Reading time indicators (via meta selectors)
- [x] Author bio boxes (when redundant with byline)
- [x] "Read more" teasers
- [x] Survey/feedback prompts

### 3.3 Platform-Specific Cleanup
- [x] Medium: claps, responses count, member-only indicators (via quirks)
- [x] Substack: subscribe buttons, like counts (pencraft selector)
- [x] WordPress: comment forms, pingbacks (form, sharedaddy)
- [x] Ghost: portal buttons, membership CTAs (via quirks)

**Milestone:** Cleaner output across more sites.

---

## Phase 4: Open Graph & Twitter Card Fallbacks

Improve metadata extraction from social meta tags.

**Note:** These were implemented as part of Phase 1 in `metadata-extractor.ts`.

### 4.1 Open Graph Tags
- [x] `og:title` - fallback for title
- [x] `og:description` - fallback for excerpt
- [x] `og:image` - article image
- [x] `og:site_name` - publisher name
- [ ] `og:type` - article type detection (not needed for current use case)
- [x] `og:url` - canonical URL
- [x] `article:author` - author
- [x] `article:published_time` - publish date

### 4.2 Twitter Card Tags
- [x] `twitter:title`
- [x] `twitter:description`
- [x] `twitter:image`
- [x] `twitter:creator` - author handle
- [x] `twitter:site` - site handle

### 4.3 Standard Meta Tags
- [x] `<meta name="author">`
- [x] `<meta name="description">`
- [x] `<link rel="canonical">` (for favicon URL resolution)
- [ ] `<meta name="keywords">` (low priority - skipped)

**Milestone:** Comprehensive metadata from all available sources.

---

## Implementation Notes

### File Structure
```
src/utils/
├── metadata-extractor.ts  (new)
├── schema-parser.ts       (new, if needed)
├── quirks.ts              (expand)
├── html-cleaner.ts        (expand selectors)
└── readability.ts         (integrate metadata)
```

### Testing Strategy
- Use existing test URLs from `docs/test-urls.md`
- Add site-specific test cases for new quirks
- Compare metadata extraction before/after changes

### Priority Order
1. **Phase 1** (Schema.org) - Highest value, broadly applicable
2. **Phase 3** (Selectors) - Quick wins, improves all sites
3. **Phase 2** (Quirks) - Site-specific, implement as needed
4. **Phase 4** (OG/Twitter) - Nice to have, lower priority

---

## References

- Defuddle source: https://github.com/kepano/defuddle
- Schema.org Article: https://schema.org/Article
- Open Graph Protocol: https://ogp.me/
- Twitter Cards: https://developer.twitter.com/en/docs/twitter-for-websites/cards
