import { useState, useEffect, useCallback, useRef } from "react";
import { Detail, LaunchProps, environment, AI, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useAI } from "@raycast/utils";
import { urlLog } from "./utils/logger";
import { getContentFromActiveTab } from "./utils/browser-extension";
import { BrowserTab } from "./types/browser";
import { SummaryStyle } from "./types/summary";
import { getStyleLabel, buildSummaryPrompt, logSummarySuccess, logSummaryError } from "./utils/summarizer";
import { getCachedSummary, setCachedSummary } from "./utils/summaryCache";
import { getAIConfigForStyle } from "./config/ai";
import { resolveUrl, isValidUrl } from "./utils/url-resolver";
import { loadArticleFromUrl } from "./utils/article-loader";
import { ArticleState } from "./types/article";
import { UrlInputForm } from "./views/UrlInputForm";
import { BlockedPageView } from "./views/BlockedPageView";
import { NotReadableView } from "./views/NotReadableView";
import { EmptyContentView } from "./views/EmptyContentView";
import { ArticleDetailView } from "./views/ArticleDetailView";

type ReaderArguments = {
  url: string;
};

const MINIMUM_ARTICLE_LENGTH = 100;

export default function Command(props: LaunchProps<{ arguments: ReaderArguments }>) {
  const preferences = getPreferenceValues<Preferences.Open>();
  const canAccessAI = environment.canAccess(AI);
  const shouldShowSummary = canAccessAI && preferences.enableAISummary;

  // Article state
  const [article, setArticle] = useState<ArticleState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Blocked page state
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [hasBrowserExtension, setHasBrowserExtension] = useState(false);
  const [isWaitingForBrowser, setIsWaitingForBrowser] = useState(false);
  const [foundTab, setFoundTab] = useState<BrowserTab | null>(null);

  // Not-readable page state
  const [notReadableUrl, setNotReadableUrl] = useState<string | null>(null);

  // URL form state
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [invalidInput, setInvalidInput] = useState<string | null>(null);

  // Summary state
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle | null>(null);
  const [summaryPrompt, setSummaryPrompt] = useState<string>("");
  const [cachedSummary, setCachedSummaryState] = useState<string | null>(null);
  const [summaryInitialized, setSummaryInitialized] = useState(false);
  const [summaryStartTime, setSummaryStartTime] = useState<number | null>(null);
  const [completedSummary, setCompletedSummary] = useState<string | null>(null);

  // Refs
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

      toastRef.current = await showToast({
        style: Toast.Style.Animated,
        title: "Generating summary...",
      });
    },
    onError: async (err) => {
      if (summaryStyle) {
        const durationMs = summaryStartTime ? Date.now() - summaryStartTime : undefined;
        logSummaryError(summaryStyle, err.message, durationMs);

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
      const durationMs = summaryStartTime ? Date.now() - summaryStartTime : undefined;
      const estimatedTokens = Math.ceil(summaryData.length / 4);
      logSummarySuccess(summaryStyle, summaryData.length, durationMs, estimatedTokens);

      const language = summaryStyle === "translated" ? preferences.translationLanguage : undefined;
      setCachedSummary(article.url, summaryStyle, summaryData, language);
      setCompletedSummary(summaryData);

      if (toastRef.current) {
        toastRef.current.style = Toast.Style.Success;
        toastRef.current.title = "Summary generated";
        toastRef.current.message = `${getStyleLabel(summaryStyle)} (${(durationMs! / 1000).toFixed(1)}s)`;
      }
    }
  }, [
    summaryData,
    summaryStyle,
    article,
    isSummarizing,
    completedSummary,
    cachedSummary,
    summaryStartTime,
    preferences.translationLanguage,
  ]);

  // Handle summarization with cache check
  const handleSummarize = useCallback(
    async (style: SummaryStyle) => {
      if (!article) return;

      setSummaryStyle(style);
      setCachedSummaryState(null);

      const language = style === "translated" ? preferences.translationLanguage : undefined;
      const cached = await getCachedSummary(article.url, style, language);
      if (cached) {
        setCachedSummaryState(cached);
        return;
      }

      const translationOptions = language ? { language } : undefined;
      const prompt = buildSummaryPrompt(article.title, article.textContent, style, translationOptions);
      setSummaryPrompt(prompt);
    },
    [article, preferences.translationLanguage],
  );

  // Process article loading result
  const handleLoadResult = useCallback((result: Awaited<ReturnType<typeof loadArticleFromUrl>>) => {
    if (result.status === "success") {
      setArticle(result.article);
      setBlockedUrl(null);
      setNotReadableUrl(null);
      setError(null);
    } else if (result.status === "blocked") {
      setBlockedUrl(result.url);
      setHasBrowserExtension(result.hasBrowserExtension);
      setFoundTab(result.foundTab);
      setError(result.error);
    } else if (result.status === "not-readable") {
      setNotReadableUrl(result.url);
      setError(result.error);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  // Initial article load
  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;

    async function loadArticle() {
      urlLog.log("session:start", { argumentUrl: props.arguments.url });

      const urlResult = await resolveUrl(props.arguments.url);
      if (!urlResult) {
        urlLog.error("session:error", { reason: "no valid URL found" });
        if (props.arguments.url && props.arguments.url.trim()) {
          setInvalidInput(props.arguments.url.trim());
        }
        setShowUrlForm(true);
        setIsLoading(false);
        return;
      }

      const result = await loadArticleFromUrl(urlResult.url, urlResult.source, {
        skipPreCheck: preferences.skipPreCheck,
      });
      handleLoadResult(result);
    }

    loadArticle();
  }, [props.arguments.url, preferences.skipPreCheck, handleLoadResult]);

  // Auto-trigger summary generation when article loads (if enabled)
  // Don't generate summary for articles that bypassed readability check
  useEffect(() => {
    if (article && shouldShowSummary && !summaryInitialized && !article.bypassedReadabilityCheck) {
      setSummaryInitialized(true);
      handleSummarize(preferences.defaultSummaryStyle);
      urlLog.log("summary:auto-triggered", { url: article.url });
    } else if (article && article.bypassedReadabilityCheck) {
      urlLog.log("summary:skipped-bypassed-check", { url: article.url });
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

  // Handler to retry loading without readability check
  const handleRetryWithoutCheck = useCallback(async () => {
    if (!notReadableUrl) return;

    setIsLoading(true);
    setNotReadableUrl(null);
    setError(null);

    urlLog.log("session:retry-without-check", { url: notReadableUrl });

    const result = await loadArticleFromUrl(notReadableUrl, "retry", {
      skipPreCheck: true,
    });
    handleLoadResult(result);
  }, [notReadableUrl, handleLoadResult]);

  // Handler for URL form submission
  const handleUrlSubmit = useCallback(
    async (url: string) => {
      setShowUrlForm(false);
      setInvalidInput(null);
      setIsLoading(true);
      setError(null);
      fetchStartedRef.current = false;

      urlLog.log("session:start", { argumentUrl: url, source: "form" });

      if (!isValidUrl(url)) {
        setError(`Invalid URL: "${url}"`);
        setIsLoading(false);
        return;
      }

      const result = await loadArticleFromUrl(url, "form", {
        skipPreCheck: preferences.skipPreCheck,
      });
      handleLoadResult(result);
    },
    [preferences.skipPreCheck, handleLoadResult],
  );

  // --- Render Logic ---

  if (isLoading) {
    return <Detail isLoading={true} markdown="" />;
  }

  if (showUrlForm) {
    return (
      <UrlInputForm
        initialUrl={invalidInput || undefined}
        invalidInput={invalidInput || undefined}
        onSubmit={handleUrlSubmit}
      />
    );
  }

  if (notReadableUrl && error) {
    return <NotReadableView url={notReadableUrl} error={error} onRetryWithoutCheck={handleRetryWithoutCheck} />;
  }

  if (blockedUrl && error) {
    return (
      <BlockedPageView
        blockedUrl={blockedUrl}
        hasBrowserExtension={hasBrowserExtension}
        isWaitingForBrowser={isWaitingForBrowser}
        foundTab={foundTab}
        onFetchFromBrowser={handleFetchFromBrowser}
      />
    );
  }

  if (error || !article) {
    return <Detail markdown={`# Error\n\n${error || "Unable to load article"}`} />;
  }

  // Check if article has minimal or no content
  const hasMinimalContent = article.bodyMarkdown.trim().length < MINIMUM_ARTICLE_LENGTH;
  if (hasMinimalContent) {
    urlLog.warn("article:empty-content", {
      url: article.url,
      markdownLength: article.bodyMarkdown.length,
      bypassedCheck: article.bypassedReadabilityCheck,
    });
    return <EmptyContentView url={article.url} title={article.title} />;
  }

  const currentSummary = cachedSummary || summaryData;

  return (
    <ArticleDetailView
      article={article}
      summaryStyle={summaryStyle}
      currentSummary={currentSummary || null}
      isSummarizing={isSummarizing}
      shouldShowSummary={shouldShowSummary}
      canAccessAI={canAccessAI}
      onSummarize={handleSummarize}
    />
  );
}
