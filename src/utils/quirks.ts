/**
 * Site-specific quirks for content extraction.
 * Based on Safari Reader Mode's quirks list approach.
 *
 * Some websites have non-standard HTML structures that require custom handling
 * to properly extract article content.
 */

export interface SiteQuirks {
  name: string;
  articleSelector?: string;
  removeSelectors?: string[];
  preferSchemaOrg?: boolean;
}

/**
 * Common selectors to remove across all sites.
 * Based on EasyList and common ad/distraction patterns.
 */
export const COMMON_REMOVE_SELECTORS = [
  // Outbrain and Taboola
  "#taboola-below-article-thumbnails",
  ".OUTBRAIN",
  "[data-widget-id^='outbrain']",
  ".taboola-container",

  // Generic ads
  "[id^='div-gpt-ad']",
  ".ad-container",
  ".sidebar-ad",
  ".banner-ad",

  // Social sharing
  ".share-buttons",
  ".social-share",
  "[data-testid='share-button']",

  // Comments (often loaded separately)
  "#disqus_thread",
  ".userComments",
  ".comments-section",

  // Video overlays
  "#primis-holder",
  ".aniview-inline-player",
  ".amp-connatix-player",

  // Newsletter signups
  ".newsletter-signup",
  ".newsletter-inline",
  ".email-signup",
];

/**
 * Hostname patterns mapped to their quirks configuration.
 * Patterns are tested against the hostname using regex.
 */
