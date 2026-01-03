/**
 * Browser Extension Utilities
 *
 * Handles all interactions with the Raycast browser extension for fetching
 * content from open browser tabs. Used as a fallback when direct HTTP fetch
 * fails (e.g., 403 blocked pages).
 */

import { BrowserExtension } from "@raycast/api";
import { urlLog } from "./logger";
import { parseArticle } from "./readability";
import { formatArticle } from "./markdown";
import { BrowserTab, BrowserContentResult, TabContentResult } from "../types/browser";
import { ArticleState } from "../types/article";

// Cache the extension availability check to avoid repeated API calls
let extensionAvailableCache: boolean | null = null;

/**
 * Check if browser extension is available.
 * Result is cached after first successful check.
 */
export async function isBrowserExtensionAvailable(): Promise<boolean> {
  if (extensionAvailableCache !== null) {
    return extensionAvailableCache;
  }

  try {
    await BrowserExtension.getTabs();
    extensionAvailableCache = true;
    urlLog.log("extension:available", { cached: false });
    return true;
  } catch {
    // Don't cache negative results - extension might be installed later
    urlLog.log("extension:unavailable", { cached: false });
    return false;
  }
}

/**
 * Get all open browser tabs.
 * Returns empty array if extension is not available.
 */
export async function getBrowserTabs(): Promise<BrowserTab[]> {
  try {
    const tabs = await BrowserExtension.getTabs();
    extensionAvailableCache = true;
    return tabs;
  } catch {
    return [];
  }
}

/**
 * Normalize URL for comparison (strips trailing slashes, lowercases hostname)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Extract canonical URL from HTML content.
 * Checks og:url, twitter:url, and link[rel="canonical"] in that order.
 */
