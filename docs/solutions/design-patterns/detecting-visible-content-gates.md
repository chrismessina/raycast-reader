---
title: "Detecting a visible content-gate vs. inert barrier markup"
date: 2026-07-14
category: design-patterns
module: paywall-detection
problem_type: design_pattern
component: service_object
severity: medium
applies_when:
  - "Code must decide whether markup (a paywall/registration barrier, a gate, a modal) is actually rendered and visible to the reader — not merely present in the HTML — from the static HTML string alone, with no network access."
tags: [paywall-detection, dom-visibility, html-parsing, linkedom, false-positives, content-gating]
related_components:
  - "src/utils/paywall-detector.ts"
  - "src/extractors/_paywall.ts"
  - "src/utils/article-loader.ts"
  - "docs/known-issues.md"
  - "docs/paywall-hopper.md"
---

# Detecting a visible content-gate vs. inert barrier markup

> **Note on frontmatter:** `component: service_object` is the closest fit in the (Rails-oriented) schema enum for a stateless TypeScript utility module; no enum value was invented. `paywall-detector.ts` is a pure-function module — the extension's analogue of a service object.

## Context

You have static HTML for a page you fetched, and you need to decide whether the page is *actually* gating its content — a paywall, a registration wall, a consent/ad wall — versus a fully readable page that merely happens to ship gating markup it never shows.

The tempting first question is: **"does barrier markup exist in the HTML?"** It is the wrong question, and every cheap variant of it is wrong for the same underlying reason: *existence in the byte stream is not the same as being shown to the reader.* Modern sites routinely ship paywall scaffolding on **every** page — including their fully-free ones — and reveal it with JavaScript only when a metering rule trips. The markup for the barrier is present in the HTML of an article you can read end to end.

The failure mode is expensive and asymmetric. In reader-mode's paywall detector, a false "this is paywalled" verdict routes a perfectly readable article into a bypass waterfall — six network attempts at archive services and alternate fetches — and can end up **replacing the good content the reader already had with a worse archived copy** (see the cost note on `PAYWALL_SCORE_THRESHOLD`, `src/utils/paywall-detector.ts:44-55`, threshold at line 55). So the detector treats a barrier element as *conclusive* evidence (weight 3, clears the threshold alone — `CONCLUSIVE`, `src/utils/paywall-detector.ts:58`) precisely *because* it only counts barriers it has proven are **visible**. A conclusive signal you cannot trust is worse than no signal.

The approaches that fail, in the order a team naturally tries them:

1. **Regex-scan the raw HTML for barrier class/id substrings.** Matches barrier markup *anywhere* — inside a `<template>`, a `<script>` string, `<head>` metadata, or inert body markup. A readable article that ships an inactive paywall template gets convicted on markup that never rendered.
2. **Strip the obvious inert container blocks from the HTML string, then regex the rest.** Better, but still fooled by *element-level* hidden markup in the body: `<div hidden class="paywall">`, an inline `style="display:none"`, a `class` the page's own stylesheet hides. And it has a structural ceiling it can never clear: a barrier nested inside a **hidden ancestor** is visible in the string but invisible on the page, and a regex cannot reason about nesting at all. Visibility is an ancestor-chain property; string matching has no ancestors.

The insight that ends the regression: **you are not asking "is this substring present?" You are asking "would a reader see this element?"** That is a computed-visibility question, and it can only be answered against a parsed DOM.

## Guidance

Parse the HTML into a DOM and, for each candidate barrier element, decide visibility by **walking the element's ancestor chain** — an element is hidden if it *or any ancestor* is hidden. Only a barrier that survives this walk (visible to a reader) is conclusive evidence.

In reader-mode's paywall detector the entry point is `findVisibleBarrier` (`src/utils/paywall-detector.ts:345`), called from `detectPaywall` only when raw HTML is available. It parses once with linkedom, then queries each barrier selector and returns the first match that is **not** hidden:

```ts
function findVisibleBarrier(html: string): string | null {
  let document;
  try { ({ document } = parseHTML(html)); } catch { return null; }

  const hidingRules = collectHidingRules(html);          // stylesheet-driven hiding, see below

  for (const selector of BARRIER_SELECTORS) {            // src/utils/paywall-detector.ts:80
    let elements;
    try {
      elements = document.querySelectorAll(caseInsensitive(selector));
    } catch {
      continue;                                          // linkedom rejects some selectors; skip
    }
    for (let i = 0; i < elements.length; i++) {
      if (!isElementHidden(elements[i], hidingRules)) {
        return selector;                                 // a VISIBLE barrier — conclusive
      }
    }
  }
  return null;
}
```

The visibility test itself is the core of the technique — `isElementHidden` (`src/utils/paywall-detector.ts:309`). It ascends from the element to the document root, and reports "hidden" the moment *any* node in the chain is hidden by any of four static-HTML mechanisms:

```ts
const INERT_TAGS = new Set(["TEMPLATE", "HEAD", "SCRIPT", "STYLE", "NOSCRIPT"]);  // line 217

function isElementHidden(element, rules): boolean {
  let current = element;
  while (current) {
    // 1. inert container tag — its contents never render
    if (current.tagName && INERT_TAGS.has(current.tagName.toUpperCase())) return true;
    // 2. the `hidden` boolean attribute
    if (current.getAttribute("hidden") !== null) return true;
    // 3. inline display:none / visibility:hidden
    const style = (current.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
    // 4. a class/id the page's own inline <style> hides (see collectHidingRules)
    if (matchesHidingRule(current, rules)) return true;

    current = current.parentElement;                     // walk up — visibility is inherited
  }
  return false;
}
```

Four mechanisms, checked at every ancestor. Miss any one and hidden markup leaks through as a false positive; check only the element and not its ancestors and a barrier under a hidden wrapper leaks through.

**Trap 1 — attribute-substring selectors are case-SENSITIVE.** `querySelectorAll('[class*="paywall"]')` will *not* match `class="Paywall"`. If you are migrating from a case-*insensitive* regex, the DOM version silently starts missing real barriers that use capitalized class names — a false negative introduced by the migration itself. The fix is the CSS case-insensitive flag `i`, which linkedom supports. reader-mode's detector applies it to every attribute clause of every selector via `caseInsensitive` (`src/utils/paywall-detector.ts:341`) before querying:

```ts
// [class*="paywall"]  ->  [class*="paywall" i]
function caseInsensitive(selector: string): string {
  return selector.replace(/(=["'][^"']*["'])\]/g, "$1 i]");
}
```

**Trap 2 — `aria-hidden` is NOT visual hiding.** `aria-hidden="true"` removes an element from the **accessibility tree**, not from the page. A paywall a sighted reader plainly sees can carry `aria-hidden` (sites do this constantly to keep an overlay out of the screen-reader flow). Treating `aria-hidden` as "hidden" is a **false negative** — you would wave through a real barrier. reader-mode's detector deliberately omits `aria-hidden` from `isElementHidden`; the omission is load-bearing and documented in the function's doc comment (`src/utils/paywall-detector.ts:306`), not an oversight.

**Stylesheet-driven hiding.** A page can hide a barrier with zero inline attributes: `<style>.gate{display:none}</style>` plus `<div class="gate">`. Neither the element nor any ancestor carries `hidden` or an inline style, so mechanisms 1–3 miss it. `collectHidingRules` (`src/utils/paywall-detector.ts:240`) closes this gap by scanning the page's inline `<style>` blocks for rules whose declarations contain `display:none`/`visibility:hidden` and collecting the **simple `.class` / `#id` selectors** those rules hide:

```ts
function collectHidingRules(html: string): HidingRules {
  const classes = new Set<string>(), ids = new Set<string>();
  const styleBlocks = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
  for (const block of styleBlocks) {
    const css = block.replace(/<\/?style\b[^>]*>/gi, "");
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let rule;
    while ((rule = ruleRe.exec(css))) {
      const decls = rule[2].replace(/\s+/g, "").toLowerCase();
      if (!decls.includes("display:none") && !decls.includes("visibility:hidden")) continue;
      for (const sel of rule[1].split(",")) {
        const simple = sel.trim().match(/^([.#])([\w-]+)$/);   // only bare .class / #id
        if (!simple) continue;
        (simple[1] === "." ? classes : ids).add(simple[2]);
      }
    }
  }
  return { classes, ids };
}
```

`matchesHidingRule` (`src/utils/paywall-detector.ts:270`) then checks each ancestor's `id` and space-split `class` list against those collected sets, and `isElementHidden` treats a match as hidden. Note the deliberate scope: **only simple `.class`/`#id` selectors** are collected. A compound or descendant selector the scanner can't cheaply evaluate is skipped, which errs toward treating the element as *visible* — a possible missed positive, never a false one. That direction is chosen on purpose: for a *conclusive* signal, a missed detection is far cheaper than a wrong conviction.

## Why This Matters

**The cost of the wrong answer is asymmetric, so the technique optimizes the expensive direction.** A false positive here doesn't just mislabel — it *acts*: it sends a readable article through a slow, destructive bypass path and can overwrite the reader's good content with a degraded archived parse. A false negative merely fails to help a page you couldn't have helped much anyway. That asymmetry is why the barrier signal is allowed to be conclusive *only* after visibility is proven, and why every ambiguous call in the visibility logic (skipped complex selectors, `aria-hidden` exclusion) is tuned to avoid the expensive error even at the cost of the cheap one.

**The durable insight is visibility ≠ existence.** Any detector that answers "is X in the markup?" when the real question is "does the user see X?" will be defeated by inert, templated, or JS-gated markup — and defeated *silently*, because the markup really is there. The only reliable answer is a computed-visibility check against a parsed DOM, walking the ancestor chain, because visibility is an inherited property no flat scan can reconstruct.

