# Parser Test URLs

> Test fixtures for comparing Readability vs Defuddle content extraction.

## How to Test

1. Set **Content Parser** preference to "Readability (Stable)"
2. Open each URL and note: title, content length, images, formatting
3. Switch to "Defuddle (Experimental)"
4. Repeat and compare results
5. Document issues in the comparison table below

---

## News Sites

| Site | Test URL | Readability | Defuddle | Notes |
|------|----------|-------------|----------|-------|
| NYTimes | https://www.nytimes.com/2024/01/15/technology/ai-news.html | | | Paywall? |
| Guardian | https://www.theguardian.com/technology/2024/jan/15/ai-article | | | |
| BBC | https://www.bbc.com/news/technology-67890123 | | | |
| Reuters | https://www.reuters.com/technology/ai-story-2024-01-15/ | | | |
| CNN | https://www.cnn.com/2024/01/15/tech/ai-news/index.html | | | |
| Washington Post | https://www.washingtonpost.com/technology/2024/01/15/ai/ | | | Paywall? |
| Bloomberg | https://www.bloomberg.com/news/articles/2024-01-15/ai | | | Paywall? |
| Forbes | https://www.forbes.com/sites/technology/2024/01/15/ai/ | | | |
| Atlantic | https://www.theatlantic.com/technology/archive/2024/01/ai/123456/ | | | |

---

## Tech Sites

| Site | Test URL | Readability | Defuddle | Notes |
|------|----------|-------------|----------|-------|
| Ars Technica | https://arstechnica.com/gadgets/2024/01/article/ | | | |
| The Verge | https://www.theverge.com/2024/1/15/12345678/article | | | |
| Wired | https://www.wired.com/story/article-name/ | | | |
| TechCrunch | https://techcrunch.com/2024/01/15/article/ | | | |
| Engadget | https://www.engadget.com/article-name-123456.html | | | |
| CNET | https://www.cnet.com/tech/article-name/ | | | |

---

## Blog Platforms

| Site | Test URL | Readability | Defuddle | Notes |
|------|----------|-------------|----------|-------|
| Medium | https://medium.com/@author/article-title-abc123 | | | |
| Substack | https://example.substack.com/p/article-title | | | |
| Ghost | https://example.ghost.io/article-title/ | | | |
| WordPress.com | https://example.wordpress.com/2024/01/15/article/ | | | |
| Blogger | https://example.blogspot.com/2024/01/article.html | | | |
| Tumblr | https://example.tumblr.com/post/123456789/title | | | |

---

## Reference Sites

| Site | Test URL | Readability | Defuddle | Notes |
|------|----------|-------------|----------|-------|
| Wikipedia | https://en.wikipedia.org/wiki/Artificial_intelligence | | | Complex structure |
| Stack Overflow | https://stackoverflow.com/questions/12345678/title | | | Q&A format |
| GitHub README | https://github.com/kepano/defuddle | | | Markdown |
| GitHub Discussions | https://github.com/raycast/extensions/discussions/123 | | | |

---

## Social/Community

| Site | Test URL | Readability | Defuddle | Notes |
|------|----------|-------------|----------|-------|
| Reddit | https://www.reddit.com/r/programming/comments/abc123/title/ | | | Has Defuddle extractor |
| Hacker News | https://news.ycombinator.com/item?id=12345678 | | | Has Defuddle extractor |

---

## Edge Cases

| Scenario | Test URL | Readability | Defuddle | Notes |
|----------|----------|-------------|----------|-------|
| Heavy JS/SPA | TBD | | | May need browser extension |
| Lazy images | TBD | | | Test image resolution |
| Paywalled | TBD | | | Test paywall detection |
| Non-article | https://www.google.com | | | Should fail gracefully |
| Empty page | TBD | | | Should fail gracefully |
| Long article | TBD | | | Test performance |

---

## Comparison Summary

After testing, summarize findings:

### Sites Where Defuddle Wins
- (List sites with better extraction)

### Sites Where Readability Wins
- (List sites with better extraction)

### Sites Needing Custom Extractors
- (List sites that fail with both)

### Sites Needing removeSelectors
- (List sites with extra clutter)

---

## Test Metrics

For each URL, evaluate:

1. **Title Extraction** - Correct? Complete?
2. **Byline/Author** - Extracted correctly?
3. **Content Completeness** - All paragraphs present?
4. **Image Preservation** - Images included? Lazy-loaded resolved?
5. **Link Functionality** - Relative URLs converted to absolute?
6. **Clutter Removed** - Ads, nav, footer removed?
7. **Formatting** - Headings, lists, code blocks correct?
8. **Markdown Quality** - Clean, readable output?
9. **Parse Time** - Fast enough?

---

## Notes

- Replace placeholder URLs with actual articles before testing
- Some sites may require authentication or have paywalls
- Test with verbose logging enabled to see parser details
- Document any crashes or errors in the Notes column
