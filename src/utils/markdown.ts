import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { parseLog } from "./logger";

// Initialize Turndown with sensible defaults
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

// Enable GitHub Flavored Markdown (tables, strikethrough, task lists)
turndown.use(gfm);

// Custom rule to handle bracketed text in emphasis/italic tags
// Prevents "[text]" from being converted to "*[text]*" which can cause formatting issues
turndown.addRule("bracketedEmphasis", {
  filter: ["em", "i"],
  replacement: function (content) {
    // If content starts with [ and ends with ], don't apply emphasis
    if (content.trim().startsWith("[") && content.trim().endsWith("]")) {
      return content;
    }
    // Otherwise, apply normal emphasis
    return "*" + content + "*";
  },
});

// Remove unwanted elements that may slip through Readability
turndown.remove(["script", "style", "noscript", "iframe", "form", "button", "input", "select", "textarea"]);

/**
 * Converts HTML content to Markdown
 */
export function htmlToMarkdown(html: string): { success: true; markdown: string } | { success: false; error: string } {
  parseLog.log("parse:markdown:start", { htmlLength: html.length });

  try {
    let markdown = turndown.turndown(html);

    // Post-process: Simplify image syntax to fix Raycast rendering issues
    // Remove alt text and title attributes, keeping just the image URL
    // IMPORTANT: Do this BEFORE bracket replacement to avoid breaking image syntax

    // First, handle images with title attributes (including multiline and escaped quotes)
    // Match ![...](url "...") where title may contain escaped quotes and newlines
    markdown = markdown.replace(/!\[[^\]]*\]\(([^\s)]+)\s+".+?"\)/gs, "![]($1)");

    // Then handle regular images without titles
    markdown = markdown.replace(/!\[[^\]]*\]\(([^\s)]+)\)/g, "![]($1)");

    // Post-process: Replace standalone square brackets that are NOT part of markdown links or images
    // to prevent Raycast's markdown renderer from interpreting them as LaTeX math
    // Convert [text] to (text) - parentheses are also standard for editorial insertions
    // The negative lookahead (?!\() ensures we don't match [text]( which is part of a link
    markdown = markdown.replace(/\[([^\]]+)\](?!\()/g, "($1)");

    // Count headings for logging
    const headingCount = (markdown.match(/^#{1,6}\s/gm) || []).length;

    parseLog.log("parse:markdown:success", {
      markdownLength: markdown.length,
      headingCount,
    });

    return { success: true, markdown };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown conversion error";
    parseLog.error("parse:markdown:error", { error: message });
    return { success: false, error: message };
  }
}

export interface FormattedArticle {
  markdown: string;
  title: string;
}

/**
 * Formats article content into a complete Markdown document
 */
export function formatArticle(
  title: string,
  content: string,
  byline: string | null,
  siteName: string | null,
): FormattedArticle {
  // Convert HTML content to Markdown
  const result = htmlToMarkdown(content);
  const contentMarkdown = result.success ? result.markdown : content;

  // Build metadata line
  const metaParts: string[] = [];
  if (byline) metaParts.push(byline);
  if (siteName) metaParts.push(siteName);
  const metaLine = metaParts.length > 0 ? `*${metaParts.join(" · ")}*` : "";

  // Compose final document
  const parts = [`# ${title}`];
  if (metaLine) parts.push("", metaLine);
  parts.push("", "---", "", contentMarkdown);

  return {
    markdown: parts.join("\n"),
    title,
  };
}
