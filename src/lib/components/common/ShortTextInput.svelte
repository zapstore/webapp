<script lang="ts">
  /**
   * ShortTextInput - TipTap-based rich input with @mentions and :emoji: (tippy.js popups)
   */
  import { onMount, onDestroy } from "svelte";
  import { Editor, Node, mergeAttributes } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Mention from "@tiptap/extension-mention";
  import Placeholder from "@tiptap/extension-placeholder";
  import Suggestion from "@tiptap/suggestion";
  import tippy from "tippy.js";
  import "tippy.js/dist/tippy.css";
  import { hexToColor, rgbToCssString } from "$lib/utils/color.js";
  import * as nip19 from "nostr-tools/nip19";
  import { Camera, EmojiFill, Gif, Plus, Send, ChevronDown } from "$lib/components/icons";

  type SizePreset = "small" | "medium" | "large";
  type ProfileHit = {
    pubkey: string;
    name?: string;
    displayName?: string;
    picture?: string;
    nip05?: string;
  };
  type EmojiHit = { shortcode: string; url: string; source: string };

  interface Props {
    placeholder?: string;
    searchProfiles?: (query: string) => Promise<ProfileHit[]>;
    searchEmojis?: (query: string) => Promise<EmojiHit[]>;
    autoFocus?: boolean;
    size?: SizePreset;
    className?: string;
    showActionRow?: boolean;
    onCameraTap?: () => void;
    onEmojiTap?: () => void;
    onGifTap?: () => void;
    onAddTap?: () => void;
    onChevronTap?: () => void;
    onchange?: (event: { content: string }) => void;
    onsubmit?: (event: { text: string; emojiTags: { shortcode: string; url: string }[]; mentions: string[] }) => void;
  }

  let {
    placeholder = "Write something...",
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    autoFocus = false,
    size = "small",
    className = "",
    showActionRow = true,
    onCameraTap = () => {},
    onEmojiTap = () => {},
    onGifTap = () => {},
    onAddTap = () => {},
    onChevronTap = () => {},
    onchange,
    onsubmit,
  }: Props = $props();

  const sizeMap: Record<SizePreset, { minHeight: number; maxHeight: number }> = {
    small: { minHeight: 40, maxHeight: 120 },
    medium: { minHeight: 80, maxHeight: 200 },
    large: { minHeight: 160, maxHeight: 400 },
  };
  const dimensions = $derived(sizeMap[size] ?? sizeMap.small);

  let editorElement = $state<HTMLDivElement | null>(null);
  let editor = $state<Editor | null>(null);
  let suggestionPopup: ReturnType<typeof tippy>[0] | null = null;
  let currentSuggestionType = $state<"profile" | "emoji" | null>(null);
  let suggestionItems = $state<unknown[]>([]);
  let selectedIndex = $state(0);
  let isScrollable = $state(false);

  function checkScrollable() {
    if (editorElement) {
      const scrollContainer = editorElement.querySelector(".ProseMirror");
      if (scrollContainer) {
        isScrollable = scrollContainer.scrollHeight > scrollContainer.clientHeight;
      }
    }
  }

  type CommandFn = (item: unknown) => void;

  function updateSuggestionContent(
    container: HTMLElement,
    type: "profile" | "emoji",
    items: unknown[],
    selected: number,
    command: CommandFn,
    isSelectionOnlyUpdate = false
  ) {
    if (!container) return;
    if (isSelectionOnlyUpdate) {
      const btns = container.querySelectorAll(".suggestion-item");
      btns.forEach((btn, idx) => btn.classList.toggle("selected", idx === selected));
      return;
    }
    if (items.length === 0) {
      container.innerHTML = `
        <div class="suggestion-menu suggestion-menu-empty">
          <span class="suggestion-empty-text">No ${type === "profile" ? "profiles" : "emojis"} found</span>
        </div>
      `;
      return;
    }
    const escapeAttr = (s: string) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const itemsHtml = items
      .map((item: unknown, index: number) => {
        if (type === "profile") {
          const p = item as ProfileHit;
          const name = p.displayName || p.name || p.pubkey?.slice(0, 8);
          const rgb = hexToColor(p.pubkey);
          const nameColor = rgbToCssString(rgb);
          return `
            <button type="button" class="suggestion-item ${index === selected ? "selected" : ""}" data-index="${index}">
              <div class="suggestion-profile-pic">
                ${p.picture ? `<img src="${escapeAttr(p.picture)}" alt="${escapeAttr(name)}" class="profile-img" decoding="async" />` : `<div class="profile-fallback">${name?.[0]?.toUpperCase() ?? "?"}</div>`}
              </div>
              <div class="suggestion-profile-info">
                <span class="suggestion-profile-name" style="color: ${escapeAttr(nameColor)}">${escapeAttr(name)}</span>
              </div>
            </button>
          `;
        } else {
          const e = item as EmojiHit;
          return `
            <button type="button" class="suggestion-item ${index === selected ? "selected" : ""}" data-index="${index}">
              ${e.source === "unicode" ? `<span class="emoji-unicode">${e.url}</span>` : `<img src="${e.url}" alt="${e.shortcode}" class="emoji-img" />`}
              <span class="emoji-shortcode">${e.shortcode}</span>
            </button>
          `;
        }
      })
      .join("");
    container.innerHTML = `<div class="suggestion-menu suggestion-menu-${type}">${itemsHtml}</div>`;
    container.querySelectorAll(".suggestion-item").forEach((btn, idx) => {
      btn.addEventListener("click", () => command(items[idx]));
      btn.addEventListener("mouseenter", () => {
        selectedIndex = idx;
        updateSuggestionContent(container, type, items, idx, command, true);
      });
    });
  }

  function createProfileSuggestion() {
    return {
      char: "@",
      allowSpaces: false,
      items: async ({ query }: { query: string }) => {
        const results = await searchProfiles(query);
        return results.slice(0, 8);
      },
      render: () => {
        let popup: ReturnType<typeof tippy>;
        let container: HTMLElement;
        return {
          onStart: (props: { items: unknown[]; clientRect?: () => DOMRect; command: CommandFn }) => {
            currentSuggestionType = "profile";
            suggestionItems = props.items ?? [];
            selectedIndex = 0;
            container = document.createElement("div");
            container.className = "suggestion-container";
            updateSuggestionContent(container, "profile", suggestionItems, selectedIndex, props.command);
            popup = tippy("body", {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: container,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "top-start",
              offset: [0, 8],
              arrow: false,
              animation: false,
              popperOptions: { modifiers: [{ name: "flip", enabled: true }] },
            });
            suggestionPopup = popup[0];
          },
          onUpdate: (props: { items: unknown[]; clientRect?: () => DOMRect; command: CommandFn }) => {
            suggestionItems = props.items ?? [];
            selectedIndex = 0;
            updateSuggestionContent(container, "profile", suggestionItems, selectedIndex, props.command);
            if (props.clientRect) popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
          },
          onKeyDown: (props: { event: KeyboardEvent; command: CommandFn }) => {
            if (props.event.key === "Escape") {
              popup[0]?.hide();
              return true;
            }
            if (props.event.key === "ArrowUp") {
              selectedIndex = (selectedIndex - 1 + suggestionItems.length) % suggestionItems.length;
              updateSuggestionContent(container, "profile", suggestionItems, selectedIndex, props.command, true);
              return true;
            }
            if (props.event.key === "ArrowDown") {
              selectedIndex = (selectedIndex + 1) % suggestionItems.length;
              updateSuggestionContent(container, "profile", suggestionItems, selectedIndex, props.command, true);
              return true;
            }
            if (props.event.key === "Enter" || props.event.key === "Tab") {
              const item = suggestionItems[selectedIndex];
              if (item) props.command(item);
              return true;
            }
            return false;
          },
          onExit: () => {
            popup[0]?.destroy();
            suggestionPopup = null;
            currentSuggestionType = null;
          },
        };
      },
    };
  }

  const EmojiNode = Node.create({
    name: "emoji",
    group: "inline",
    inline: true,
    atom: true,
    addAttributes() {
      return { id: { default: null }, url: { default: null }, source: { default: null } };
    },
    parseHTML: () => [{ tag: "span[data-emoji]" }],
    renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes({ "data-emoji": HTMLAttributes.id }, HTMLAttributes)],
    renderText: ({ node }) => (node.attrs.source === "unicode" ? node.attrs.url || "" : `:${node.attrs.id}:`),
    addNodeView: () => {
      return ({ node }) => {
        const { url, source, id } = node.attrs;
        const dom = document.createElement("span");
        dom.className = "emoji-node";
        dom.setAttribute("data-emoji", id || "");
        if (source === "unicode" && url) {
          dom.textContent = url;
          dom.title = `:${id}:`;
        } else if (url) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = `:${id}:`;
          img.className = "inline-emoji";
          img.draggable = false;
          dom.appendChild(img);
        } else {
          dom.textContent = `:${id}:`;
        }
        return { dom };
      };
    },
  });

  function createEmojiExtension() {
    return EmojiNode.extend({
      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            char: ":",
            allowSpaces: false,
            items: async ({ query }: { query: string }) => {
              const results = await searchEmojis(query ?? "");
              return results.slice(0, 12);
            },
            command: ({ editor: ed, range, props }: { editor: Editor; range: { from: number; to: number }; props: EmojiHit }) => {
              ed.chain()
                .focus()
                .insertContentAt(range, [
                  { type: "emoji", attrs: { id: props.shortcode, url: props.url, source: props.source } },
                  { type: "text", text: " " },
                ])
                .run();
            },
            render: () => {
              let popup: ReturnType<typeof tippy>;
              let container: HTMLElement;
              return {
                onStart: (props: { items: unknown[]; clientRect?: () => DOMRect; command: CommandFn }) => {
                  currentSuggestionType = "emoji";
                  suggestionItems = props.items ?? [];
                  selectedIndex = 0;
                  container = document.createElement("div");
                  container.className = "suggestion-container";
                  updateSuggestionContent(container, "emoji", suggestionItems, selectedIndex, props.command);
                  popup = tippy("body", {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: container,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "top-start",
                    offset: [0, 8],
                    arrow: false,
                    animation: false,
                  });
                  suggestionPopup = popup[0];
                },
                onUpdate: (props: { items: unknown[]; clientRect?: () => DOMRect; command: CommandFn }) => {
                  suggestionItems = props.items ?? [];
                  selectedIndex = 0;
                  updateSuggestionContent(container, "emoji", suggestionItems, selectedIndex, props.command);
                  if (props.clientRect) popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
                },
                onKeyDown: (props: { event: KeyboardEvent; command: CommandFn }) => {
                  if (props.event.key === "Escape") {
                    popup[0]?.hide();
                    return true;
                  }
                  if (props.event.key === "ArrowUp") {
                    selectedIndex = (selectedIndex - 1 + suggestionItems.length) % suggestionItems.length;
                    updateSuggestionContent(container, "emoji", suggestionItems, selectedIndex, props.command, true);
                    return true;
                  }
                  if (props.event.key === "ArrowDown") {
                    selectedIndex = (selectedIndex + 1) % suggestionItems.length;
                    updateSuggestionContent(container, "emoji", suggestionItems, selectedIndex, props.command, true);
                    return true;
                  }
                  if (props.event.key === "Enter" || props.event.key === "Tab") {
                    const item = suggestionItems[selectedIndex];
                    if (item) props.command(item);
                    return true;
                  }
                  return false;
                },
                onExit: () => {
                  popup[0]?.destroy();
                  suggestionPopup = null;
                  currentSuggestionType = null;
                },
              };
            },
          }),
        ];
      },
    });
  }

  function getContent(): string {
    return editor?.getText({ blockSeparator: "\n" }) ?? "";
  }

  function getSerializedContent(): { text: string; emojiTags: { shortcode: string; url: string }[]; mentions: string[] } {
    if (!editor) return { text: "", emojiTags: [], mentions: [] };
    let text = "";
    const emojiTags: { shortcode: string; url: string }[] = [];
    const mentions: string[] = [];
    const seenEmojis = new Set<string>();

    function collectFromNode(node: { type: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] }) {
      if (node.type === "text") {
        text += node.text ?? "";
        return;
      }
      if (node.type === "hardBreak") {
        text += "\n";
        return;
      }
      if (node.type === "mention") {
        const pubkey = node.attrs?.id as string | undefined;
        if (pubkey) {
          mentions.push(pubkey);
          try {
            text += `nostr:${nip19.npubEncode(pubkey)}`;
          } catch {
            text += `@${(node.attrs?.label as string) ?? "unknown"}`;
          }
        }
        return;
      }
      if (node.type === "emoji") {
        const { id, url, source } = (node.attrs ?? {}) as { id?: string; url?: string; source?: string };
        if (source === "unicode" && url) text += url;
        else if (id) {
          text += `:${id}:`;
          if (url && !seenEmojis.has(id)) {
            seenEmojis.add(id);
            emojiTags.push({ shortcode: id, url });
          }
        }
        return;
      }
      // Recurse into content so we don't miss emoji in any block structure
      const content = node.content as { type: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] }[] | undefined;
      content?.forEach((child) => collectFromNode(child));
    }

    const json = editor.getJSON();
    type ContentNode = { type: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    json.content?.forEach((block: { type: string; content?: ContentNode[] }) => {
      block.content?.forEach((child) => collectFromNode(child as ContentNode));
      text += "\n";
    });
    return { text: text.trim(), emojiTags, mentions };
  }

  function clearContent() {
    editor?.commands.clearContent();
  }

  function focusEditor() {
    editor?.commands.focus();
  }

  function isEmpty(): boolean {
    return editor?.isEmpty ?? true;
  }

  function handleSubmit() {
    if (isEmpty()) return;
    onsubmit?.(getSerializedContent());
  }

  onMount(() => {
    if (!editorElement) return;
    const ed = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Placeholder.configure({ placeholder }),
        Mention.extend({
          addNodeView: () => {
            return ({ node }) => {
              const { id, label } = node.attrs;
              const dom = document.createElement("span");
              dom.className = "mention";
              dom.textContent = `@${label}`;
              if (id && typeof id === "string" && id.length === 64) {
                try {
                  const color = hexToColor(id);
                  dom.style.color = rgbToCssString(color);
                } catch {
                  // fallback
                }
              }
              return { dom };
            };
          },
        }).configure({
          HTMLAttributes: { class: "mention" },
          suggestion: {
            ...createProfileSuggestion(),
            command: ({ editor: ed, range, props }: { editor: Editor; range: { from: number; to: number }; props: ProfileHit }) => {
              ed.chain()
                .focus()
                .insertContentAt(range, [
                  {
                    type: "mention",
                    attrs: {
                      id: props.pubkey,
                      label: props.displayName || props.name || props.pubkey?.slice(0, 8),
                    },
                  },
                  { type: "text", text: " " },
                ])
                .run();
            },
          },
          renderLabel: ({ node }) => `@${node.attrs.label}`,
        }),
        createEmojiExtension(),
      ],
      editorProps: {
        attributes: { class: "short-text-editor-content" },
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
            return true;
          }
          return false;
        },
      },
      autofocus: autoFocus,
      onUpdate: () => {
        checkScrollable();
        onchange?.({ content: getContent() });
      },
    });
    editor = ed;
    setTimeout(checkScrollable, 100);
  });

  onDestroy(() => {
    editor?.destroy();
    suggestionPopup?.destroy();
  });

  export function clear() {
    clearContent();
  }
  export function focus() {
    focusEditor();
  }
  export { getContent, getSerializedContent, isEmpty };
