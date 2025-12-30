import { LocalStorage } from "@raycast/api";
import { SummaryStyle } from "./summarizer";
import { aiLog } from "./logger";

/**
 * Cached summary entry
 */
interface CachedSummary {
  summary: string;
  style: SummaryStyle;
  timestamp: number;
}

/**
 * Cache key prefix for summaries
 */
const CACHE_PREFIX = "summary:";

/**
 * Key for tracking the last summary style used per URL
 */
const LAST_STYLE_PREFIX = "lastStyle:";

/**
 * Generate a simple hash for a URL to use as cache key
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build cache key for a URL + style combination
 */
function buildCacheKey(url: string, style: SummaryStyle): string {
  return `${CACHE_PREFIX}${hashUrl(url)}:${style}`;
}

/**
 * Build key for tracking last used style
 */
function buildLastStyleKey(url: string): string {
  return `${LAST_STYLE_PREFIX}${hashUrl(url)}`;
}

/**
 * Get cached summary for a URL + style combination
 */
export async function getCachedSummary(url: string, style: SummaryStyle): Promise<string | undefined> {
  const key = buildCacheKey(url, style);
  try {
    const cached = await LocalStorage.getItem<string>(key);
    if (cached) {
      const entry: CachedSummary = JSON.parse(cached);
      aiLog.log("cache:hit", { url, style, age: Date.now() - entry.timestamp });
      return entry.summary;
    }
    aiLog.log("cache:miss", { url, style });
    return undefined;
  } catch (error) {
    aiLog.error("cache:error", { url, style, error: String(error) });
    return undefined;
  }
}

/**
 * Store summary in cache
 */
export async function setCachedSummary(url: string, style: SummaryStyle, summary: string): Promise<void> {
  const key = buildCacheKey(url, style);
  const lastStyleKey = buildLastStyleKey(url);

  const entry: CachedSummary = {
    summary,
    style,
    timestamp: Date.now(),
  };

  try {
    await LocalStorage.setItem(key, JSON.stringify(entry));
    await LocalStorage.setItem(lastStyleKey, style);
    aiLog.log("cache:set", { url, style, summaryLength: summary.length });
  } catch (error) {
    aiLog.error("cache:setError", { url, style, error: String(error) });
  }
}

/**
 * Get the last summary style used for a URL
 */
export async function getLastSummaryStyle(url: string): Promise<SummaryStyle | undefined> {
  const key = buildLastStyleKey(url);
  try {
    const style = await LocalStorage.getItem<SummaryStyle>(key);
    return style;
  } catch {
    return undefined;
  }
}

/**
 * Get all cached summaries for a URL (all styles)
 */
export async function getAllCachedSummaries(url: string): Promise<Map<SummaryStyle, string>> {
  const styles: SummaryStyle[] = ["overview", "opposite-sides", "five-ws", "eli5", "translated", "entities"];

  const results = new Map<SummaryStyle, string>();

  for (const style of styles) {
    const summary = await getCachedSummary(url, style);
    if (summary) {
      results.set(style, summary);
    }
  }

  return results;
}
