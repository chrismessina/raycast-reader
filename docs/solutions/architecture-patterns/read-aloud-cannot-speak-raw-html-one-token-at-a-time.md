---
title: "Read Aloud cannot speak raw HTML one marked token at a time: the element context is gone before the converter sees it"
date: 2026-11-19
category: architecture-patterns
module: reader-mode-raycast-extension
problem_type: architecture_pattern
component: read-aloud
severity: medium
applies_when:
  - "Making Read Aloud speak the prose inside raw HTML in an article's Markdown"
  - "A review finding says raw HTML blocks are silent in Read Aloud and proposes converting each `html` token"
  - "Changing how `speakBlocks` or `speakInlineToken` in src/utils/read-aloud.ts treat `html` tokens"
related_components:
  - src/utils/read-aloud.ts (readAloudText, speakBlocks, speakInlineToken)
  - src/utils/markdown.ts (turndown.remove)
  - src/utils/markdown-source.ts
tags: [read-aloud, say, marked, turndown, raw-html, speech, codex-redesign]
---

# Read Aloud cannot speak raw HTML one marked token at a time

## Context

Read Aloud builds its speech from the article's Markdown. It parses the Markdown with `marked` and walks the tokens (`speakBlocks` and `speakInlineToken` in `src/utils/read-aloud.ts`). Raw HTML arrives as `html` tokens, and both walkers drop them: `// code, hr, html, space, def: nothing to say.` at `src/utils/read-aloud.ts:81` and `// image, html, checkbox: nothing to say.` at `src/utils/read-aloud.ts:117`.

On raycast/extensions#33708, Greptile flagged a P2: prose inside a raw HTML block, such as `<div class="note"><p>…</p></div>`, is never spoken. This session made two attempts to speak it. Both converted one `html` token at a time, and Codex reviewed both:

1. **A regex tag stripper** turned each `html` token into text. Codex round 9 returned PATCH with four defects:
   - script or style text leaked when the element was split across tokens;
   - a quoted `>` in an attribute (`alt="a > diagram"`) or a bare `<` in prose (`< 5 mg`) broke the stripping;
   - code and URLs inside the HTML were spoken;
   - the `<[^>]*>` scan was quadratic on a long run of `<`.
2. **Turndown on each token.** The token was converted back to Markdown with turndown, then spoken. This fixed the attribute, bare-`<` and quadratic defects. Codex round 10 returned **REDESIGN**:
   - **Split elements still leak.** `marked` ends an HTML block at a blank line, so `<div><script>\n\ntrack(42)\n</script>…` arrives as an HTML token followed by a paragraph token holding `track(42)`. The converter never sees the `<script>` that encloses the second token.
   - **`<pre>` without `<code>` is spoken.** Turndown treats `<pre>` as a code fence only when `<code>` is its first child, so `<div><pre>const secret = 42;</pre></div>` reads the code aloud.
   - **Escaped prose is dropped.** Turndown decodes `&lt;div&gt;Important prose&lt;/div&gt;` into literal `<div>…</div>`. `marked` then classifies that as HTML again, and the whole block goes silent.

Codex summed it up: "Repeatedly converting isolated marked tokens cannot establish those guarantees." Chris chose to revert both attempts, and the shipped code drops raw HTML again. The Greptile finding was declined in its thread.

## Guidance

- **Don't add raw-HTML speech inside the token walkers.** A `marked` token is a fragment. It holds no record of the element it opened in (script, style, pre, code), so no per-token converter can tell prose from code or script.
- **Speaking raw HTML properly needs one pass over the whole article.** Build the speech from a single DOM:
  - render the full Markdown to HTML once;
  - parse that HTML once;
  - walk text nodes while skipping `script`, `style`, `pre`, `code`, `img` and comments;
  - keep decoded text as text and never re-parse it.

  This is a separate change, not a fix inside `speakBlocks`.
- **Test any new attempt against the five cases Codex used**, before review:

  ```text
  split:   <div><script>\n\ntrack(42)\n</script>\n<p>Visible.</p></div>   → must not say track(42)
  inline:  Before <script>track(42)</script> after.                        → must not say track(42)
  pre:     <div><pre>const secret = 42;</pre></div>                        → must not say the code
  escaped: <div>&lt;div&gt;Important prose&lt;/div&gt;</div>                → must say "<div>Important prose</div>"
  attrs:   <div><img alt="a > diagram"><p>Real prose.</p></div>            → must say only "Real prose."
  ```

## Why This Matters

Two review rounds and two reverted commits went into learning that the approach itself can't work. The revert commit records the conclusion in one line, but not the cases that prove it. Without them, the next person to pick up this finding will likely build the same per-token converter first.

**Residual in the shipped code.** On the current tree, two of those cases still speak script text, even with raw HTML dropped (probe run 2026-11-19):

- `split` yields `track(42)`. The paragraph token that follows the HTML block is ordinary prose to `speakBlocks`.
- `inline` yields `Before track(42) after.`. `speakInlineToken` drops the `<script>` and `</script>` tags one at a time but speaks the text between them.

Both are limited to Markdown the site serves itself (a `.md` URL, an `Accept: text/markdown` response or a linked Markdown alternate; see `src/utils/markdown-source.ts`). HTML articles never contain these cases, because `src/utils/markdown.ts:34` removes `script` and `style` elements before Read Aloud sees the Markdown. The single-pass design above fixes both, since it knows which element each text node sits in.

## When to Apply

- Before replying to, or acting on, a review finding about raw HTML in Read Aloud.
- Before changing how either walker in `src/utils/read-aloud.ts` treats `html` tokens.
- When choosing how to build speech from Markdown in another extension that gets Markdown from outside sources.

## Examples

Rejected: converting one token at a time inside the walker. This is the round-10 shape, and it was reverted.

```ts
case "html":
  out.push(speakHtml(token.text)); // turndown → marked → speakBlocks, per token
  break;
```

Kept: drop the token, and leave raw-HTML speech to a later single-pass change.

```ts
// code, hr, html, space, def: nothing to say.
```

The Greptile thread on raycast/extensions#33708 (merged 2026-11-18) holds the decline reply, and the revert commit is titled "revert: Read Aloud leaves raw HTML blocks silent".