</script>

<div
  class="short-text-input {className}"
  class:scrollable={isScrollable}
  style="--min-height: {dimensions.minHeight}px; --max-height: {dimensions.maxHeight}px;"
>
  <div class="editor-wrapper">
    <div class="shader-top"></div>
    <div bind:this={editorElement} class="editor-container"></div>
    <div class="shader-bottom"></div>
  </div>

  {#if showActionRow}
    <div class="action-row">
      <div class="action-buttons-left">
        <button type="button" class="action-btn" onclick={onCameraTap} aria-label="Add photo">
          <Camera variant="fill" color="hsl(var(--white33))" size={20} />
        </button>
        <button type="button" class="action-btn" onclick={onEmojiTap} aria-label="Add emoji">
          <EmojiFill variant="fill" color="hsl(var(--white33))" size={20} />
        </button>
        <button type="button" class="action-btn" onclick={onGifTap} aria-label="Add GIF">
          <Gif variant="fill" color="hsl(var(--white33))" size={20} />
        </button>
        <button type="button" class="action-btn" onclick={onAddTap} aria-label="Add attachment">
          <Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
        </button>
      </div>
      <div class="send-button-container">
        <button type="button" class="send-btn" onclick={handleSubmit} aria-label="Send">
          <Send variant="fill" color="white" size={16} />
        </button>
        <div class="send-divider"></div>
        <button type="button" class="chevron-btn" onclick={onChevronTap} aria-label="Send options">
          <ChevronDown variant="outline" color="rgba(255, 255, 255, 0.66)" size={8} strokeWidth={2.8} />
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .short-text-input {
    position: relative;
    width: 100%;
  }
  .editor-wrapper {
    position: relative;
    min-height: var(--min-height);
    max-height: var(--max-height);
    overflow: hidden;
  }
  .editor-container {
    min-height: var(--min-height);
    max-height: var(--max-height);
    overflow-y: auto;
    padding: 12px 16px;
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--white16)) transparent;
  }
  .editor-container::-webkit-scrollbar {
    width: 4px;
  }
  .editor-container::-webkit-scrollbar-track {
    background: transparent;
  }
  .editor-container::-webkit-scrollbar-thumb {
    background: hsl(var(--white16));
    border-radius: 2px;
  }
  .shader-top,
  .shader-bottom {
    position: absolute;
    left: 0;
    right: 4px;
    height: 8px;
    pointer-events: none;
    z-index: 1;
  }
  .shader-top {
    top: 0;
    background: linear-gradient(to bottom, hsl(var(--black33)) 0%, hsl(var(--black33) / 0) 100%);
  }
  .shader-bottom {
    bottom: 0;
    background: linear-gradient(to top, hsl(var(--black33)) 0%, hsl(var(--black33) / 0) 100%);
  }
  .editor-container :global(.ProseMirror) {
    outline: none;
    min-height: inherit;
  }
  .editor-container :global(.ProseMirror p) {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    color: hsl(var(--white));
  }
  .editor-container :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: hsl(var(--white33));
    pointer-events: none;
    float: left;
    height: 0;
  }
  .editor-container :global(.mention) {
    font-weight: 500;
  }
  .editor-container :global(.emoji-node) {
    display: inline;
    vertical-align: middle;
  }
  .editor-container :global(.inline-emoji) {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.2em;
    margin: 0 2px;
    display: inline;
  }
  :global(.suggestion-menu) {
    background: hsl(var(--gray33));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 0.33px solid hsl(var(--white33));
    border-radius: 12px;
    overflow: hidden;
    min-width: 200px;
    max-width: 280px;
    max-height: 200px;
    overflow-y: auto;
  }
  :global(.suggestion-menu-empty) {
    padding: 12px 16px;
    text-align: center;
  }
  :global(.suggestion-empty-text) {
    font-size: 13px;
    color: hsl(var(--white33));
  }
  :global(.suggestion-item) {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color 0.1s ease;
    text-align: left;
  }
  :global(.suggestion-item:hover),
  :global(.suggestion-item.selected) {
    background: hsl(var(--white16));
  }
  :global(.suggestion-item:not(:last-child)) {
    border-bottom: 0.33px solid hsl(var(--white8));
  }
  :global(.suggestion-profile-pic) {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: hsl(var(--gray66));
  }
  :global(.suggestion-profile-pic .profile-img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  :global(.suggestion-profile-pic .profile-fallback) {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--white66));
    background: hsl(var(--white16));
  }
  :global(.suggestion-profile-info) {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.suggestion-profile-name) {
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--white));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.suggestion-menu-emoji) {
    min-width: 220px;
  }
  :global(.suggestion-menu-emoji .suggestion-item) {
    gap: 10px;
  }
  :global(.emoji-unicode) {
    font-size: 20px;
    line-height: 1;
    width: 24px;
    text-align: center;
  }
  :global(.emoji-img) {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  :global(.emoji-shortcode) {
    font-size: 13px;
    color: hsl(var(--white66));
  }
  :global(.tippy-box) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
  :global(.tippy-content) {
    padding: 0 !important;
  }
  :global(.tippy-arrow) {
    display: none !important;
  }
  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 12px 12px;
    gap: 8px;
  }
  .action-buttons-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .action-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--white8));
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  .action-btn:active {
    transform: scale(0.97);
  }
  .send-button-container {
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--gradient-blurple);
    border-radius: 8px;
    overflow: hidden;
  }
  .send-btn {
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .send-btn:active {
    opacity: 0.8;
  }
  .send-divider {
    width: 1px;
    height: 100%;
    background: rgba(255, 255, 255, 0.33);
  }
  .chevron-btn {
    height: 100%;
    padding: 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .chevron-btn:active {
    opacity: 0.8;
  }
</style>