function extractCanonicalUrl(html: string): string | null {
  // Try og:url
  const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (ogUrlMatch?.[1]) return ogUrlMatch[1];

  // Try twitter:url
  const twitterUrlMatch = html.match(/<meta[^>]+(?:property|name)=["']twitter:url["'][^>]+content=["']([^"']+)["']/i);
  if (twitterUrlMatch?.[1]) return twitterUrlMatch[1];

  // Try link[rel="canonical"]
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  // Also check reverse attribute order for link tag
  const canonicalMatchReverse = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonicalMatchReverse?.[1]) return canonicalMatchReverse[1];

  return null;
}

/**
 * Check if two URLs match, considering canonical URLs.
 * Returns true if either URL matches directly or via canonical.
 */
export function urlsMatch(targetUrl: string, tabUrl: string, tabHtml?: string): boolean {
  const normalizedTarget = normalizeUrl(targetUrl);
  const normalizedTab = normalizeUrl(tabUrl);

  // Direct match
  if (normalizedTarget === normalizedTab) {
    return true;
  }

  // Check canonical URL from tab HTML if provided
  if (tabHtml) {
    const canonicalUrl = extractCanonicalUrl(tabHtml);
    if (canonicalUrl) {
      const normalizedCanonical = normalizeUrl(canonicalUrl);
      if (normalizedTarget === normalizedCanonical) {
        urlLog.log("url:canonical-match", { targetUrl, tabUrl, canonicalUrl });
        return true;
      }
    }
  }

  return false;
}

/**
 * Find a tab matching the given URL.
 * Compares normalized URLs to handle minor differences.
 */
export async function findTabByUrl(targetUrl: string): Promise<BrowserTab | null> {
  const tabs = await getBrowserTabs();
  if (tabs.length === 0) return null;

  const normalizedTarget = normalizeUrl(targetUrl);
  return tabs.find((tab) => normalizeUrl(tab.url) === normalizedTarget) ?? null;
}

/**
 * Result from reimport attempt.
 * Includes tab info so UI can prompt user to focus the tab if needed.
 */
export type ReimportResult =
  | { status: "success"; article: ArticleState }
  | { status: "no_matching_tab" }
  | { status: "tab_inactive"; tab: BrowserTab }
  | { status: "error"; error: string };

/**
 * Reimport article content from browser tab.
 * Validates that the tab URL matches the target URL (including canonical URL check).
 * Returns tab_inactive status if tab exists but is not focused (browser may have unloaded it).
 */
export async function reimportFromBrowserTab(targetUrl: string): Promise<ReimportResult> {
  const tabs = await getBrowserTabs();
  if (tabs.length === 0) {
    urlLog.log("reimport:no-tabs", { targetUrl });
    return { status: "no_matching_tab" };
  }

  // First, try direct URL match
  const normalizedTarget = normalizeUrl(targetUrl);
  let matchingTab = tabs.find((tab) => normalizeUrl(tab.url) === normalizedTarget);

  // If no direct match, we'll need to check canonical URLs by fetching HTML from active tab
  if (!matchingTab) {
    // Only check active tab for canonical URL match (inactive tabs may timeout)
    const activeTab = tabs.find((tab) => tab.active);
    if (activeTab) {
      try {
        const html = await BrowserExtension.getContent({ format: "html", tabId: activeTab.id });
        if (html && urlsMatch(targetUrl, activeTab.url, html)) {
          matchingTab = activeTab;
          urlLog.log("reimport:canonical-match-found", { targetUrl, tabUrl: activeTab.url });
        }
      } catch {
        // Ignore errors fetching HTML for canonical check
      }
    }
  }

  if (!matchingTab) {
    urlLog.log("reimport:no-matching-tab", { targetUrl });
    return { status: "no_matching_tab" };
  }

  urlLog.log("reimport:found-tab", {
    targetUrl,
    tabId: matchingTab.id,
    tabUrl: matchingTab.url,
    isActive: matchingTab.active,
  });

  // If tab is not active, return status so UI can prompt user to focus it
  if (!matchingTab.active) {
    return { status: "tab_inactive", tab: matchingTab };
  }

  // Tab is active, fetch content
  const result = await getContentFromTab(targetUrl, matchingTab.id);
  if (result.success) {
    urlLog.log("reimport:success", { targetUrl, source: "browser-tab" });
    return { status: "success", article: result.article };
  }

  return { status: "error", error: result.error };
}

/**
 * Get content from a specific tab by ID, or active tab if no ID provided.
 * Parses the HTML with Readability and converts to Markdown.
 */
export async function getContentFromTab(url: string, tabId?: number): Promise<BrowserContentResult> {
  urlLog.log("fetch:extension:start", { url, tabId });

  const startTime = Date.now();
  try {
    urlLog.log("fetch:extension:calling-api", { url, tabId, timestamp: startTime });

    const html = await BrowserExtension.getContent({
      format: "html",
      tabId,
    });

    const duration = Date.now() - startTime;
    urlLog.log("fetch:extension:api-returned", { url, tabId, durationMs: duration, hasContent: !!html });

    if (!html || html.trim().length === 0) {
      urlLog.error("fetch:extension:error", {
        url,
        errorType: "empty_content",
        statusCode: null,
      });
      return {
        success: false,
        error: "Could not get content from browser. Make sure the page is fully loaded.",
      };
    }

    urlLog.log("fetch:extension:success", {
      url,
      status: 200,
      contentLength: html.length,
    });

    // Parse with Readability
    const parseResult = parseArticle(html, url);
    if (!parseResult.success) {
      urlLog.error("fetch:extension:error", {
        url,
        errorType: "parse_failed",
        statusCode: null,
      });
      return { success: false, error: parseResult.error.message };
    }

    // Convert to Markdown
    const formatted = formatArticle(parseResult.article.title, parseResult.article.content, {
      image: parseResult.article.image,
    });

    return {
      success: true,
      article: {
        bodyMarkdown: formatted.markdown,
        title: parseResult.article.title,
        byline: parseResult.article.byline,
        siteName: parseResult.article.siteName,
        url,
        source: tabId !== undefined ? "browser extension (tab)" : "browser extension",
        textContent: parseResult.article.textContent,
      },
    };
  } catch (err) {
    urlLog.error("fetch:extension:error", {
      url,
      errorType: "exception",
      error: String(err),
      statusCode: null,
    });
    return {
      success: false,
      error: "Failed to get content from browser. Make sure the Raycast browser extension is installed.",
    };
  }
}

// Timeout for fetching content from inactive tabs (ms)
const INACTIVE_TAB_TIMEOUT_MS = 5000;

/**
 * Try to get content from browser if URL is already open in a tab.
 * This is the automatic fallback for 403/blocked pages.
 *
 * For inactive tabs, applies a timeout to detect hangs.
 * Returns tab info on failure so UI can offer to activate the tab.
 */
export async function tryGetContentFromOpenTab(url: string): Promise<TabContentResult> {
  const tab = await findTabByUrl(url);

  if (!tab) {
    urlLog.log("fetch:extension:skip", { url, reason: "tab_not_found" });
    return { status: "tab_not_found" };
  }

  urlLog.log("fetch:extension:found-tab", {
    url,
    tabId: tab.id,
    tabTitle: tab.title,
    isActive: tab.active,
  });

  // For active tabs, fetch directly
  if (tab.active) {
    const result = await getContentFromTab(url, tab.id);
    if (result.success) {
      return { status: "success", article: result.article };
    }
    return { status: "fetch_failed", error: result.error, tab };
  }

  // For inactive tabs, apply a timeout to detect potential hangs
  try {
    const result = await Promise.race([
      getContentFromTab(url, tab.id),
      new Promise<{ success: false; error: string }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), INACTIVE_TAB_TIMEOUT_MS),
      ),
    ]);

    if (result.success) {
      return { status: "success", article: result.article };
    }
    return { status: "fetch_failed", error: result.error, tab };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    urlLog.warn("fetch:extension:inactive-tab-timeout", {
      url,
      tabId: tab.id,
      tabTitle: tab.title,
      timeoutMs: INACTIVE_TAB_TIMEOUT_MS,
    });
    return {
      status: "fetch_failed",
      error: errorMsg === "timeout" ? "Timed out fetching from inactive tab" : errorMsg,
      tab,
    };
  }
}

/**
 * Get content from the currently active browser tab.
 * Used when user manually triggers fetch after opening a blocked page.
 */
export async function getContentFromActiveTab(url: string): Promise<BrowserContentResult> {
  return getContentFromTab(url);
}

/**
 * Get the URL of the currently active browser tab.
 * Returns null if extension is not available or no active tab.
 */
export async function getActiveTabUrl(): Promise<{ url: string; tabId: number } | null> {
  const tabs = await getBrowserTabs();
  const activeTab = tabs.find((tab) => tab.active);

  if (activeTab?.url) {
    return { url: activeTab.url, tabId: activeTab.id };
  }

  return null;
}
