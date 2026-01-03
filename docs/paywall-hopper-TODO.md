# Paywall Hopper — Implementation TODO

> **Feature:** Fallback content retrieval for paywalled articles  
> **Spec:** [paywall-hopper.md](./paywall-hopper.md)  
> **Branch:** `paywall-hopper`

---

## Phase 1: Foundation

### 1.1 Paywall Detection Module (Standalone)

> **Architecture Decision:** Paywall detection is implemented as standalone utility functions
> in `src/extractors/_paywall.ts` rather than extending `BaseExtractor`. This keeps the
> Paywall Hopper feature cleanly separated and easy to remove if needed.

- [x] Create `src/extractors/_paywall.ts` with standalone utility functions
- [x] Define paywall detection constants:
  - `MIN_ARTICLE_LENGTH` (500 chars)
  - `TRUNCATION_PATTERNS` regex array
  - `PAYWALL_KEYWORDS` regex array
  - `PAYWALL_SELECTORS` string array
  - `SITE_PAYWALL_SELECTORS` record for site-specific selectors
- [x] Export `PaywallDetectionResult` interface
- [x] Export `detectPaywall(document, url, textContent)` function
- [x] Export `getSitePaywallSelectors(url)` helper
- [x] Export `isKnownPaywalledSite(url)` helper

### 1.2 Generic Paywall Detection

- [x] Implement generic heuristics in `detectPaywall()`:
  - [x] Short content detection (< 500 chars)
  - [x] Truncation marker detection ("Continue reading...", ellipsis, etc.)
  - [x] Paywall keyword detection ("Subscribe", "Members only", etc.)
  - [x] Paywall overlay element detection (`[class*="paywall"]`, etc.)

### 1.3 Logging Setup

- [x] Add `paywallLog` logger to `src/utils/logger.ts`
- [x] Define log events:
  - `paywall:detected`
  - `paywall:not-detected`
  - `bypass:*:start/success/failed` (to be used in Phase 5)

**Milestone:** Generic paywall detection working for unknown sites.

---

## Phase 2: Site-Specific Detection

### 2.1 Site-Specific Selectors

> Site-specific paywall selectors are now defined in `SITE_PAYWALL_SELECTORS` in
> `src/extractors/_paywall.ts` rather than in individual extractors.

- [x] Medium selectors added to `SITE_PAYWALL_SELECTORS`
- [x] NYT selectors added to `SITE_PAYWALL_SELECTORS`
- [x] WSJ selectors added to `SITE_PAYWALL_SELECTORS`
- [x] WaPo selectors added to `SITE_PAYWALL_SELECTORS`
- [x] The Atlantic selectors added to `SITE_PAYWALL_SELECTORS`
- [x] Known paywalled domains list in `isKnownPaywalledSite()`

### 2.2 Future Site Additions (as needed)

- [ ] Add more site-specific selectors as discovered
- [ ] Refine existing selectors based on testing

**Milestone:** Site-specific paywall detection for major paywalled sites.

---

## Phase 3: Googlebot Fetch

### 3.1 Fetcher Extension

- [ ] Add `GOOGLEBOT_USER_AGENT` constant to `src/utils/fetcher.ts`
- [ ] Add `GOOGLEBOT_TIMEOUT_MS` constant (15000ms)
- [ ] Create `fetchHtmlAsGooglebot()` function
- [ ] Handle same error cases as `fetchHtml()`

### 3.2 Integration

- [ ] Add Googlebot fetch as first bypass attempt in hopper flow
- [ ] Log Googlebot fetch attempts and results

**Milestone:** Googlebot User-Agent bypass working.

---

## Phase 4: Archive Service Integration

### 4.1 Archive Fetcher Module

- [ ] Create `src/utils/archive-fetcher.ts`
- [ ] Define `ArchiveFetchResult` type:

  ```typescript
  interface ArchiveFetchResult {
    success: boolean;
    html?: string;
    archiveUrl?: string;
    service: 'archive.is' | 'wayback';
    timestamp?: string;
    error?: string;
  }
  ```

### 4.2 archive.is Integration

- [ ] Add `ARCHIVE_IS_TIMEOUT_MS` constant (45000ms)
- [ ] Implement `fetchFromArchiveIs(url)` function
- [ ] Handle redirects to actual snapshot URL
- [ ] Extract and return snapshot URL for attribution

### 4.3 Wayback Machine Integration

- [ ] Add `WAYBACK_TIMEOUT_MS` constant (30000ms)
- [ ] Implement `fetchFromWayback(url)` function
- [ ] Use Wayback availability API first
- [ ] Fetch from snapshot URL
- [ ] Extract timestamp for attribution

**Milestone:** Archive service fetching working.

---

## Phase 5: Paywall Hopper Orchestration

### 5.1 Hopper Module

- [ ] Create `src/utils/paywall-hopper.ts`
- [ ] Define `PaywallHopperResult` type:

  ```typescript
  interface PaywallHopperResult {
    success: boolean;
    html?: string;
    source: 'googlebot' | 'archive.is' | 'wayback' | 'none';
    archiveUrl?: string;
    timestamp?: string;
    error?: string;
  }
  ```

### 5.2 Bypass Sequence

- [ ] Implement `tryBypassPaywall(url)` function
- [ ] Execute bypass attempts in order:
  1. Googlebot User-Agent fetch
  2. archive.is fetch
  3. Wayback Machine fetch
- [ ] Return first successful result
- [ ] Log all attempts for debugging

