import { useState, useEffect, useCallback, useRef } from "react";
import {
  Detail,
  LaunchProps,
  Clipboard,
  getSelectedText,
  ActionPanel,
  Action,
  Keyboard,
  Icon,
  environment,
  AI,
  getPreferenceValues,
  showToast,
  Toast,
} from "@raycast/api";
import { useAI } from "@raycast/utils";
import { urlLog } from "./utils/logger";
import { fetchHtml } from "./utils/fetcher";
import { parseArticle } from "./utils/readability";
import { formatArticle } from "./utils/markdown";
import {
  isBrowserExtensionAvailable,
  getContentFromActiveTab,
  tryGetContentFromOpenTab,
  getActiveTabUrl,
  type BrowserTab,
} from "./utils/browser-extension";
import {
  SummaryStyle,
  getStyleLabel,
  buildSummaryPrompt,
  logSummarySuccess,
  logSummaryError,
  formatSummaryBlock,
} from "./utils/summarizer";
import { getCachedSummary, setCachedSummary } from "./utils/summaryCache";
import { getAIConfigForStyle } from "./config/ai";

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
  urlLog.log("resolve:try", { source: "browser" });
  const activeTab = await getActiveTabUrl();
  if (activeTab && isValidUrl(activeTab.url)) {
    urlLog.log("resolve:success", { source: "browser", url: activeTab.url, tabId: activeTab.tabId });
    return { url: activeTab.url, source: "browser" };
  }
  urlLog.log("resolve:skip", { source: "browser", reason: "no active tab with valid URL or extension unavailable" });

  urlLog.warn("resolve:failed", { reason: "no valid URL found from any source" });
  return null;
}

interface ArticleState {
  bodyMarkdown: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  source: string;
  textContent: string;
}

const SUMMARY_STYLES: { style: SummaryStyle; icon: Icon }[] = [
  { style: "overview", icon: Icon.List },
  { style: "opposite-sides", icon: Icon.Switch },
  { style: "five-ws", icon: Icon.QuestionMark },
  { style: "eli5", icon: Icon.SpeechBubble },
  { style: "translated", icon: Icon.Globe },
  { style: "entities", icon: Icon.Person },
];

