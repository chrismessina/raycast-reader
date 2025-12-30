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
      removeSelectors: [
        ".submeta",
        ".content-footer",
        ".contributions__epic",
        ".ad-slot",
        ".js-most-popular-footer",
      ],
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
      articleSelector: ".article-content",
      removeSelectors: [".embed-tc-newsletter", ".related-posts", ".ad-unit"],
    },
  ],

  // Hacker News (for linked articles)
  [
    /^news\.ycombinator\.com$/i,
    {
      name: "HackerNews",
      articleSelector: ".fatitem",
      removeSelectors: [".votearrow", ".votelinks"],
    },
  ],

  // GitHub (for READMEs and discussions)
  [
    /^(.*\.)?github\.com$/i,
    {
      name: "GitHub",
      articleSelector: ".markdown-body",
      removeSelectors: [".octicon", ".anchor", ".zeroclipboard-container"],
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

  // Reddit
  [
    /^(.*\.)?reddit\.com$/i,
    {
      name: "Reddit",
      articleSelector: '[data-test-id="post-content"]',
      removeSelectors: ['[data-testid="vote-arrows"]', ".promotedlink", '[data-testid="share-button"]'],
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
