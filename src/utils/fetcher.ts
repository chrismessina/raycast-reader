import { fetchLog } from "./logger";

export interface FetchResult {
  html: string;
  url: string;
  contentLength: number;
  contentType: string | null;
}

export interface FetchError {
  type: "network" | "http" | "blocked" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
}

/**
 * Fetches HTML content from a URL with error handling and logging
 */
export async function fetchHtml(
  url: string,
): Promise<{ success: true; data: FetchResult } | { success: false; error: FetchError }> {
  fetchLog.log("fetch:start", { url });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const error = getHttpError(response.status);
      fetchLog.error("fetch:error", { url, type: error.type, statusCode: response.status, message: error.message });
      return { success: false, error };
    }

    const html = await response.text();
    const contentType = response.headers.get("content-type");

    fetchLog.log("fetch:success", {
      url,
      statusCode: response.status,
      contentLength: html.length,
      contentType,
    });

    return {
      success: true,
      data: {
        html,
        url: response.url, // Use final URL after redirects
        contentLength: html.length,
        contentType,
      },
    };
  } catch (err) {
    const error = categorizeError(err);
    fetchLog.error("fetch:error", { url, type: error.type, message: error.message });
    return { success: false, error };
  }
}

/**
 * Maps HTTP status codes to user-friendly error messages
 */
function getHttpError(status: number): FetchError {
  switch (status) {
    case 401:
    case 403:
      return { type: "blocked", message: "Access denied — this page requires authentication", statusCode: status };
    case 404:
      return { type: "http", message: "Page not found", statusCode: status };
    case 410:
      return { type: "http", message: "This page no longer exists", statusCode: status };
    case 429:
      return { type: "blocked", message: "Too many requests — please try again later", statusCode: status };
    case 451:
      return { type: "blocked", message: "Unavailable for legal reasons", statusCode: status };
    case 500:
    case 502:
    case 503:
    case 504:
      return { type: "http", message: "Server error — the website is having issues", statusCode: status };
    default:
      return { type: "http", message: `HTTP error ${status}`, statusCode: status };
  }
}

/**
 * Categorizes fetch errors into types
 */
function categorizeError(err: unknown): FetchError {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return { type: "timeout", message: "Request timed out — the page took too long to load" };
    }
    if (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("ENOTFOUND")) {
      return { type: "network", message: "Unable to reach the website — check your connection" };
    }
    return { type: "unknown", message: err.message };
  }
  return { type: "unknown", message: "An unexpected error occurred" };
}
