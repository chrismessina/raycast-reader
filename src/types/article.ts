export interface ArticleState {
  bodyMarkdown: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  source: string;
  textContent: string;
  bypassedReadabilityCheck?: boolean;
}