const QUIRKS_LIST: Array<[RegExp, SiteQuirks]> = [
  // Wikipedia
  [
    /^(.*\.)?wikipedia\.org$/i,
    {
      name: "Wikipedia",
      articleSelector: "#mw-content-text",
      removeSelectors: [
        ".mw-editsection",
        ".navbox",
        ".vertical-navbox",
        ".sistersitebox",
        ".mbox-small",
        "#coordinates",
        ".reference",
        ".reflist",
        "#toc",
        ".toc",
        ".infobox",
        ".sidebar",
        ".hatnote",
        ".metadata",
      ],
    },
  ],

  // Medium
  [
    /^(.*\.)?medium\.com$/i,
    {
      name: "Medium",
      articleSelector: "article",
      removeSelectors: [
        '[data-testid="headerSocialShareButton"]',
        '[data-testid="audioPlayButton"]',
        ".pw-multi-vote-count",
        '[aria-label="responses"]',
        '[data-testid="storyFooter"]',
      ],
    },
  ],

  // Substack
  [
    /^(.*\.)?substack\.com$/i,
    {
      name: "Substack",
      articleSelector: ".body",
      removeSelectors: [
        ".subscribe-widget",
        ".subscription-widget",
        ".footer",
        ".comments-section",
        ".share-dialog",
        ".post-footer",
      ],
    },
  ],

  // New York Times
  [
    /^(.*\.)?nytimes\.com$/i,
    {
      name: "NYTimes",
      articleSelector: "article",
      removeSelectors: [
        '[data-testid="share-tools"]',
        ".ad",
        ".newsletter-signup",
        '[data-testid="inline-message"]',
        ".story-footer",
      ],
    },
  ],

  // The Guardian
  [
    /^(.*\.)?theguardian\.com$/i,
    {
      name: "Guardian",
      articleSelector: '[itemprop="articleBody"]',
      removeSelectors: [".submeta", ".content-footer", ".contributions__epic", ".ad-slot", ".js-most-popular-footer"],
    },
  ],

  // BBC
  [
    /^(.*\.)?bbc\.(com|co\.uk)$/i,
    {
      name: "BBC",
      articleSelector: "article",
      removeSelectors: [
        '[data-component="related-topics"]',
        '[data-component="links-block"]',
        ".ssrcss-1q0x1qg-Promo",
        ".ssrcss-1mrs5ns-PromoLink",
      ],
    },
  ],

  // Washington Post
  [
    /^(.*\.)?washingtonpost\.com$/i,
    {
      name: "WashingtonPost",
      articleSelector: "article",
      removeSelectors: [".hide-for-print", ".dn-print", '[data-qa="subscribe-promo"]', ".newsletter-inline"],
    },
  ],

  // Ars Technica
  [
    /^(.*\.)?arstechnica\.com$/i,
    {
      name: "ArsTechnica",
      articleSelector: ".article-content",
      removeSelectors: [".sidebar", ".ad", ".related-stories", ".comment-counts"],
    },
  ],

  // The Verge
  [
    /^(.*\.)?theverge\.com$/i,
    {
      name: "TheVerge",
      articleSelector: ".duet--article--article-body-component",
      removeSelectors: [".duet--ad--ad-wrapper", ".duet--recirculation--related-list"],
    },
  ],

  // Wired
  [
    /^(.*\.)?wired\.com$/i,
    {
      name: "Wired",
      articleSelector: ".body__inner-container",
      removeSelectors: [".ad", ".newsletter-subscribe-form", ".related-content"],
    },
  ],

  // TechCrunch
  [
    /^(.*\.)?techcrunch\.com$/i,
    {
      name: "TechCrunch",
      articleSelector: ".entry-content",
      removeSelectors: [".embed-tc-newsletter", ".related-posts", ".ad-unit", ".wp-block-techcrunch-inline-cta"],
    },
  ],

  // Hacker News - handles both story pages and comment pages
  [
    /^news\.ycombinator\.com$/i,
    {
      name: "HackerNews",
      articleSelector: ".fatitem",
      removeSelectors: [
        ".votearrow",
        ".votelinks",
        ".hnmore",
        ".morelink",
        "form[action='comment']",
        ".reply",
        "input",
        "textarea",
        ".navs",
        ".pagetop",
        "#hnmain > tbody > tr:first-child", // Header row
        "#hnmain > tbody > tr:last-child", // Footer row
      ],
      preferSchemaOrg: false,
    },
  ],

  // GitHub - handles READMEs, Issues, PRs, and discussions
  [
    /^(.*\.)?github\.com$/i,
    {
      name: "GitHub",
      articleSelector: '[data-testid="issue-viewer-issue-container"], .markdown-body, .js-comment-body',
      removeSelectors: [
        ".octicon",
        ".anchor",
        ".zeroclipboard-container",
        ".js-clipboard-copy",
        "button",
        '[data-testid*="button"]',
        '[data-testid*="menu"]',
        ".gh-header-sticky",
        '[data-testid="issue-metadata-sticky"]',
        ".timeline-comment-actions",
        ".comment-reactions",
        ".js-comment-edit-button",
        ".details-overlay",
        ".select-menu",
        ".dropdown-menu",
        ".tooltipped",
        ".Label",
        ".IssueLabel",
        ".State",
        "[data-view-component='true'][class*='Button']",
        ".ActionListItem",
        ".AppHeader",
        ".js-header-wrapper",
        ".footer",
      ],
      preferSchemaOrg: true,
    },
  ],

  // Stack Overflow
  [
    /^(.*\.)?stackoverflow\.com$/i,
    {
      name: "StackOverflow",
      articleSelector: ".question, .answer",
      removeSelectors: [".js-vote-count", ".post-menu", ".comments", ".s-anchors"],
    },
  ],

  // Reddit - handles both new and old Reddit
  [
    /^(.*\.)?reddit\.com$/i,
    {
      name: "Reddit",
      articleSelector: '[data-test-id="post-content"], .expando, .usertext-body, [slot="text-body"]',
      removeSelectors: [
        '[data-testid="vote-arrows"]',
        ".promotedlink",
        '[data-testid="share-button"]',
        ".share-button",
        ".post-voting",
        ".tagline",
        ".buttons",
        ".report-button",
        ".crosspost-preview",
        "[data-click-id='share']",
        "[data-click-id='award']",
        ".award-button",
        "shreddit-post-overflow-menu",
        "faceplate-dropdown-menu",
      ],
      preferSchemaOrg: true,
    },
  ],

  // YouTube - extract video description and metadata
  [
    /^(.*\.)?(youtube\.com|youtu\.be)$/i,
    {
      name: "YouTube",
      articleSelector: "#description, ytd-text-inline-expander, #content",
      removeSelectors: [
        "#chat",
        "#comments",
        "#related",
        "#secondary",
        "ytd-watch-next-secondary-results-renderer",
        "ytd-comments",
        "ytd-merch-shelf-renderer",
        "#ticket-shelf",
        "#clarify-box",
        "#info-strings",
        "#menu",
        "#actions",
        "#subscribe-button",
        "ytd-subscribe-button-renderer",
        ".ytp-ce-element",
        ".ytp-cards-teaser",
      ],
      preferSchemaOrg: true,
    },
  ],

  // Apple
  [
    /^(.*\.)?apple\.com$/i,
    {
      name: "Apple",
      articleSelector: '*[itemprop="articleBody"]',
      preferSchemaOrg: true,
    },
  ],

  // Engadget
  [
    /^(.*\.)?engadget\.com$/i,
    {
      name: "Engadget",
      articleSelector: "main article #page_body",
      removeSelectors: [".ad", ".newsletter-signup"],
    },
  ],

  // CNET
  [
    /^(.*\.)?cnet\.com$/i,
    {
      name: "CNET",
      articleSelector: "#rbContent.container",
      removeSelectors: [".ad", ".newsletter-signup"],
    },
  ],

  // Mashable
  [
    /^(.*\.)?mashable\.com$/i,
    {
      name: "Mashable",
      articleSelector: ".parsec-body .parsec-container",
      removeSelectors: [".ad", ".newsletter-signup"],
    },
  ],

  // BuzzFeed
  [
    /^(.*\.)?buzzfeed\.com$/i,
    {
      name: "BuzzFeed",
      articleSelector: "article #buzz_sub_buzz",
      removeSelectors: [".ad", ".newsletter-signup", ".share-buttons"],
    },
  ],

  // The Intercept
  [
    /^(.*\.)?theintercept\.com$/i,
    {
      name: "TheIntercept",
      articleSelector: ".PostContent",
      removeSelectors: [".ad", ".newsletter-signup", ".share-tools"],
    },
  ],

  // IETF (technical documents)
  [
    /^(.*\.)?ietf\.org$/i,
    {
      name: "IETF",
      articleSelector: "div.content",
      removeSelectors: [".nav", ".sidebar"],
    },
  ],

  // Bloomberg
  [
    /^(.*\.)?bloomberg\.com$/i,
    {
      name: "Bloomberg",
      articleSelector: "article",
      removeSelectors: [".ad", '[data-component="paywall"]', ".newsletter-signup", ".sticky-ad", ".right-rail"],
    },
  ],

  // Reuters
  [
    /^(.*\.)?reuters\.com$/i,
    {
      name: "Reuters",
      articleSelector: '[data-testid="article-body"]',
      removeSelectors: [".ad", '[data-testid="Slideshow"]', ".related-coverage", ".trust-principles"],
    },
  ],

  // Forbes
  [
    /^(.*\.)?forbes\.com$/i,
    {
      name: "Forbes",
      articleSelector: ".article-body",
      removeSelectors: [".ad", ".forbes-subscribe", ".newsletter-tout", "#taboola-below-article-thumbnails", ".fs-ad"],
    },
  ],

  // Atlantic
  [
    /^(.*\.)?theatlantic\.com$/i,
    {
      name: "TheAtlantic",
      articleSelector: "article .article-body",
      removeSelectors: [".ad", ".newsletter-inline-unit", ".related-articles", "#paywall-portal-root"],
    },
  ],

  // Vice
  [
    /^(.*\.)?vice\.com$/i,
    {
      name: "Vice",
      articleSelector: ".article__body",
      removeSelectors: [".ad", ".newsletter-signup", ".related-articles", ".topics-strip"],
    },
  ],

  // Vox
  [
    /^(.*\.)?vox\.com$/i,
    {
      name: "Vox",
      articleSelector: ".c-entry-content",
      removeSelectors: [".ad", ".m-newsletter-signup", ".c-article-footer", ".c-read-more"],
    },
  ],

  // Polygon (same network as Vox)
  [
    /^(.*\.)?polygon\.com$/i,
    {
      name: "Polygon",
      articleSelector: ".c-entry-content",
      removeSelectors: [".ad", ".m-newsletter-signup", ".c-article-footer"],
    },
  ],

  // CNN
  [
    /^(.*\.)?cnn\.com$/i,
    {
      name: "CNN",
      articleSelector: ".article__content",
      removeSelectors: [
        ".ad",
        ".el__leafmedia--source-link",
        ".related-content",
        '[data-zone-label="modal"]',
        ".ad-feedback-link-container",
        ".video-resource-elevate",
      ],
    },
  ],

  // Axios
  [
    /^(.*\.)?axios\.com$/i,
    {
      name: "Axios",
      articleSelector: ".article-content",
      removeSelectors: [".ad", ".newsletter-signup", ".story-footer", ".stream-item-container"],
    },
  ],

  // Quartz
  [
    /^(.*\.)?qz\.com$/i,
    {
      name: "Quartz",
      articleSelector: "article .article-content",
      removeSelectors: [".ad", ".paywall-gate", ".newsletter-signup", ".related-content"],
    },
  ],

  // Ghost (self-hosted and ghost.io)
  [
    /^(.*\.)?ghost\.(io|org)$/i,
    {
      name: "Ghost",
      articleSelector: ".gh-content, .post-content",
      removeSelectors: [".gh-sidebar", ".gh-subscribe", ".gh-navigation", ".gh-footer"],
    },
  ],

  // Squarespace
  [
    /squarespace\.com$/i,
    {
      name: "Squarespace",
      articleSelector: ".blog-item-content, .entry-content",
      removeSelectors: [".sqs-block-newsletter", ".sqs-block-social-accounts", ".sqs-block-archive"],
    },
  ],

  // Drupal (common patterns)
  [
    /drupal\.(org|com)$/i,
    {
      name: "Drupal",
      articleSelector: ".field--name-body, .node__content",
      removeSelectors: [".field--name-field-tags", ".links", ".comment-wrapper"],
    },
  ],

  // WordPress.com (hosted blogs)
  [
    /^(.*\.)?wordpress\.com$/i,
    {
      name: "WordPress.com",
      articleSelector: ".entry-content, .post-content",
      removeSelectors: [".sharedaddy", ".jp-relatedposts", ".wpl-likebox", ".post-likes-widget"],
    },
  ],

  // Blogger/Blogspot
  [
    /^(.*\.)?blogspot\.com$/i,
    {
      name: "Blogger",
      articleSelector: ".post-body, .entry-content",
      removeSelectors: [".blog-pager", ".post-share-buttons", ".reactions", ".post-footer"],
    },
  ],

  // Tumblr
  [
    /^(.*\.)?tumblr\.com$/i,
    {
      name: "Tumblr",
      articleSelector: ".post-content, .body-text",
      removeSelectors: [".post-notes", ".reblog-header", ".post-controls", ".like-button"],
    },
  ],
];

/**
 * Gets the quirks configuration for a given hostname.
 * Returns null if no quirks are defined for the hostname.
 */
export function getQuirksForHostname(hostname: string): SiteQuirks | null {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");

  for (const [pattern, quirks] of QUIRKS_LIST) {
    if (pattern.test(normalizedHostname)) {
      return quirks;
    }
  }

  return null;
}

/**
 * Gets the article selector for a hostname, if one is defined.
 */
export function getArticleSelectorForHostname(hostname: string): string | null {
  const quirks = getQuirksForHostname(hostname);
  return quirks?.articleSelector ?? null;
}
