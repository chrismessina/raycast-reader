import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { parseLog } from "./logger";
import { preCleanHtml } from "./html-cleaner";
import { MetadataExtractor } from "./metadata-extractor";
import { getExtractor } from "../extractors";

export interface ArticleContent {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  length: number;
  // Enhanced metadata from Schema.org, OG, Twitter Cards
  author: string | null;
  published: string | null;
  image: string | null;
  description: string | null;
  favicon: string | null;
}

export interface ReadabilityError {
  type: "not-readable" | "parse-failed" | "empty-content";
  message: string;
}

export interface ReadabilityOptions {
  skipPreCheck?: boolean;
}

/**
 * Converts relative URLs in HTML to absolute URLs
 */
function makeUrlsAbsolute(html: string, baseUrl: string): string {
  const base = new URL(baseUrl);

  // Convert relative src attributes in img tags
  html = html.replace(/(<img[^>]+src=["'])([^"']+)(["'])/gi, (match, prefix, url, suffix) => {
    try {
      const absoluteUrl = new URL(url, base).href;
      return prefix + absoluteUrl + suffix;
    } catch {
      return match; // Keep original if URL parsing fails
    }
  });

  // Convert relative href attributes in a tags
  html = html.replace(/(<a[^>]+href=["'])([^"']+)(["'])/gi, (match, prefix, url, suffix) => {
    try {
      const absoluteUrl = new URL(url, base).href;
      return prefix + absoluteUrl + suffix;
    } catch {
      return match; // Keep original if URL parsing fails
    }
  });

  return html;
}

/**
 * Parses HTML content using Mozilla Readability to extract article content
 */
export function parseArticle(
  html: string,
  url: string,
  options: ReadabilityOptions = {},
): { success: true; article: ArticleContent } | { success: false; error: ReadabilityError } {
  parseLog.log("parse:start", { url, htmlLength: html.length });

  try {
    // Preprocess HTML to convert relative URLs to absolute URLs
    // This is necessary because linkedom doesn't fully support base element URL resolution
    const absoluteHtml = makeUrlsAbsolute(html, url);

    // Pre-clean HTML to remove sidebars, ads, comments, subscription boxes, etc.
    // Based on Safari Reader Mode and Reader View patterns
    const cleaningResult = preCleanHtml(absoluteHtml, url);

    const { document } = parseHTML(cleaningResult.html);

    // Extract rich metadata from Schema.org JSON-LD, OG tags, etc. BEFORE cleaning
    // We use the original HTML to preserve metadata that might be removed during cleaning
    const { document: originalDoc } = parseHTML(absoluteHtml);
    const metadata = MetadataExtractor.extract(originalDoc, url);

    // Check if we have a site-specific extractor for this URL
    // Extractors provide custom content extraction for sites that don't work well with Readability
    const extractor = getExtractor(originalDoc, url, metadata.schemaOrgData);
    if (extractor) {
      parseLog.log("parse:extractor", { url, extractor: extractor.siteName });

      try {
        const result = extractor.extract();

        parseLog.log("parse:extractor:success", {
          url,
          extractor: extractor.siteName,
          contentLength: result.content.length,
          textLength: result.textContent.length,
        });

        return {
          success: true,
          article: {
            title: result.metadata.title || metadata.title || "Untitled",
            content: result.content,
            textContent: result.textContent,
            excerpt: result.metadata.description || metadata.description || "",
            byline: result.metadata.author || null,
            siteName: result.metadata.siteName || metadata.siteName || null,
            length: result.textContent.length,
            author: result.metadata.author || metadata.author || null,
            published: result.metadata.published || metadata.published || null,
            image: result.metadata.image || metadata.image || null,
            description: result.metadata.description || metadata.description || null,
            favicon: metadata.favicon || null,
          },
        };
      } catch (extractorErr) {
        // If extractor fails, fall back to Readability
        parseLog.warn("parse:extractor:error", {
          url,
          extractor: extractor.siteName,
          error: extractorErr instanceof Error ? extractorErr.message : "Unknown error",
        });
      }
    }

    // Pre-check if content is likely readable
    if (!options.skipPreCheck) {
      const isReadable = isProbablyReaderable(document);
      parseLog.log("parse:precheck", { url, isReadable });

      if (!isReadable) {
        parseLog.warn("parse:skip", { url, reason: "content not readable" });
        return {
          success: false,
          error: {
            type: "not-readable",
            message:
              "This page doesn't appear to contain readable article content. It may be a homepage, search results, or a page with mostly navigation elements.",
          },
        };
      }
    }

    // Parse with Readability
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      parseLog.error("parse:error", { url, reason: "Readability returned null" });
      return {
        success: false,
        error: {
          type: "parse-failed",
          message: "Unable to extract content from this page",
        },
      };
    }

    if (!article.content || article.content.trim().length === 0) {
      parseLog.error("parse:error", { url, reason: "empty content" });
      return {
        success: false,
        error: {
          type: "empty-content",
          message: "No content found on this page",
        },
      };
    }

    const textContent = article.textContent || "";

    parseLog.log("parse:success", {
      url,
      title: article.title,
      contentLength: article.content.length,
      textLength: textContent.length,
      hasByline: !!article.byline,
      hasSiteName: !!article.siteName,
    });

    // Merge Readability output with extracted metadata
    // Metadata provides fallbacks and additional fields
    return {
      success: true,
      article: {
        title: article.title || metadata.title || "Untitled",
        content: article.content,
        textContent,
        excerpt: article.excerpt || metadata.description || "",
        byline: article.byline || null,
        siteName: article.siteName || metadata.siteName || null,
        length: article.length || textContent.length,
        // Enhanced metadata fields
        author: metadata.author || article.byline || null,
        published: metadata.published || null,
        image: metadata.image || null,
        description: metadata.description || article.excerpt || null,
        favicon: metadata.favicon || null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parsing error";
    parseLog.error("parse:error", { url, error: message });
    return {
      success: false,
      error: {
        type: "parse-failed",
        message: `Failed to parse content: ${message}`,
      },
    };
  }
}
