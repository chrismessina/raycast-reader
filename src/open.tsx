import { useState, useEffect } from "react";
import {
  Detail,
  LaunchProps,
  BrowserExtension,
  Clipboard,
  getSelectedText,
  ActionPanel,
  Action,
  Keyboard,
} from "@raycast/api";
import { urlLog } from "./utils/logger";
import { fetchHtml } from "./utils/fetcher";
import { parseArticle } from "./utils/readability";
import { formatArticle } from "./utils/markdown";

type ReaderArguments = {
  url: string;
};

/**
 * Validates if a string is a valid URL
 */
function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolves URL from multiple sources in priority order:
 * 1. Command argument
 * 2. Selected text (if valid URL)
 * 3. Clipboard (if valid URL)
 * 4. Browser extension (active tab)
 */
async function resolveUrl(argumentUrl?: string): Promise<{ url: string; source: string } | null> {
  urlLog.log("resolve:start", { hasArgument: !!argumentUrl });

  // 1. Command argument
  if (argumentUrl && argumentUrl.trim()) {
    const trimmed = argumentUrl.trim();
    if (isValidUrl(trimmed)) {
      urlLog.log("resolve:success", { source: "argument", url: trimmed });
      return { url: trimmed, source: "argument" };
    }
    urlLog.warn("resolve:invalid", { source: "argument", value: trimmed });
    return null;
  }

  // 2. Selected text
  try {
    urlLog.log("resolve:try", { source: "selected text" });
    const selectedText = await getSelectedText();
    if (selectedText && isValidUrl(selectedText.trim())) {
      urlLog.log("resolve:success", { source: "selected text", url: selectedText.trim() });
      return { url: selectedText.trim(), source: "selected text" };
    }
    urlLog.log("resolve:skip", { source: "selected text", reason: "not a valid URL" });
  } catch {
    urlLog.log("resolve:skip", { source: "selected text", reason: "unable to get selection" });
  }

  // 3. Clipboard
  try {
    urlLog.log("resolve:try", { source: "clipboard" });
    const clipboardText = await Clipboard.readText();
    if (clipboardText && isValidUrl(clipboardText.trim())) {
      urlLog.log("resolve:success", { source: "clipboard", url: clipboardText.trim() });
      return { url: clipboardText.trim(), source: "clipboard" };
    }
    urlLog.log("resolve:skip", { source: "clipboard", reason: "not a valid URL" });
  } catch {
    urlLog.log("resolve:skip", { source: "clipboard", reason: "unable to read clipboard" });
  }

  // 4. Browser extension (active tab)
  try {
    urlLog.log("resolve:try", { source: "browser" });
    const tabs = await BrowserExtension.getTabs();
    const activeTab = tabs.find((tab) => tab.active);
    if (activeTab && activeTab.url && isValidUrl(activeTab.url)) {
      urlLog.log("resolve:success", { source: "browser", url: activeTab.url, tabId: activeTab.id });
      return { url: activeTab.url, source: "browser" };
    }
    urlLog.log("resolve:skip", { source: "browser", reason: "no active tab with valid URL", tabCount: tabs.length });
  } catch {
    urlLog.log("resolve:skip", { source: "browser", reason: "extension not available" });
  }

  urlLog.warn("resolve:failed", { reason: "no valid URL found from any source" });
  return null;
}

interface ArticleState {
  markdown: string;
  title: string;
  url: string;
  source: string;
}

export default function Command(props: LaunchProps<{ arguments: ReaderArguments }>) {
  const [article, setArticle] = useState<ArticleState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadArticle() {
      urlLog.log("session:start", { argumentUrl: props.arguments.url });

      // Step 1: Resolve URL
      const urlResult = await resolveUrl(props.arguments.url);
      if (!urlResult) {
        const errorMsg =
          props.arguments.url && props.arguments.url.trim()
            ? `Invalid URL: "${props.arguments.url}"`
            : "No URL found. Provide a URL, select a URL, copy one to clipboard, or open a page in your browser.";
        urlLog.error("session:error", { error: errorMsg });
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      urlLog.log("session:url-resolved", { url: urlResult.url, source: urlResult.source });

      // Step 2: Fetch HTML
      const fetchResult = await fetchHtml(urlResult.url);
      if (!fetchResult.success) {
        setError(fetchResult.error.message);
        setIsLoading(false);
        return;
      }

      // Step 3: Parse with Readability
      const parseResult = parseArticle(fetchResult.data.html, fetchResult.data.url);
      if (!parseResult.success) {
        setError(parseResult.error.message);
        setIsLoading(false);
        return;
      }

      // Step 4: Convert to Markdown
      const formatted = formatArticle(
        parseResult.article.title,
        parseResult.article.content,
        parseResult.article.byline,
        parseResult.article.siteName,
      );

      urlLog.log("session:ready", {
        url: urlResult.url,
        title: formatted.title,
        markdownLength: formatted.markdown.length,
      });

      setArticle({
        markdown: formatted.markdown,
        title: formatted.title,
        url: urlResult.url,
        source: urlResult.source,
      });
      setIsLoading(false);
    }

    loadArticle();
  }, [props.arguments.url]);

  if (isLoading) {
    return <Detail isLoading={true} markdown="" />;
  }

  if (error || !article) {
    return <Detail markdown={`# Error\n\n${error || "Unable to load article"}`} />;
  }

  return (
    <Detail
      markdown={article.markdown}
      navigationTitle={article.title}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy as Markdown"
            content={article.markdown}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
          <Action.OpenInBrowser title="Open in Browser" url={article.url} shortcut={Keyboard.Shortcut.Common.Open} />
          <Action.CopyToClipboard
            title="Copy URL"
            content={article.url}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}