**Accepted limitation — external stylesheets.** `collectHidingRules` can only read **inline** `<style>` blocks. A barrier hidden purely by a *linked* stylesheet (`<link rel="stylesheet">`) is invisible to the reader but counted **visible** by the detector, because the scoring path has **no network access** and cannot fetch the CSS. This is a known, bounded, and *accepted* limitation (documented in [`docs/known-issues.md`](../../known-issues.md#paywall-detection-barriers-hidden-by-external-stylesheets) and in the `isElementHidden` doc comment, `src/utils/paywall-detector.ts:299-304`) — deliberately not fixed, for two reasons: (1) there is no reliable corroborating signal to lean on instead — on real paywalls the barrier element is the *only* evidence that survives content extraction, so weakening the barrier signal to hedge against this case would blind the detector to genuine paywalls; and (2) the harm is bounded downstream — `article-loader` only accepts a bypass replacement that is meaningfully longer (>20%) than what it already had, so a misfire rarely degrades the reader's actual experience. Fixing it would trade a real, well-bounded edge case for a network dependency and a broader class of failures. The right call was to bound and document, not to chase.

## When to Apply

Reach for computed-DOM-visibility whenever you must decide, from **static HTML**, whether markup is actually *shown to a user* — and especially whenever you are **migrating a string/regex check to a DOM check**, because that migration is where the two subtle traps above get introduced.

- **Content gating**: paywalls, registration/subscription walls, metered-article barriers.
- **Consent / ad / cookie walls**: is the overlay actually blocking the page, or dormant markup?
- **Generic "is this element rendered?"**: any scraping, extraction, or classification step whose correctness depends on what a reader sees rather than what the bytes contain.
- **Any time barrier/target markup is commonly shipped-but-hidden**: templated components, A/B-test variants, JS-revealed overlays — the exact conditions that make an existence check lie.

Do **not** settle for a string/regex existence check in any of these; it cannot express "hidden by an ancestor," and it will fail silently. If you are moving *from* such a check, audit for the case-sensitivity and `aria-hidden` traps before shipping.

## Examples

**1. Regex-anywhere → DOM-visible.** The core before/after.

```ts
// BEFORE — convicts on markup that never renders:
if (/class="[^"]*paywall/i.test(html)) markPaywalled();
//   matches inside <template>, <script>, <head>, <div hidden>, and under any hidden ancestor.

// AFTER — convicts only on a barrier a reader would actually see:
const barrier = findVisibleBarrier(html);   // parse DOM, query selectors, walk ancestors
if (barrier) markPaywalled();
```

**2. Case-insensitive selector fix.** Preserve the regex's case-insensitivity when moving to `querySelectorAll`.

```ts
document.querySelectorAll('[class*="paywall"]')        // MISSES class="Paywall"
document.querySelectorAll('[class*="paywall" i]')      // matches Paywall, PAYWALL, paywall
// applied programmatically to every clause by caseInsensitive(selector)
```

**3. `aria-hidden` exclusion.** Do not add it to your "hidden" checks.

```ts
// A visible paywall overlay, kept out of the a11y tree but plainly on screen:
<div class="paywall-modal" aria-hidden="true"> Subscribe to continue </div>
// isElementHidden checks `hidden`, inline display:none, inert tags, stylesheet rules —
// but NOT aria-hidden. This element is correctly classified VISIBLE -> conclusive barrier.
```

**4. Stylesheet-rule collection.** Catch the no-inline-attribute hide.

```html
<style>.gate{display:none}</style>
<div class="gate"><div class="paywall">Members only</div></div>
```
```ts
// collectHidingRules -> { classes: {"gate"}, ids: {} }
// isElementHidden walks .paywall -> its ancestor .gate matches a hiding rule -> HIDDEN.
// The barrier is correctly NOT counted. (An inline `style="display:none"` on .gate
// would be caught by mechanism 3 without any rule collection.)
```

**5. Non-tautological visibility test.** A visibility test is worthless — it passes for the wrong reason — if its fixture text independently trips a *different*, text-based signal. In this detector a gating **phrase** in the fixture (e.g. "subscribe to continue") fires `barrier-phrase` on its own (`src/utils/paywall-detector.ts:143-146`), so a test that used such text would pass whether or not the *element* visibility logic worked at all.

```ts
// TAUTOLOGICAL — passes via the phrase check even if barrier-element never fired:
const html = `<div class="paywall">Subscribe to continue reading</div>`;
expect(detectPaywall({ textContent, html }, url).isPaywalled).toBe(true);   // proves nothing

// CORRECT — neutral text that trips no phrase check, and assert the SPECIFIC signal:
const html = `<div class="paywall">Members zone</div>`;
const result = detectPaywall({ textContent: "Members zone", html }, url);
expect(result.signals.map(s => s.name)).toContain("barrier-element");        // the signal you meant to exercise
```

Assert the *named signal* you intend to exercise (`barrier-element`), not just the boolean verdict, and pick fixture text ("members zone") that cannot satisfy any other path to that verdict. Otherwise a green test is evidence only that *some* code fired — not that the code under test did.

## Related

- [`docs/known-issues.md`](../../known-issues.md#paywall-detection-barriers-hidden-by-external-stylesheets) — the external-stylesheet blind spot: the pattern's one accepted limitation, with its bounded-harm rationale.
- [`docs/paywall-hopper.md`](../../paywall-hopper.md) — the bypass flow this detection step feeds; the downstream consumer of the barrier signal.
- `src/utils/paywall-detector.ts` — the implementation (`detectPaywall`, `findVisibleBarrier`, `isElementHidden`, `collectHidingRules`).
- `src/utils/article-loader.ts` — runs the detector alongside Readability; home of the >20%-longer replacement guard that bounds a false positive's harm.
- Shipped in [raycast/extensions#29451](https://github.com/raycast/extensions/pull/29451) (the reader-mode Store submission).
