import { urlLog } from "./logger";
import { fetchHtml } from "./fetcher";
import { parseArticle } from "./readability";
import { formatArticle } from "./markdown";
import { isBrowserExtensionAvailable, tryGetContentFromOpenTab } from "./browser-extension";
import { BrowserTab } from "../types/browser";
import { ArticleState } from "../types/article";

export type LoadArticleResult =
  | { status: "success"; article: ArticleState }
  | { status: "blocked"; url: string; hasBrowserExtension: boolean; foundTab: BrowserTab | null; error: string }
  | { status: "not-readable"; url: string; error: string }
  | { status: "error"; error: string };

interface LoadArticleOptions {
  skipPreCheck: boolean;
}

/**
 * Loads and parses an article from a URL.
 * Handles fetch, parse, and format steps with proper error handling.
 */
export async function loadArticleFromUrl(
  url: string,
  source: string,
  options: LoadArticleOptions,
): Promise<LoadArticleResult> {
  urlLog.log("session:url-resolved", { url, source });

  // Step 1: Fetch HTML
  const fetchResult = await fetchHtml(url);
  if (!fetchResult.success) {
    // Check if this is a blocked error (403) that could be resolved via browser extension
    if (fetchResult.error.type === "blocked" && fetchResult.error.statusCode === 403) {
      // First, try automatic fallback: check if URL is already open in a browser tab
      const browserResult = await tryGetContentFromOpenTab(url);

      if (browserResult.status === "success") {
        urlLog.log("fetch:auto-fallback-success", { url });
        return { status: "success", article: browserResult.article };
      }

      if (browserResult.status === "fetch_failed") {
        // Tab exists but we couldn't get content (likely inactive tab timeout)
        urlLog.log("fetch:tab-found-but-failed", {
          url,
          tabId: browserResult.tab.id,
          tabTitle: browserResult.tab.title,
          isActive: browserResult.tab.active,
        });
        return {
          status: "blocked",
          url,
          hasBrowserExtension: true,
          foundTab: browserResult.tab,
          error: fetchResult.error.message,
        };
      }

      // Tab not found - show manual browser extension flow
      const extensionAvailable = await isBrowserExtensionAvailable();
      urlLog.log(extensionAvailable ? "fetch:blocked-with-extension" : "fetch:blocked-no-extension", { url });
      return {
        status: "blocked",
        url,
        hasBrowserExtension: extensionAvailable,
        foundTab: null,
        error: fetchResult.error.message,
      };
    }

    return { status: "error", error: fetchResult.error.message };
  }

  // Step 2: Parse with Readability
  urlLog.log("parse:start", { url, skipPreCheck: options.skipPreCheck });
  const parseResult = parseArticle(fetchResult.data.html, fetchResult.data.url, {
    skipPreCheck: options.skipPreCheck,
  });
  if (!parseResult.success) {
    urlLog.error("parse:failed", { url, errorType: parseResult.error.type, message: parseResult.error.message });
    if (parseResult.error.type === "not-readable") {
      return { status: "not-readable", url, error: parseResult.error.message };
    }
    return { status: "error", error: parseResult.error.message };
  }
  urlLog.log("parse:success", { url, contentLength: parseResult.article.content.length });

  // Step 3: Convert to Markdown
  urlLog.log("markdown:start", { url });
  const formatted = formatArticle(parseResult.article.title, parseResult.article.content);
  urlLog.log("markdown:complete", { url, markdownLength: formatted.markdown.length });

  urlLog.log("session:ready", {
    url,
    title: formatted.title,
    markdownLength: formatted.markdown.length,
    bypassedCheck: options.skipPreCheck,
  });

  const article: ArticleState = {
    bodyMarkdown: formatted.markdown,
    title: parseResult.article.title,
    byline: parseResult.article.byline,
    siteName: parseResult.article.siteName,
    url,
    source,
    textContent: parseResult.article.textContent,
    bypassedReadabilityCheck: options.skipPreCheck,
  };

  return { status: "success", article };
}
