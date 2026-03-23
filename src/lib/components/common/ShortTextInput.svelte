<script lang="js">
/**
 * ShortTextInput - TipTap-based rich input with @mentions and :emoji: (tippy.js popups)
 */
import { onMount, onDestroy } from "svelte";
import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention, {} from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Suggestion from "@tiptap/suggestion";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import { MediaBlockExtension } from "$lib/tiptap/media-block.js";
import { NostrRefBlockExtension } from "$lib/tiptap/nostr-ref-block.js";
import { hexToColor, rgbToCssString, getProfileTextColor } from "$lib/utils/color.js";
import * as nip19 from "nostr-tools/nip19";
import { Camera, EmojiFill, Plus, Send, ChevronDown, Cross } from "$lib/components/icons";
import { SvelteSet } from "svelte/reactivity";
let { placeholder = "Write something...", searchProfiles = async () => [], searchEmojis = async () => [], autoFocus = false, size = "small", className = "", showActionRow = true, onCameraTap = () => { }, onEmojiTap = () => { }, onAddTap = () => { }, onChevronTap: _onChevronTap = () => { }, onchange, onsubmit, allowEmptySubmit = false, onClose, showCloseWhen = 'always', aboveEditor, } = $props();
/** Getters so suggestion plugins always receive current search functions (called when editor is created in onMount). */
function getSearchProfiles() { return searchProfiles; }
function getSearchEmojis() { return searchEmojis; }
const sizeMap = {
    small: { minHeight: 40, maxHeight: 120 },
    medium: { minHeight: 80, maxHeight: 200 },
    large: { minHeight: 160, maxHeight: 400 },
};
const dimensions = $derived(sizeMap[size] ?? sizeMap.small);
let editorElement = $state(null);
let editor = $state(null);
let editorFocused = $state(false);
let hasContent = $state(false);
const showClose = $derived(!!onClose && (showCloseWhen === 'always' || (showCloseWhen === 'focusedOrContent' && (editorFocused || hasContent))));
let suggestionPopup = null;
let _currentSuggestionType = $state(null);
let _suggestionItems = $state([]);
let _selectedIndex = $state(0);
let isScrollable = $state(false);
let sendOptionsWrap = $state(null);
let sendOptionsExplainerOpen = $state(false);
function toggleSendOptionsExplainer() {
    sendOptionsExplainerOpen = !sendOptionsExplainerOpen;
}
function handleSendOptionsClickOutside(e) {
    const target = e.target;
    if (sendOptionsExplainerOpen && sendOptionsWrap && target && !sendOptionsWrap.contains(target)) {
        sendOptionsExplainerOpen = false;
    }
}
function checkScrollable() {
    if (editorElement) {
        const scrollContainer = editorElement.querySelector(".ProseMirror");
        if (scrollContainer) {
            isScrollable = scrollContainer.scrollHeight > scrollContainer.clientHeight;
        }
    }
}
const SPINNER_SVG = '<svg class="suggestion-tab-spinner-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 100% / 0.44)" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke-dasharray="47.12 15.71" class="suggestion-tab-spinner-arc"/></svg>';
function updateSuggestionContent(container, type, items, selected, command, isSelectionOnlyUpdate = false, onSelectIndex = null, listOnly = false) {
    if (!container)
        return;
    if (isSelectionOnlyUpdate) {
        const btns = container.querySelectorAll(".suggestion-item");
        btns.forEach((btn, idx) => btn.classList.toggle("selected", idx === selected));
        return;
    }
    if (items.length === 0) {
        container.innerHTML = `
        <div class="suggestion-menu suggestion-menu-empty">
          <span class="suggestion-empty-text">No ${type === "profile" ? "profiles" : type === "gif" ? "GIFs" : "emojis"} found</span>
        </div>
      `;
        return;
    }
    const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const itemsHtml = items
        .map((item, index) => {
        if (type === "profile") {
            const p = item;
            const name = p.displayName || p.name || p.pubkey?.slice(0, 8);
            const rgb = hexToColor(p.pubkey);
            const nameColor = rgbToCssString(rgb);
            const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`;
            const textRgb = getProfileTextColor(rgb, true);
            const textColor = rgbToCssString(textRgb);
            const isNpub = name && name.toLowerCase().startsWith('npub');
            const isHex = name && /^[a-f0-9]{64}$/i.test(name);
            const initial = (name && !isNpub && !isHex) ? name.trim()[0]?.toUpperCase() ?? '' : '';
            const userIconSvg = `<svg viewBox="0 0 16 20" fill="currentColor" class="profile-user-icon"><path d="M16 16.2353C16 18.3145 12.4183 20 8 20C3.58172 20 0 18.3145 0 16.2353C0 14.1561 3.58172 12.4706 8 12.4706C12.4183 12.4706 16 14.1561 16 16.2353Z"/><path d="M12.8 4.70588C12.8 7.30487 10.651 9.41177 8 9.41177C5.34903 9.41177 3.2 7.30487 3.2 4.70588C3.2 2.1069 5.34903 0 8 0C10.651 0 12.8 2.1069 12.8 4.70588Z"/></svg>`;
            return `
            <button type="button" class="suggestion-item ${index === selected ? "selected" : ""}" data-index="${index}">
              <div class="suggestion-profile-pic" style="--pic-bg: ${bgColor}; --pic-text: ${textColor};">
                <span class="profile-fallback-layer">${initial ? escapeAttr(initial) : userIconSvg}</span>
                ${p.picture ? `<img src="${escapeAttr(p.picture)}" alt="" class="profile-img profile-img-loading" loading="lazy" onload="this.classList.remove('profile-img-loading')" onerror="this.style.display='none'" />` : ''}
              </div>
              <div class="suggestion-profile-info">
                <span class="suggestion-profile-name" style="color: ${escapeAttr(nameColor)}">${escapeAttr(name)}</span>
              </div>
            </button>
          `;
        }
        else if (type === "gif") {
            const g = item;
            const thumb = g.preview?.url ?? g.url ?? "";
            const label = g.title ?? g.slug ?? "";
            return `
            <button type="button" class="suggestion-item ${index === selected ? "selected" : ""}" data-index="${index}">
              ${thumb ? `<img src="${escapeAttr(thumb)}" alt="" class="suggestion-gif-thumb" />` : ""}
              <span class="suggestion-gif-label">${escapeAttr(label) || "GIF"}</span>
            </button>
          `;
        }
        else {
            const e = item;
            return `
            <button type="button" class="suggestion-item ${index === selected ? "selected" : ""}" data-index="${index}">
              ${e.source === "unicode" ? `<span class="emoji-unicode">${e.url}</span>` : `<img src="${e.url}" alt="${e.shortcode}" class="emoji-img" />`}
              <span class="emoji-shortcode">${e.shortcode}</span>
            </button>
          `;
        }
    })
        .join("");
    const wrapperClass = listOnly ? `suggestion-list suggestion-list-${type}` : `suggestion-menu suggestion-menu-${type}`;
    container.innerHTML = `<div class="${wrapperClass}">${itemsHtml}</div>`;
    container.querySelectorAll(".suggestion-item").forEach((btn, idx) => {
        btn.addEventListener("click", () => command(items[idx]));
        btn.addEventListener("mouseenter", () => {
            if (onSelectIndex) {
                onSelectIndex(idx);
                updateSuggestionContent(container, type, items, idx, command, true);
            } else {
                _selectedIndex = idx;
                updateSuggestionContent(container, type, items, idx, command, true);
            }
        });
    });
}
/** Update the two emoji tab buttons (inside the styled menu box). */
function updateEmojiTabButtons(btnEmoji, btnGifs, state) {
    const { activeTab, emojiLoading, emojiItems } = state;
    const showEmojiSpinner = activeTab === "emoji" && emojiLoading && emojiItems.length === 0;
    btnEmoji.className = `suggestion-tab ${activeTab === "emoji" ? "suggestion-tab-selected" : ""}`;
    btnEmoji.innerHTML = `Emoji${showEmojiSpinner ? `<span class="suggestion-tab-spinner">${SPINNER_SVG}</span>` : ""}`;
    btnGifs.className = `suggestion-tab ${activeTab === "gifs" ? "suggestion-tab-selected" : ""}`;
    btnGifs.textContent = "GIFs";
}
/** Update the two profile tab buttons (inside the styled menu box). */
function updateProfileTabButtons(btnProfiles, btnPubs, state) {
    const { activeTab, profileLoading, profileItems } = state;
    const showProfileSpinner = activeTab === "profiles" && profileLoading && profileItems.length === 0;
    btnProfiles.className = `suggestion-tab ${activeTab === "profiles" ? "suggestion-tab-selected" : ""}`;
    btnProfiles.innerHTML = `Profiles${showProfileSpinner ? `<span class="suggestion-tab-spinner">${SPINNER_SVG}</span>` : ""}`;
    btnPubs.className = `suggestion-tab ${activeTab === "publications" ? "suggestion-tab-selected" : ""}`;
    btnPubs.textContent = "Publications";
}
function createProfileSuggestion(getSearchProfilesFn) {
    return {
        char: "@",
        allowSpaces: false,
        items: async ({ query }) => {
            const search = getSearchProfilesFn();
            const results = await search(query ?? "");
            return results.slice(0, 8);
        },
        render: () => {
            let popup;
            let container;
            let contentDiv;
            const state = {
                activeTab: "profiles",
                profileItems: [],
                profileLoading: false,
                publicationItems: [],
                selectedIndex: 0,
                command: null,
                onTabChange(tab) {
                    state.activeTab = tab;
                    updateProfileTabButtons(btnProfiles, btnPubs, state);
                    refreshProfilePopupContent();
                },
            };
            let menuBox;
            let btnProfiles;
            let btnPubs;
            function refreshProfilePopupContent() {
                if (!contentDiv)
                    return;
                const items = state.activeTab === "profiles" ? state.profileItems : state.publicationItems;
                if (state.activeTab === "publications") {
                    contentDiv.innerHTML = `<div class="suggestion-menu-empty"><span class="suggestion-empty-text">Publications coming soon</span></div>`;
                    return;
                }
                if (state.profileLoading && state.profileItems.length === 0) {
                    contentDiv.innerHTML = `<div class="suggestion-menu-empty"><span class="suggestion-empty-text">Loading…</span></div>`;
                    return;
                }
                if (items.length === 0) {
                    contentDiv.innerHTML = `<div class="suggestion-menu-empty"><span class="suggestion-empty-text">No profiles found</span></div>`;
                    return;
                }
                if (!state.command)
                    return;
                const onSelectIndex = (idx) => { state.selectedIndex = idx; };
                updateSuggestionContent(contentDiv, "profile", items, state.selectedIndex, state.command, false, onSelectIndex, true);
            }
            function refreshProfilePopupFull() {
                updateProfileTabButtons(btnProfiles, btnPubs, state);
                refreshProfilePopupContent();
            }
            return {
                onStart: (props) => {
                    _currentSuggestionType = "profile";
                    state.command = props.command;
                    state.selectedIndex = 0;
                    state.profileLoading = true;
                    state.profileItems = [];
                    container = document.createElement("div");
                    container.className = "suggestion-container";
                    menuBox = document.createElement("div");
                    menuBox.className = "suggestion-menu suggestion-menu-with-tabs";
                    const tabsRow = document.createElement("div");
                    tabsRow.className = "suggestion-tabs-row";
                    btnProfiles = document.createElement("button");
                    btnProfiles.type = "button";
                    btnProfiles.setAttribute("data-tab", "profiles");
                    btnPubs = document.createElement("button");
                    btnPubs.type = "button";
                    btnPubs.setAttribute("data-tab", "publications");
                    contentDiv = document.createElement("div");
                    contentDiv.className = "suggestion-popup-content";
                    tabsRow.appendChild(btnProfiles);
                    tabsRow.appendChild(btnPubs);
                    menuBox.appendChild(tabsRow);
                    menuBox.appendChild(contentDiv);
                    container.appendChild(menuBox);
                    btnProfiles.addEventListener("click", (e) => { e.stopPropagation(); state.onTabChange("profiles"); });
                    btnPubs.addEventListener("click", (e) => { e.stopPropagation(); state.onTabChange("publications"); });
                    updateProfileTabButtons(btnProfiles, btnPubs, state);
                    refreshProfilePopupContent();
                    getSearchProfilesFn()("").then((results) => {
                        state.profileItems = (results ?? []).slice(0, 8);
                        state.profileLoading = false;
                        updateProfileTabButtons(btnProfiles, btnPubs, state);
                        refreshProfilePopupContent();
                    }).catch(() => {
                        state.profileLoading = false;
                        state.profileItems = [];
                        updateProfileTabButtons(btnProfiles, btnPubs, state);
                        refreshProfilePopupContent();
                    });
                    popup = tippy("body", {
                        getReferenceClientRect: props.clientRect ? () => props.clientRect?.() ?? new DOMRect() : undefined,
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
                    suggestionPopup = popup[0] ?? null;
                },
                onUpdate: (props) => {
                    state.command = props.command;
                    state.selectedIndex = 0;
                    if ((props.items?.length ?? 0) > 0) {
                        state.profileItems = props.items ?? [];
                        state.profileLoading = false;
                    }
                    refreshProfilePopupFull();
                    if (props.clientRect)
                        popup[0]?.setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
                },
                onKeyDown: (props) => {
                    if (props.event.key === "Escape") {
                        popup[0]?.hide();
                        return true;
                    }
                    const items = state.activeTab === "profiles" ? state.profileItems : state.publicationItems;
                    if (props.event.key === "ArrowUp") {
                        state.selectedIndex = (state.selectedIndex - 1 + items.length) % Math.max(items.length, 1);
                        refreshProfilePopupContent();
                        return true;
                    }
                    if (props.event.key === "ArrowDown") {
                        state.selectedIndex = (state.selectedIndex + 1) % Math.max(items.length, 1);
                        refreshProfilePopupContent();
                        return true;
                    }
                    if (props.event.key === "Enter" || props.event.key === "Tab") {
                        const item = items[state.selectedIndex];
                        if (item)
                            state.command(item);
                        return true;
                    }
                    return false;
                },
                onExit: () => {
                    popup[0]?.hide();
                    popup[0]?.destroy();
                    suggestionPopup = null;
                    _currentSuggestionType = null;
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
            }
            else if (url) {
                const img = document.createElement("img");
                img.src = url;
                img.alt = `:${id}:`;
                img.className = "inline-emoji";
                img.draggable = false;
                dom.appendChild(img);
            }
            else {
                dom.textContent = `:${id}:`;
            }
            return { dom };
        };
    },
});
function createEmojiExtension(getSearchEmojisFn) {
    return EmojiNode.extend({
        addProseMirrorPlugins() {
            return [
                Suggestion({
                    editor: this.editor,
                    char: ":",
                    allowSpaces: false,
                    items: async ({ query }) => {
                        const q = (query ?? "").trim();
                        const search = getSearchEmojisFn();
                        const results = await search(q);
                        return results.slice(0, 12);
                    },
                    command: ({ editor: ed, range, props }) => {
                        ed.chain()
                            .focus()
                            .deleteRange(range)
                            .insertContentAt(range.from, [
                            { type: "emoji", attrs: { id: props.shortcode, url: props.url, source: props.source } },
                            { type: "text", text: " " },
                        ])
                            .run();
                    },
                    render: () => {
                        let popup;
                        let container;
                        let menuBox;
                        let btnEmoji;
                        let btnGifs;
                        let contentDiv;
                        const state = {
                            activeTab: "emoji",
                            emojiLoading: true,
                            emojiItems: [],
                            gifItems: [],
                            gifLoading: false,
                            gifLoaded: false,
                            selectedIndex: 0,
                            command: null,
                            lastQuery: "",
                            async onTabChange(tab) {
                                state.activeTab = tab;
                                if (tab === "gifs" && !state.gifLoaded) {
                                    state.gifLoaded = true;
                                    state.gifLoading = true;
                                    refreshEmojiPopupContent();
                                    state.gifLoading = false;
                                    state.gifItems = [];
                                    refreshEmojiPopupContent();
                                }
                                updateEmojiTabButtons(btnEmoji, btnGifs, state);
                            },
                        };
                        function refreshEmojiPopupContent() {
                            if (!contentDiv)
                                return;
                            const loading = state.activeTab === "emoji" ? state.emojiLoading && state.emojiItems.length === 0 : state.gifLoading && state.gifItems.length === 0;
                            const items = state.activeTab === "emoji" ? state.emojiItems : state.gifItems;
                            const type = state.activeTab === "emoji" ? "emoji" : "gif";
                            if (loading) {
                                contentDiv.innerHTML = `<div class="suggestion-menu-empty"><span class="suggestion-empty-text">Loading…</span></div>`;
                                return;
                            }
                            if (items.length === 0) {
                                contentDiv.innerHTML = `<div class="suggestion-menu-empty"><span class="suggestion-empty-text">${state.activeTab === "gifs" ? "GIFs coming soon" : "No emojis found"}</span></div>`;
                                return;
                            }
                            if (!state.command)
                                return;
                            const onSelectIndex = (idx) => { state.selectedIndex = idx; };
                            updateSuggestionContent(contentDiv, type, items, state.selectedIndex, state.command, false, onSelectIndex, true);
                        }
                        function refreshEmojiPopupFull() {
                            updateEmojiTabButtons(btnEmoji, btnGifs, state);
                            refreshEmojiPopupContent();
                        }
                        return {
                            onStart: (props) => {
                                _currentSuggestionType = "emoji";
                                state.command = props.command;
                                state.selectedIndex = 0;
                                state.lastQuery = props.query ?? "";
                                state.emojiLoading = true;
                                state.emojiItems = [];
                                container = document.createElement("div");
                                container.className = "suggestion-container";
                                menuBox = document.createElement("div");
                                menuBox.className = "suggestion-menu suggestion-menu-with-tabs";
                                const tabsRow = document.createElement("div");
                                tabsRow.className = "suggestion-tabs-row";
                                btnEmoji = document.createElement("button");
                                btnEmoji.type = "button";
                                btnEmoji.setAttribute("data-tab", "emoji");
                                btnGifs = document.createElement("button");
                                btnGifs.type = "button";
                                btnGifs.setAttribute("data-tab", "gifs");
                                contentDiv = document.createElement("div");
                                contentDiv.className = "suggestion-popup-content";
                                tabsRow.appendChild(btnEmoji);
                                tabsRow.appendChild(btnGifs);
                                menuBox.appendChild(tabsRow);
                                menuBox.appendChild(contentDiv);
                                container.appendChild(menuBox);
                                btnEmoji.addEventListener("click", (e) => { e.stopPropagation(); state.onTabChange("emoji"); });
                                btnGifs.addEventListener("click", (e) => { e.stopPropagation(); state.onTabChange("gifs"); });
                                updateEmojiTabButtons(btnEmoji, btnGifs, state);
                                refreshEmojiPopupContent();
                                getSearchEmojisFn()("").then((results) => {
                                    state.emojiItems = (results ?? []).slice(0, 12);
                                    state.emojiLoading = false;
                                    updateEmojiTabButtons(btnEmoji, btnGifs, state);
                                    refreshEmojiPopupContent();
                                }).catch(() => {
                                    state.emojiLoading = false;
                                    state.emojiItems = [];
                                    updateEmojiTabButtons(btnEmoji, btnGifs, state);
                                    refreshEmojiPopupContent();
                                });
                                popup = tippy("body", {
                                    getReferenceClientRect: props.clientRect ? () => props.clientRect?.() ?? new DOMRect() : undefined,
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
                                suggestionPopup = popup[0] ?? null;
                            },
                            onUpdate: (props) => {
                                state.command = props.command;
                                state.selectedIndex = 0;
                                state.lastQuery = props.query ?? "";
                                if (state.activeTab === "emoji" && (props.items?.length ?? 0) > 0) {
                                    state.emojiItems = props.items ?? [];
                                    state.emojiLoading = false;
                                }
                                refreshEmojiPopupFull();
                                if (props.clientRect)
                                    popup[0]?.setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
                            },
                            onKeyDown: (props) => {
                                if (props.event.key === "Escape") {
                                    popup[0]?.hide();
                                    return true;
                                }
                                const items = state.activeTab === "emoji" ? state.emojiItems : state.gifItems;
                                if (props.event.key === "ArrowUp") {
                                    state.selectedIndex = (state.selectedIndex - 1 + items.length) % Math.max(items.length, 1);
                                    refreshEmojiPopupContent();
                                    return true;
                                }
                                if (props.event.key === "ArrowDown") {
                                    state.selectedIndex = (state.selectedIndex + 1) % Math.max(items.length, 1);
                                    refreshEmojiPopupContent();
                                    return true;
                                }
                                if (props.event.key === "Enter" || props.event.key === "Tab") {
                                    const item = items[state.selectedIndex];
                                    if (item)
                                        state.command(item);
                                    return true;
                                }
                                return false;
                            },
                            onExit: () => {
                                popup[0]?.hide();
                                popup[0]?.destroy();
                                suggestionPopup = null;
                                _currentSuggestionType = null;
                            },
                        };
                    },
                }),
            ];
        },
    });
}
function getContent() {
    return editor?.getText({ blockSeparator: "\n" }) ?? "";
}
function getSerializedContent() {
    if (!editor)
        return { text: "", emojiTags: [], mentions: [], mediaUrls: [] };
    const emojiTags = [];
    const mentions = [];
    const mediaUrls = [];
    const seenEmojis = new SvelteSet();
    function textFromNode(node) {
        let out = "";
        const name = node.type?.name;
        if (name === "text")
            return node.text ?? "";
        if (name === "hardBreak")
            return "\n";
        if (name === "mention") {
            const pubkey = node.attrs?.id;
            if (pubkey) {
                mentions.push(pubkey);
                try {
                    return `nostr:${nip19.npubEncode(pubkey)}`;
                } catch {
                    return `@${node.attrs?.label ?? "unknown"}`;
                }
            }
            return "";
        }
        if (name === "emoji") {
            const { id, url, source } = (node.attrs ?? {});
            if (source === "unicode" && url) return url;
            if (id) {
                if (url && !seenEmojis.has(id)) {
                    seenEmojis.add(id);
                    emojiTags.push({ shortcode: id, url });
                }
                return `:${id}:`;
            }
            return "";
        }
        if (node.content) {
            for (let i = 0; i < node.content.childCount; i++)
                out += textFromNode(node.content.child(i));
        }
        return out;
    }
    const doc = editor.state.doc;
    const parts = [];
    for (let i = 0; i < doc.childCount; i++) {
        const node = doc.child(i);
        if (node.type.name === "mediaBlock") {
            if (node.attrs?.url) {
                mediaUrls.push(node.attrs.url);
                parts.push("\n" + node.attrs.url + "\n");
            } else
                parts.push("\n");
        } else if (node.type.name === "nostrRefBlock") {
            const naddr = node.attrs?.naddr ?? "";
            if (naddr) parts.push("\nnostr:" + naddr + "\n");
            else parts.push("\n");
        } else if (node.type.name === "paragraph" || node.type.name === "blockquote") {
            parts.push(textFromNode(node) + "\n");
        }
    }
    const text = parts.join("").trim();
    return { text, emojiTags, mentions, mediaUrls };
}
function clearContent() {
    editor?.commands.clearContent();
}
function focusEditor() {
    editor?.commands.focus();
}
function isEmpty() {
    return editor?.isEmpty ?? true;
}
function handleSubmit() {
    if (!allowEmptySubmit && isEmpty())
        return;
    onsubmit?.(getSerializedContent());
}
onMount(() => {
    document.addEventListener("click", handleSendOptionsClickOutside);
    if (!editorElement)
        return;
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
                            }
                            catch {
                                // fallback
                            }
                        }
                        return { dom };
                    };
                },
            }).configure({
                HTMLAttributes: { class: "mention" },
                suggestion: {
                    ...createProfileSuggestion(getSearchProfiles),
                    command: ({ editor: ed, range, props }) => {
                        const pubkey = "pubkey" in props ? props.pubkey : (props.id ?? "") || "";
                        const label = "displayName" in props
                            ? (props.displayName || props.name || pubkey?.slice(0, 8))
                            : ("label" in props ? (props.label ?? "") : "") || pubkey?.slice(0, 8);
                        ed.chain()
                            .focus()
                            .deleteRange(range)
                            .insertContentAt(range.from, [
                            {
                                type: "mention",
                                attrs: {
                                    id: pubkey,
                                    label,
                                },
                            },
                            { type: "text", text: " " },
                        ])
                            .run();
                    },
                },
                renderLabel: ({ node }) => `@${node.attrs.label}`,
            }),
            createEmojiExtension(getSearchEmojis),
            MediaBlockExtension,
            NostrRefBlockExtension,
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
            hasContent = !ed.isEmpty;
            onchange?.({ content: getContent() });
        },
    });
    editor = ed;
    ed.on('focus', () => { editorFocused = true; });
    ed.on('blur', () => { editorFocused = false; });
    hasContent = !ed.isEmpty;
    setTimeout(checkScrollable, 100);
});
onDestroy(() => {
    document.removeEventListener("click", handleSendOptionsClickOutside);
    editor?.destroy();
    suggestionPopup?.destroy();
});
export function clear() {
    clearContent();
}
export function focus() {
    focusEditor();
}
export function insertEmoji(shortcode, url, source) {
    if (!editor) return;
    editor.commands.focus();
    if (source === 'unicode') {
        editor.chain().focus().insertContent(url).run();
    } else {
        editor.chain().focus().insertContent([
            { type: 'emoji', attrs: { id: shortcode, url, source } },
            { type: 'text', text: ' ' }
        ]).run();
    }
}

/** Insert a block-level media placeholder (pending), then new paragraph so user can type immediately. Returns the node id. */
export function insertMediaBlock(attrs) {
    if (!editor) return null;
    const id = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    editor.commands.focus();
    editor.chain().focus().insertContent([
        { type: 'mediaBlock', attrs: { id, pending: true, placeholderUrl: attrs.placeholderUrl ?? null, type: attrs.type ?? 'image' } },
        { type: 'paragraph', content: [] },
    ]).run();
    return id;
}

/** Update a mediaBlock node by id (e.g. set url and pending: false after upload). */
export function setMediaBlockUrl(id, url) {
    if (!editor || !id || !url) return;
    const { state } = editor;
    const { doc, tr } = state;
    let updated = false;
    doc.descendants((node, pos) => {
        if (node.type.name === 'mediaBlock' && node.attrs.id === id) {
            tr.setNodeMarkup(pos, null, { ...node.attrs, url, pending: false, placeholderUrl: null });
            updated = true;
            return false;
        }
    });
    if (updated)
        editor.view.dispatch(tr);
}

/** Remove a mediaBlock node by id (e.g. after failed upload). */
export function deleteMediaBlock(id) {
    if (!editor || !id) return;
    const { state } = editor;
    const { doc, tr } = state;
    doc.descendants((node, pos) => {
        if (node.type.name === 'mediaBlock' && node.attrs.id === id) {
            tr.delete(pos, pos + node.nodeSize);
            return false;
        }
    });
    editor.view.dispatch(tr);
}

/** Insert a block-level Nostr reference (e.g. app naddr), then new paragraph. Attrs name/iconUrl optional for immediate display. */
export function insertNostrRef(payload) {
    const naddr = typeof payload === 'string' ? payload : payload?.naddr;
    if (!editor || !naddr) return;
    const name = typeof payload === 'object' && payload ? payload.name ?? null : null;
    const iconUrl = typeof payload === 'object' && payload ? payload.iconUrl ?? null : null;
    editor.commands.focus();
    editor.chain().focus().insertContent([
        { type: 'nostrRefBlock', attrs: { naddr, name, iconUrl } },
        { type: 'paragraph', content: [] },
    ]).run();
}

export { getContent, getSerializedContent, isEmpty };
</script>

<div
  class="short-text-input {className}"
  class:scrollable={isScrollable}
  style="--min-height: {dimensions.minHeight}px; --max-height: {dimensions.maxHeight}px;"
>
  <div class="editor-wrapper">
    {#if aboveEditor}
      <div class="above-editor">{@render aboveEditor()}</div>
    {/if}
    <div class="shader-top"></div>
    <div class="editor-container" class:has-close={showClose} class:has-above={!!aboveEditor}>
      {#if showClose}
        <button type="button" class="inline-close-btn" onclick={onClose} aria-label="Close">
          <Cross variant="outline" color="hsl(var(--white33))" size={10} strokeWidth={1.4} />
        </button>
      {/if}
      <div bind:this={editorElement} class="editor-mount"></div>
    </div>
    <div class="shader-bottom"></div>
  </div>

  {#if showActionRow}
    <div class="action-row">
      <div class="action-buttons-left">
        <button type="button" class="action-btn" onclick={onCameraTap} aria-label="Add photo">
          <Camera variant="fill" color="hsl(var(--white33))" size={20} />
        </button>
        <button type="button" class="action-btn" onclick={onEmojiTap} aria-label="Add emoji">
          <EmojiFill variant="fill" color="hsl(var(--white33))" size={18} />
        </button>
        <button type="button" class="action-btn" onclick={onAddTap} aria-label="Add attachment">
          <Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
        </button>
      </div>
      <div class="send-button-container" bind:this={sendOptionsWrap}>
        <button type="button" class="send-btn" onclick={handleSubmit} aria-label="Send">
          <Send variant="fill" color="white" size={16} />
        </button>
        <div class="send-divider"></div>
        <button
          type="button"
          class="chevron-btn"
          onclick={toggleSendOptionsExplainer}
          aria-label="Send options"
          aria-expanded={sendOptionsExplainerOpen}
        >
          <ChevronDown variant="outline" color="rgba(255, 255, 255, 0.66)" size={8} strokeWidth={2.8} />
        </button>
        {#if sendOptionsExplainerOpen}
          <div class="send-options-explainer-panel" role="dialog" aria-label="Send options info">
            <p class="send-options-explainer-text">Send options coming soon.</p>
          </div>
        {/if}
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
  /* Optional third row (thread modal only): 8px padding except bottom – stuck to typed text row */
  .above-editor {
    padding: 8px 8px 0;
  }
  /* When quote is above: no top padding so quoted row is stuck to typed text + cross row */
  .editor-container.has-above .editor-mount {
    padding-top: 0 !important;
  }
  .editor-container.has-above {
    padding-top: 0;
  }
  /* Same row as typed text: when has-above, add a little top padding in thread modal context */
  .editor-container.has-above .inline-close-btn {
    top: 3px;
    right: 10px;
  }
  .editor-container {
    position: relative;
    min-height: var(--min-height);
    max-height: var(--max-height);
    overflow: hidden;
  }
  .editor-mount {
    min-height: var(--min-height);
    max-height: var(--max-height);
    overflow-y: auto;
    padding: 10px 8px 10px 12px;
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--white16)) transparent;
  }
  .editor-container.has-close .editor-mount {
    padding-right: 36px;
  }
  /* Block-level media in editor: 2/3 of renderer sizes (54–160px height, 54–200px width); hug image; cross button top-right */
  :global(.media-block-editor) {
    position: relative;
    margin: 6px 0;
    display: inline-block;
    min-width: 54px;
    min-height: 54px;
    max-width: 200px;
    max-height: 160px;
    border-radius: 12px;
    overflow: hidden;
    border: 0.33px solid hsl(var(--white16));
    background: hsl(var(--gray33));
  }
  :global(.media-block-editor-remove) {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: hsl(var(--gray33));
    color: hsl(var(--white66));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  :global(.media-block-editor-remove:hover) {
    background: hsl(var(--gray44));
    color: hsl(var(--white));
  }
  :global(.media-block-editor-remove svg) {
    width: 10px;
    height: 10px;
  }
  :global(.media-block-editor-pending) {
    opacity: 0.33;
  }
  :global(.media-block-editor-pending .media-block-editor-inner) {
    position: relative;
  }
  :global(.media-block-editor-spinner) {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--black) / 0.2);
    color: hsl(var(--white66));
  }
  :global(.media-block-editor-spinner svg) {
    animation: media-block-spin 0.8s linear infinite;
  }
  @keyframes media-block-spin {
    to { transform: rotate(360deg); }
  }
  :global(.media-block-editor-inner) {
    position: relative;
    min-height: 54px;
    display: block;
  }
  :global(.media-block-editor-preview),
  :global(.media-block-editor-element) {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  /* Nostr ref block in editor: white4 panel + remove button outside top-right */
  :global(.nostr-ref-block-editor) {
    position: relative;
    margin: 6px 0;
    display: inline-block;
  }
  :global(.nostr-ref-block-editor-inner) {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px 8px 8px;
    background: hsl(var(--white8));
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    color: hsl(var(--white));
  }
  :global(.nostr-ref-block-editor-pic) {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: 8px;
    border: 0.33px solid hsl(var(--white16));
    background: hsl(var(--gray66));
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.nostr-ref-block-editor-pic img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  :global(.nostr-ref-block-editor-initial) {
    font-size: 18px;
    font-weight: 700;
    color: hsl(var(--white66));
  }
  :global(.nostr-ref-block-editor-name) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  :global(.nostr-ref-block-editor-remove) {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 2;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: hsl(var(--gray33));
    color: hsl(var(--white66));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  :global(.nostr-ref-block-editor-remove:hover) {
    background: hsl(var(--gray44));
    color: hsl(var(--white));
  }
  :global(.nostr-ref-block-editor-remove svg) {
    width: 10px;
    height: 10px;
  }
  .inline-close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: hsl(var(--white4));
    border-radius: 50%;
    color: hsl(var(--white33));
    cursor: pointer;
  }
  .inline-close-btn:hover {
    background: hsl(var(--white16));
    color: hsl(var(--foreground));
  }
  .inline-close-btn :global(svg) {
    stroke: hsl(var(--white33)) !important;
    fill: none !important;
  }
  .editor-mount::-webkit-scrollbar {
    width: 4px;
  }
  .editor-mount::-webkit-scrollbar-track {
    background: transparent;
  }
  .editor-mount::-webkit-scrollbar-thumb {
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
  .editor-mount :global(.ProseMirror) {
    outline: none;
    min-height: inherit;
  }
  .editor-mount :global(.ProseMirror p) {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    color: hsl(var(--white));
  }
  .editor-mount :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: hsl(var(--white33));
    pointer-events: none;
    float: left;
    height: 0;
  }
  .editor-mount :global(.mention) {
    font-weight: 500;
  }
  .editor-mount :global(.emoji-node) {
    display: inline;
    vertical-align: middle;
  }
  .editor-mount :global(.inline-emoji) {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.2em;
    margin: 0 2px;
    display: inline;
  }
  :global(.suggestion-popup-content) {
    flex: 1;
    min-height: 60px;
    max-height: 240px;
    overflow-y: auto;
  }
  :global(.suggestion-menu-with-tabs) {
    display: block;
  }
  :global(.suggestion-tabs-row) {
    padding: 8px;
    display: flex;
    gap: 4px;
  }
  :global(.suggestion-tabs-row .suggestion-tab) {
    flex: 1;
    margin-right: 0;
  }
  :global(.suggestion-tab) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: hsl(var(--white66));
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  :global(.suggestion-tab:hover) {
    color: hsl(var(--white));
  }
  :global(.suggestion-tab-selected) {
    background: hsl(var(--white16));
    color: hsl(var(--white));
  }
  :global(.suggestion-list) {
    background: transparent;
    border: none;
    border-radius: 0;
    min-height: 0;
    max-height: 220px;
    overflow-y: auto;
  }
  :global(.suggestion-tab-spinner) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
  }
  :global(.suggestion-tab-spinner-svg) {
    display: block;
    width: 14px;
    height: 14px;
  }
  :global(.suggestion-tab-spinner-arc) {
    transform-origin: 12px 12px;
    animation: suggestion-spinner-rotate 0.8s linear infinite;
  }
  @keyframes suggestion-spinner-rotate {
    to { transform: rotate(360deg); }
  }
  :global(.suggestion-menu) {
    background: hsl(var(--gray33));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 0.33px solid hsl(var(--white33));
    border-radius: 12px;
    overflow: hidden;
    min-width: 240px;
    max-width: 320px;
    max-height: 280px;
    overflow-y: auto;
  }
  :global(.suggestion-menu-empty) {
    padding: 12px 16px;
    text-align: center;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    background: hsl(var(--white8));
  }
  :global(.suggestion-item:not(:last-child)) {
    border-bottom: 0.33px solid hsl(var(--white8));
  }
  :global(.suggestion-profile-pic) {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border-radius: 50%;
    border: 0.33px solid hsl(var(--white16));
    overflow: hidden;
    flex-shrink: 0;
    background-color: var(--pic-bg, hsl(var(--white16)));
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.suggestion-profile-pic .profile-fallback-layer) {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--pic-text, hsl(var(--white)));
    user-select: none;
  }
  :global(.suggestion-profile-pic .profile-user-icon) {
    width: 56%;
    height: 56%;
    color: var(--pic-text, hsl(var(--white)));
  }
  :global(.suggestion-profile-pic .profile-img) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 1;
    transition: opacity 0.15s ease;
  }
  :global(.suggestion-profile-pic .profile-img-loading) {
    opacity: 0;
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
  :global(.suggestion-gif-thumb) {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
  }
  :global(.suggestion-gif-label) {
    font-size: 13px;
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    position: relative;
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--gradient-blurple);
    border-radius: 8px;
    overflow: visible;
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

  .send-options-explainer-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    max-width: 280px;
    padding: 12px 14px;
    background: hsl(241 15% 18%);
    border: 1px solid hsl(var(--white16));
    border-radius: 12px;
    box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
    z-index: 20;
  }

  .send-options-explainer-text {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: hsl(var(--white66));
  }
</style>
