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

export interface BrowserTab {
  id: number;
  url: string;
  title?: string;
  active: boolean;
  favicon?: string;
}

export interface ParsedArticle {
  bodyMarkdown: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  source: string;
  textContent: string;
}

export type BrowserContentResult = { success: true; article: ParsedArticle } | { success: false; error: string };

/**
 * Result from trying to get content from an open tab.
 * Includes tab info so the UI can offer to activate the tab if content fetch fails.
 */
export type TabContentResult =
  | { status: "success"; article: ParsedArticle }
  | { status: "tab_not_found" }
  | { status: "fetch_failed"; error: string; tab: BrowserTab };

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
    const formatted = formatArticle(parseResult.article.title, parseResult.article.content);

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