export default function Command(props: LaunchProps<{ arguments: ReaderArguments }>) {
  const preferences = getPreferenceValues<Preferences.Open>();
  const canAccessAI = environment.canAccess(AI);
  const shouldShowSummary = canAccessAI && preferences.enableAISummary;

  const [article, setArticle] = useState<ArticleState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [hasBrowserExtension, setHasBrowserExtension] = useState(false);
  const [isWaitingForBrowser, setIsWaitingForBrowser] = useState(false);
  const [foundTab, setFoundTab] = useState<BrowserTab | null>(null);
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle | null>(null);
  const [summaryPrompt, setSummaryPrompt] = useState<string>("");
  const [cachedSummary, setCachedSummaryState] = useState<string | null>(null);
  const [summaryInitialized, setSummaryInitialized] = useState(false);
  const [summaryStartTime, setSummaryStartTime] = useState<number | null>(null);
  const [completedSummary, setCompletedSummary] = useState<string | null>(null);
  const fetchStartedRef = useRef(false);
  const toastRef = useRef<Toast | null>(null);

  // Get AI config based on current summary style
  const aiConfig = getAIConfigForStyle(summaryStyle);

  // useAI hook for summarization - only executes when summaryPrompt is set
  const { data: summaryData, isLoading: isSummarizing } = useAI(summaryPrompt, {
    creativity: aiConfig.creativity,
    model: aiConfig.model,
    execute: !!summaryPrompt && !!summaryStyle && !cachedSummary,
    onWillExecute: async () => {
      setSummaryStartTime(Date.now());
      setCompletedSummary(null);

      // Show animated toast while generating
      toastRef.current = await showToast({
        style: Toast.Style.Animated,
        title: "Generating summary...",
      });
    },
    onError: async (err) => {
      if (summaryStyle) {
        const durationMs = summaryStartTime ? Date.now() - summaryStartTime : undefined;
        logSummaryError(summaryStyle, err.message, durationMs);

        // Show failure toast
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to generate summary",
          message: err.message,
        });
      }
    },
  });

  // When streaming completes, log final stats and cache the complete summary
  useEffect(() => {
    if (summaryData && summaryStyle && article && !isSummarizing && !completedSummary && !cachedSummary) {
      // Streaming is done - log final stats
      const durationMs = summaryStartTime ? Date.now() - summaryStartTime : undefined;
      const estimatedTokens = Math.ceil(summaryData.length / 4);
      logSummarySuccess(summaryStyle, summaryData.length, durationMs, estimatedTokens);

      // Cache the complete summary
      setCachedSummary(article.url, summaryStyle, summaryData);
      setCompletedSummary(summaryData);

      // Show success toast
      if (toastRef.current) {
        toastRef.current.style = Toast.Style.Success;
        toastRef.current.title = "Summary generated";
        toastRef.current.message = `${getStyleLabel(summaryStyle)} (${(durationMs! / 1000).toFixed(1)}s)`;
      }
    }
  }, [summaryData, summaryStyle, article, isSummarizing, completedSummary, cachedSummary, summaryStartTime]);

  // Handle summarization with cache check
  const handleSummarize = useCallback(
    async (style: SummaryStyle) => {
      if (!article) return;

      setSummaryStyle(style);
      setCachedSummaryState(null);

      // Check cache first
      const cached = await getCachedSummary(article.url, style);
      if (cached) {
        setCachedSummaryState(cached);
        return;
      }

      // Generate new summary
      const prompt = buildSummaryPrompt(article.title, article.textContent, style);
      setSummaryPrompt(prompt);
    },
    [article],
  );

  useEffect(() => {
    // Prevent duplicate fetches from React StrictMode
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;

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
        // Check if this is a blocked error (403) that could be resolved via browser extension
        if (fetchResult.error.type === "blocked" && fetchResult.error.statusCode === 403) {
          // First, try automatic fallback: check if URL is already open in a browser tab
          const browserResult = await tryGetContentFromOpenTab(urlResult.url);

          if (browserResult.status === "success") {
            urlLog.log("fetch:auto-fallback-success", { url: urlResult.url });
            setArticle(browserResult.article);
            setIsLoading(false);
            return;
          }

          if (browserResult.status === "fetch_failed") {
            // Tab exists but we couldn't get content (likely inactive tab timeout)
            urlLog.log("fetch:tab-found-but-failed", {
              url: urlResult.url,
              tabId: browserResult.tab.id,
              tabTitle: browserResult.tab.title,
              isActive: browserResult.tab.active,
            });
            setFoundTab(browserResult.tab);
            setHasBrowserExtension(true);
            setBlockedUrl(urlResult.url);
            setError(fetchResult.error.message);
            setIsLoading(false);
            return;
          }

          // Tab not found - show manual browser extension flow
          const extensionAvailable = await isBrowserExtensionAvailable();
          setHasBrowserExtension(extensionAvailable);
          setBlockedUrl(urlResult.url);
          urlLog.log(extensionAvailable ? "fetch:blocked-with-extension" : "fetch:blocked-no-extension", {
            url: urlResult.url,
          });
        }
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
      const formatted = formatArticle(parseResult.article.title, parseResult.article.content);

      urlLog.log("session:ready", {
        url: urlResult.url,
        title: formatted.title,
        markdownLength: formatted.markdown.length,
      });

      const newArticle = {
        bodyMarkdown: formatted.markdown,
        title: parseResult.article.title,
        byline: parseResult.article.byline,
        siteName: parseResult.article.siteName,
        url: urlResult.url,
        source: urlResult.source,
        textContent: parseResult.article.textContent,
      };
      setArticle(newArticle);
      setIsLoading(false);
    }

    loadArticle();
  }, [props.arguments.url]);

  // Auto-trigger summary generation when article loads (if enabled)
  useEffect(() => {
    if (article && shouldShowSummary && !summaryInitialized) {
      setSummaryInitialized(true);
      handleSummarize(preferences.defaultSummaryStyle);
    }
  }, [article, shouldShowSummary, summaryInitialized, handleSummarize, preferences.defaultSummaryStyle]);

  // Handler to fetch content via browser extension after user opens the page
  const handleFetchFromBrowser = useCallback(async () => {
    if (!blockedUrl) return;

    setIsWaitingForBrowser(true);
    setError(null);

    const result = await getContentFromActiveTab(blockedUrl);

    if (result.success) {
      setArticle(result.article);
      setBlockedUrl(null);
    } else {
      setError(result.error);
    }

    setIsWaitingForBrowser(false);
  }, [blockedUrl]);

  if (isLoading) {
    return <Detail isLoading={true} markdown="" />;
  }

  // Special handling for blocked pages with browser extension fallback
  if (blockedUrl && error) {
    // Different message if we found the tab but couldn't fetch from it
    const foundTabMarkdown = foundTab
      ? `# Page Found in Browser

This page is already open in your browser${foundTab.title ? ` ("${foundTab.title}")` : ""}, but we couldn't fetch its content automatically.

**Press Enter** to switch to that tab, then press **⌘ + R** to fetch the content.

*The browser extension needs the tab to be active to read its content.*`
      : null;

    const blockedMarkdown = foundTabMarkdown
      ? foundTabMarkdown
      : hasBrowserExtension
        ? `# Page Blocked

This website is preventing Raycast from downloading its content directly.

**To read this page:**
1. Press **Enter** or click the action below to open it in your browser
2. Wait for the page to fully load
3. Press **⌘ + R** to fetch the content via the Raycast browser extension

*The Raycast browser extension will be used to get the page content.*`
        : `# Page Blocked

This website is preventing Raycast from downloading its content directly.

**To read this page**, install the [Raycast browser extension](https://www.raycast.com/browser-extension) and try again.

Once installed, you'll be able to open blocked pages in your browser and fetch their content through the extension.`;

    return (
      <Detail
        markdown={blockedMarkdown}
        isLoading={isWaitingForBrowser}
        actions={
          <ActionPanel>
            {hasBrowserExtension && (
              <>
                <Action.OpenInBrowser
                  title={foundTab ? "Switch to Tab" : "Open in Browser"}
                  url={blockedUrl}
                  icon={foundTab ? Icon.ArrowRight : Icon.Globe}
                />
                <Action
                  title="Fetch Content from Browser"
                  icon={Icon.Download}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={handleFetchFromBrowser}
                />
              </>
            )}
            {!hasBrowserExtension && (
              <Action.OpenInBrowser
                title="Get Raycast Browser Extension"
                url="https://www.raycast.com/browser-extension"
                icon={Icon.Download}
                shortcut={Keyboard.Shortcut.Common.Open}
              />
            )}
            <Action.CopyToClipboard
              title="Copy URL"
              content={blockedUrl}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (error || !article) {
    return <Detail markdown={`# Error\n\n${error || "Unable to load article"}`} />;
  }

  // Get the current summary (from cache or AI generation)
  const currentSummary = cachedSummary || summaryData;

  // Build markdown from structured data: title → metadata → summary → body
  const buildMarkdown = () => {
    const parts: string[] = [];

    // 1. Title
    parts.push(`# ${article.title}`);

    // 2. Metadata (byline • siteName)
    const metaParts: string[] = [];
    if (article.byline) metaParts.push(article.byline);
    if (article.siteName) metaParts.push(article.siteName);
    if (metaParts.length > 0) {
      parts.push("", `*${metaParts.join(" • ")}*`);
    }

    // 3. Summary section (if applicable)
    if (shouldShowSummary && summaryStyle) {
      parts.push("", "---");

      if (isSummarizing && currentSummary) {
        // Streaming in progress - show partial summary
        parts.push("", formatSummaryBlock(currentSummary, summaryStyle), "", "*Generating summary...*");
      } else if (isSummarizing) {
        // Just started, no data yet
        parts.push("", "> Generating summary...");
      } else if (currentSummary) {
        // Complete summary
        parts.push("", formatSummaryBlock(currentSummary, summaryStyle));
      }

      parts.push("", "---");
    } else {
      // No summary - just add separator before body
      parts.push("", "---");
    }

    // 4. Body content
    parts.push("", article.bodyMarkdown);

    return parts.join("\n");
  };

  return (
    <Detail
      markdown={buildMarkdown()}
      navigationTitle={article.title}
      isLoading={isSummarizing}
      actions={
        <ActionPanel>
          {canAccessAI && (
            <ActionPanel.Submenu
              title={currentSummary ? "Regenerate Summary…" : "Summarize…"}
              icon={Icon.Stars}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
            >
              {SUMMARY_STYLES.map(({ style, icon }) => (
                <Action key={style} title={getStyleLabel(style)} icon={icon} onAction={() => handleSummarize(style)} />
              ))}
            </ActionPanel.Submenu>
          )}
          {currentSummary && (
            <Action.CopyToClipboard
              title="Copy Summary"
              content={currentSummary}
              shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            />
          )}
          <Action.CopyToClipboard
            title="Copy as Markdown"
            content={buildMarkdown()}
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
