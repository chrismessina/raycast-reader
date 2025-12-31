import { parseHTML } from "linkedom";
import { parseLog } from "./logger";
import { getQuirksForHostname } from "./quirks";

/**
 * Selectors for elements that should be removed before Readability processing.
 * Based on patterns from Safari Reader Mode and Reader View.
 */
const NEGATIVE_SELECTORS = [
  // Sidebars
  '[class*="sidebar"]',
  '[id*="sidebar"]',
  '[class*="side-bar"]',
  '[id*="side-bar"]',

  // Comments
  '[class*="comment"]',
  '[id*="comment"]',
  "#disqus_thread",
  ".disqus",

  // Subscription/Newsletter boxes
  '[class*="subscribe"]',
  '[id*="subscribe"]',
  '[class*="newsletter"]',
  '[id*="newsletter"]',
  '[class*="signup"]',
  '[id*="signup"]',
  '[class*="sign-up"]',
  '[id*="sign-up"]',
  '[aria-label*="newsletter"]',
  '[aria-label*="subscribe"]',

  // Advertisements
  '[class*="advertisement"]',
  '[id*="advertisement"]',
  '[class*="ad-container"]',
  '[class*="ad-wrapper"]',
  '[class*="ad-slot"]',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class*="sponsored"]',
  '[id*="sponsored"]',
  "[data-ad]",
  "[data-advertisement]",

  // Social/Sharing widgets
  '[class*="social"]',
  '[id*="social"]',
  '[class*="share"]',
  '[id*="share"]',
  '[class*="sharing"]',
  '[id*="sharing"]',

  // Related content
  '[class*="related"]',
  '[id*="related"]',
  '[class*="recommended"]',
  '[id*="recommended"]',
  '[class*="promo"]',
  '[id*="promo"]',
  '[class*="more-stories"]',
  '[class*="more-articles"]',

  // Navigation
  "nav",
  '[role="navigation"]',
  '[class*="breadcrumb"]',
  '[id*="breadcrumb"]',

  // Complementary content
  '[role="complementary"]',

  // Footer elements (often contain unrelated content)
  '[class*="footer"]',
  '[id*="footer"]',

  // Widgets and toolbars
  '[class*="widget"]',
  '[id*="widget"]',
  '[class*="toolbar"]',
  '[id*="toolbar"]',
  '[class*="toolbox"]',

  // Carousels and sliders
  '[class*="carousel"]',
  '[id*="carousel"]',
  '[class*="swiper"]',
  '[class*="slider"]',
  '[id*="slider"]',

  // Tags and meta
  '[class*="tags"]',
  '[class*="meta"]',
  '[class*="talkback"]',

  // Popups and modals
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="overlay"]',
];

/**
 * Selectors that indicate the element should be preserved even if it matches negative patterns.
 * These are typically the main article content containers.
 */
const PROTECTED_SELECTORS = [
  "article",
  '[role="main"]',
  "main",
  '[itemprop="articleBody"]',
  '[itemtype*="schema.org/Article"]',
  '[itemtype*="schema.org/NewsArticle"]',
  ".post-content",
  ".article-content",
  ".entry-content",
  ".content-body",
  ".story-body",
];

/**
 * Lazy-load image attributes to check, in priority order.
 * Based on Safari Reader's lazyLoadingImageURLForElement function.
 */
const LAZY_LOAD_ATTRIBUTES = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "datasrc",
  "original-src",
  "data-srcset",
  "data-lazy-srcset",
  "data-hi-res-src",
  "data-native-src",
];

export interface CleaningResult {
  html: string;
  removedCount: number;
  lazyImagesResolved: number;
  schemaArticleFound: boolean;
  quirksApplied: string | null;
}

/**
 * Pre-cleans HTML before Readability processing.
 * Removes sidebars, ads, comments, subscription boxes, and other non-article content.
 */
export function preCleanHtml(html: string, url: string): CleaningResult {
  const { document } = parseHTML(html);
  let removedCount = 0;
  let lazyImagesResolved = 0;
  let schemaArticleFound = false;
  let quirksApplied: string | null = null;

  // Check for Schema.org article containers
  const schemaArticle = document.querySelector(
    '[itemprop="articleBody"], [itemtype*="schema.org/Article"], [itemtype*="schema.org/NewsArticle"]',
  );
  if (schemaArticle) {
    schemaArticleFound = true;
    parseLog.log("clean:schema-detected", { url });
  }

  // Apply site-specific quirks
  try {
    const hostname = new URL(url).hostname;
    const quirks = getQuirksForHostname(hostname);
    if (quirks) {
      quirksApplied = quirks.name;
      parseLog.log("clean:quirks-applied", { url, quirks: quirks.name });

      // Remove elements specified by quirks
      if (quirks.removeSelectors) {
        quirks.removeSelectors.forEach((selector: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          document.querySelectorAll(selector).forEach((el: any) => {
            el.remove();
            removedCount++;
          });
        });
      }
    }
  } catch {
    // Invalid URL, skip quirks
  }

  // Build a set of protected elements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedElements = new Set<any>();
  PROTECTED_SELECTORS.forEach((selector) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document.querySelectorAll(selector).forEach((el: any) => {
      protectedElements.add(el);
      // Also protect all ancestors
      let parent = el.parentElement;
      while (parent) {
        protectedElements.add(parent);
        parent = parent.parentElement;
      }
    });
  });

  // Remove negative elements (unless protected)
  NEGATIVE_SELECTORS.forEach((selector) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      document.querySelectorAll(selector).forEach((el: any) => {
        // Don't remove if it's protected or inside a protected element
        if (protectedElements.has(el)) return;

        // Check if any ancestor is protected
        let parent = el.parentElement;
        let isProtected = false;
        while (parent) {
          if (protectedElements.has(parent)) {
            isProtected = true;
            break;
          }
          parent = parent.parentElement;
        }

        if (!isProtected) {
          el.remove();
          removedCount++;
        }
      });
    } catch {
      // Some selectors might fail in linkedom, skip them
    }
  });

  // Resolve lazy-loaded images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document.querySelectorAll("img").forEach((img: any) => {
    const currentSrc = img.getAttribute("src");
    const isPlaceholder =
      !currentSrc ||
      currentSrc.startsWith("data:") ||
      currentSrc.includes("placeholder") ||
      currentSrc.includes("transparent") ||
      currentSrc.includes("blank");

    if (isPlaceholder) {
      for (const attr of LAZY_LOAD_ATTRIBUTES) {
        const lazySrc = img.getAttribute(attr);
        if (lazySrc && !lazySrc.startsWith("data:")) {
          if (attr.includes("srcset")) {
            img.setAttribute("srcset", lazySrc);
          } else {
            img.setAttribute("src", lazySrc);
          }
          lazyImagesResolved++;
          break;
        }
      }
    }
  });

  parseLog.log("clean:complete", {
    url,
    removedCount,
    lazyImagesResolved,
    schemaArticleFound,
    quirksApplied,
  });

  return {
    html: document.toString(),
    removedCount,
    lazyImagesResolved,
    schemaArticleFound,
    quirksApplied,
  };
}
