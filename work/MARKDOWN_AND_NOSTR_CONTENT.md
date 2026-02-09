# Markdown & Nostr content rendering (Grimoire reference + Zapstore path)

**Goal:** Render lots of Nostr event content that contains Markdown and Nostr references (npub, nevent, naddr, note, nprofile) in a fast, clean way.

---

## What Grimoire uses

Grimoire uses **two pipelines** depending on content type:

### 1. Long-form Markdown (articles, NIPs, descriptions)

**Location:** `grimoire-main/src/components/nostr/MarkdownContent.tsx`

| Layer | Package | Role |
|-------|---------|------|
| **Markdown → React** | `react-markdown` | Renders markdown string to React elements at runtime |
| **GFM** | `remark-gfm` | GitHub Flavored Markdown (tables, strikethrough, autolinks, etc.) |
| **Nostr in markdown** | `remarkNostrMentions` from **`applesauce-content/markdown`** | Remark plugin that parses Nostr refs inside markdown and turns them into nodes react-markdown can render |
| **Link handling** | Custom `components.a` | For every `<a>`: if `href.startsWith("nostr:")`, decode with `nip19.decode()`, then render `<UserName>`, `<EmbeddedEvent>`, or fallback link |

Flow:

1. Content string → `ReactMarkdown` with `remarkPlugins={[remarkGfm, remarkNostrMentions]}`.
2. `remarkNostrMentions` runs in the remark AST and turns Nostr identifiers into something that becomes `nostr:` links in the output.
3. Custom `a` component sees those links, decodes with `nostr-tools` nip19, and renders profile/event embeds or plain links.

So: **react-markdown + remark-gfm + applesauce-content (remarkNostrMentions) + custom link component using nip19.**

### 2. Short-form / note content (kind 1 style, NIP-08)

**Location:** `grimoire-main/src/components/nostr/RichText.tsx`

- **applesauce-content**: `textNoteTransformers`, NAST (Node AST), `useRenderedContent` hook.
- Content is parsed into an AST (not full markdown), then rendered with custom components: `Text`, `Hashtag`, `Mention`, `Link`, `Emoji`, `Gallery`, `Nip`, `Relay`.
- Custom transformers add NIP and relay references (`nipReferences`, `relayReferences`).

This is a **custom parser + AST renderer**, not a generic markdown pipeline. Use this when you need the same “note with mentions/hashtags/links” behavior as Grimoire.

---

## Packages in Grimoire (relevant to markdown + Nostr)

From `grimoire-main/package.json`:

- **react-markdown** – runtime markdown rendering
- **remark-gfm** – GFM support
- **applesauce-content** – provides:
  - `remarkNostrMentions` (remark plugin for Nostr refs in markdown)
  - `textNoteTransformers` + NAST for short-form note parsing
  - `findAndReplace` and NAST types for custom transformers
- **nostr-tools** – `nip19.decode()` for npub/nprofile/note/nevent/naddr in the link component

---

## Recommended path for Zapstore (Svelte)

You need **runtime** markdown (event content from Nostr), plus **Nostr reference handling**. You don’t have React, so no `react-markdown`; you need a Svelte-friendly pipeline.

### Option A: Same ecosystem (remark + applesauce-content) in the browser

- Add **applesauce-content** (same as Grimoire) and use **remark** + **remark-gfm** + **remarkNostrMentions** in the browser.
- Run a **remark → rehype → rehype-stringify** (or unified) pipeline to produce an **HTML string**, then render with `{@html}` in Svelte.
- **Catch:** With raw `{@html}` you can’t use Svelte components for Nostr links. You either:
  - Output normal `<a href="nostr:...">` and handle them with a single `click` listener on the container that delegates and decodes with nip19, then e.g. navigate or open a modal, or
  - Use a **rehype** plugin that turns `nostr:` links into custom elements or placeholders you later replace with Svelte components (more work).

So: **Unified (remark + rehype + rehype-stringify) + remark-gfm + remarkNostrMentions + applesauce-content**, then `{@html}` plus **one event-delegation handler** for `nostr:` links (decode with nip19, route to profile/event/app page or embed). That gives you the same “fast, clean” markdown + Nostr refs as Grimoire, without React.

### Option B: Lightweight markdown lib + manual Nostr pass

- Use a small runtime markdown lib (**marked** or **markdown-it**) with a **custom renderer** for links.
- In the link renderer: if `href` is `nostr:` or matches `npub1...` / `nevent1...` / etc., output a predictable HTML shape (e.g. `<a data-nostr="npub1...">`) and keep the decoded data in a `data-*` attribute or a small inline script.
- In Svelte, render the result with `{@html}` and use **one delegated click handler** on the container: if target is `[data-nostr]`, decode (if needed) and route. Optionally, a separate pass over the markdown string **before** markdown parsing could detect Nostr refs and wrap them in that link format so the markdown renderer doesn’t escape them.

This avoids adding **applesauce-content** and keeps the bundle smaller, but you reimplement “Nostr refs in text” yourself (regex or a small tokenizer).

---

## Recommendation

- For **maximum alignment with Grimoire** and minimal custom code: **Option A** – **unified** + **remark-gfm** + **applesauce-content**’s **remarkNostrMentions**, output HTML, then `{@html}` + **one delegated handler** for `nostr:` links (decode with **nostr-tools** nip19, same as Grimoire).
- For **minimal deps** and “good enough” behavior: **Option B** – **marked** (or similar) + custom link renderer + delegated click handler for Nostr links; optionally a pre-pass to wrap Nostr refs in links.

Both are “fast and clean” if you keep the handler simple and avoid per-link Svelte components inside the HTML blob. The main design choice is: reuse **applesauce-content** (and its remark plugin) vs. a small markdown lib + your own Nostr-link handling.

---

## References

- Grimoire markdown: `grimoire-main/src/components/nostr/MarkdownContent.tsx`
- Grimoire RichText (short-form): `grimoire-main/src/components/nostr/RichText.tsx` and `RichText/*`
- Grimoire deps: `grimoire-main/package.json` (`react-markdown`, `remark-gfm`, `applesauce-content`)