### 5.3 Article Loader Integration

- [ ] Modify `loadArticleFromUrl()` in `src/utils/article-loader.ts`
- [ ] After parsing, check `extractor.isPaywalled()` or generic detection
- [ ] If paywalled AND Paywall Hopper enabled:
  - [ ] Check for open browser tab first (subscriber flow)
  - [ ] If no tab, invoke `tryBypassPaywall()`
- [ ] Pass archive source metadata through to article state

**Milestone:** Full bypass flow working end-to-end.

---

## Phase 6: Article State & Types

### 6.1 Type Extensions

- [ ] Add `archiveSource` field to `ArticleState` in `src/types/article.ts`:

  ```typescript
  archiveSource?: {
    service: 'googlebot' | 'archive.is' | 'wayback' | 'browser';
    url?: string;
    timestamp?: string;
    retrievedAt: string;
  };
  ```

### 6.2 Markdown Annotation

- [ ] Modify `formatArticle()` in `src/utils/markdown.ts`
- [ ] Add archive source annotation when `archiveSource` is present:

  ```markdown
  > 📦 **Archived Copy** — Retrieved from [archive.is](url) on date
  ```

**Milestone:** Archive attribution visible in article display.

---

## Phase 7: UI & Preferences

### 7.1 Preferences

- [ ] Add `enablePaywallHopper` preference to `package.json`:

  ```json
  {
    "name": "enablePaywallHopper",
    "title": "Paywall Hopper",
    "description": "Try to retrieve full content when articles are paywalled.",
    "type": "checkbox",
    "label": "Enable",
    "default": true,
    "required": false
  }
  ```

- [ ] Read preference in `src/open.tsx`

### 7.2 Paywall Detection UI

- [ ] Create new UI state for paywall detection in `src/open.tsx`
- [ ] Show options when paywall detected:
  - "Import from Browser Tab" (if tab found)
  - "Open in Browser & Import"
  - "Try Paywall Hopper"

### 7.3 Actions

- [ ] Add "Copy URL to Archived Copy" action (when `archiveSource` present)
- [ ] Add "Try Paywall Hopper" manual action
- [ ] Update action panel organization

### 7.4 Toast Notifications

- [ ] Show toast when Googlebot bypass succeeds
- [ ] Show toast when archive service bypass succeeds
- [ ] Show toast when paywall detected (with options)

**Milestone:** Full UI integration complete.

---

## Phase 8: Subscriber Flow

### 8.1 Browser Tab Detection

- [ ] When paywall detected, check for matching browser tab
- [ ] If tab found, prioritize "Import from Browser Tab" action
- [ ] If tab not found, show "Open in Browser & Import" option

### 8.2 Import Flow Enhancement

- [ ] Ensure browser tab import works for authenticated content
- [ ] Add clear messaging for subscribers about using their session

**Milestone:** Subscriber-friendly flow complete.

---

## Phase 9: Testing & Polish

### 9.1 Manual Testing

- [ ] Test with WSJ paywalled article
- [ ] Test with NYT metered article
- [ ] Test with Medium member-only story
- [ ] Test with The Atlantic paywalled article
- [ ] Test subscriber flow with browser tab import
- [ ] Test with Paywall Hopper disabled

### 9.2 Edge Cases

- [ ] Handle archive service timeouts gracefully
- [ ] Handle archive service unavailability
- [ ] Handle sites that block Googlebot
- [ ] Handle malformed archive responses

### 9.3 Logging Review

- [ ] Verify all log events fire correctly
- [ ] Ensure debug info is helpful for troubleshooting

### 9.4 Documentation

- [ ] Update main README with Paywall Hopper feature
- [ ] Add troubleshooting section for common issues

**Milestone:** Feature complete and tested.

---

## Phase 10: Future Enhancements (v2+)

> Out of scope for initial implementation, tracked for future work.

- [ ] Jina.ai integration (reference Webpage to Markdown)
- [ ] removepaywall.com as additional fallback
- [ ] Cache archive URLs for quick re-access
- [ ] Domain-specific bypass rules from Bypass Paywalls Clean
- [ ] Cookie manipulation techniques
- [ ] Google Cache fallback (if still available)
- [ ] Parallel fetching (hit multiple sources simultaneously)

---

## Dependencies

No new npm packages required. Uses existing:

- `linkedom` for DOM parsing
- `@mozilla/readability` for content extraction
- Native `fetch` for HTTP requests

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/paywall-hopper.ts` | Orchestrate bypass attempts |
| `src/utils/archive-fetcher.ts` | Fetch from archive services |

## Files to Modify

| File | Changes |
|------|---------|
| `src/extractors/_base.ts` | Add `isPaywalled()`, `getPaywallSelectors()` |
| `src/extractors/medium.ts` | Add Medium-specific paywall detection |
| `src/utils/fetcher.ts` | Add `fetchHtmlAsGooglebot()` |
| `src/utils/article-loader.ts` | Integrate Paywall Hopper flow |
| `src/utils/markdown.ts` | Add archive source annotation |
| `src/utils/logger.ts` | Add `paywallLog` logger |
| `src/types/article.ts` | Add `archiveSource` field |
| `src/open.tsx` | Add UI for paywall detection, actions |
| `package.json` | Add `enablePaywallHopper` preference |

---

## References

- [Paywall Hopper Spec](./paywall-hopper.md)
- [Content Extraction Docs](./content-extraction.md)
- [Logger Integration Guide](./logger-integration.md)
