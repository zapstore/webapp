<script lang="js">
/**
 * RootComment - Wraps a MessageBubble with reply indicator.
 * Thread modal supports Zap (root comment author) and Comment (reply) when logged in.
 */
import MessageBubble from "./MessageBubble.svelte";
import ThreadComment from "./ThreadComment.svelte";
import ZapBubble from "./ZapBubble.svelte";
import ThreadZap from "./ThreadZap.svelte";
import QuotedMessage from "./QuotedMessage.svelte";
import QuotedZapMessage from "./QuotedZapMessage.svelte";
import CommentActionsModal from "./CommentActionsModal.svelte";
import CommentBubbleActionRail from "./CommentBubbleActionRail.svelte";
import ShortTextContent from "$lib/components/common/ShortTextContent.svelte";
import ProfilePicStack from "$lib/components/common/ProfilePicStack.svelte";
import Modal from "$lib/components/common/Modal.svelte";
import MediaLightboxModal from "$lib/components/modals/MediaLightboxModal.svelte";
import EmptyState from "$lib/components/common/EmptyState.svelte";
import DeletedRootBadge from "$lib/components/community/DeletedRootBadge.svelte";
import ActivityStackMiniBadge from "$lib/components/community/ActivityStackMiniBadge.svelte";
import InputButton from "$lib/components/common/InputButton.svelte";
import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
import EmojiPickerModal from "$lib/components/modals/EmojiPickerModal.svelte";
import InsertModal from "$lib/components/modals/InsertModal.svelte";
import ZapSliderModal from "$lib/components/modals/ZapSliderModal.svelte";
import { Zap, Reply, Options } from "$lib/components/icons";
import { SvelteSet, SvelteMap } from "svelte/reactivity";
import { getIsSignedIn, getCurrentPubkey } from "$lib/stores/auth.svelte.js";
import { uploadFileToNostrBuild, ACCEPTED_MEDIA_TYPES } from "$lib/services/upload-nostr-build";
import { EVENT_KINDS } from "$lib/config.js";
import { goto } from "$app/navigation";
import { tick } from "svelte";
import * as nip19 from "nostr-tools/nip19";
/** Never show the literal "Anonymous" — prefer truncated npub when display name is missing. */
function displayNameOrNpubShort(label, pk) {
    if (label != null && String(label).trim() !== "")
        return String(label).trim();
    if (!pk || !String(pk).trim())
        return "";
    try {
        const enc = nip19.npubEncode(pk);
        return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
    }
    catch {
        return pk.slice(0, 8);
    }
}
let { pictureUrl = null, name = "", pubkey = null, timestamp = null, profileUrl = "", loading = false, pending = false, outgoing = false, replies = [], threadComments = [], threadZaps = [], authorPubkey = null, className = "", content = "", emojiTags = [], /** @type {string[]} */ mediaUrls = [], resolveMentionLabel, appIconUrl = null, appName = "", appIdentifier = null, version = "", children, id = null, isZapRoot = false, zapAmount = 0, searchProfiles = async () => [], searchEmojis = async () => [], signEvent = null, onReplySubmit, onZapReceived, onZapPending, onZapPendingClear, onGetStarted,     /** When true (e.g. from Activity ?comment=id), open this thread modal on mount */
    openThreadOnMount = false,
    /** After thread opens, open the actions sheet once (feed three-dots). */
    openActionsOnMount = false,
    /**
     * Target for the initial actions sheet: `'root'` or same shape as thread reply / zap item.
     * @type {'root' | Record<string, unknown> | null}
     */
    initialActionsTarget = null,
    /**
     * Incremented by the parent when opening the actions sheet without the thread modal (feed ⋯).
     * Lets the mount effect open the sheet once per user gesture.
     */
    standaloneActionsOpenKey = 0,
    /**
     * Feed zap icon: open {@link ZapSliderModal} for the tapped comment without opening the thread modal first.
     * Parent increments `standaloneZapOpenKey` per gesture; `feedInitialZapTarget` is the enriched reply shape.
     */
    openZapOnMount = false,
    standaloneZapOpenKey = 0,
    /** @type {null | { id: string, pubkey: string, displayName?: string, avatarUrl?: string | null, content?: string, createdAt?: number, emojiTags?: { shortcode: string, url: string }[], mediaUrls?: string[] }} */
    feedInitialZapTarget = null,
    /** When true, also open the reply composer immediately when the modal mounts. */
    openReplyOnMount = false,
    /**
     * When opening with openReplyOnMount, optional reply target (nested comment) to quote — same shape as replyingToComment.
     * @type {null | { id: string, pubkey: string, displayName?: string, avatarUrl?: string | null, content?: string, createdAt?: number, emojiTags?: { shortcode: string, url: string }[], mediaUrls?: string[] }}
     */
    initialReplyTarget = null,
    /** When true, the feed-level bubble/rail is hidden; only the thread Modal is rendered. */
    hideRoot = false,
    /**
     * Optional context banner shown at the top of the thread modal (app or forum post this comment is on).
     * When `deleted` is true or `href` is missing, the row is non-navigable (e.g. root no longer on relays).
     * @type {{ label: string, iconUrl?: string | null, href?: string | null, deleted?: boolean, isStack?: boolean } | null}
     */
    rootContext = null,
    /** Called when the thread modal closes (backdrop tap or programmatic close). */
    onModalClose = null,
    /**
     * When set (forum thread under Zapstore community), kind-1985 labels include `#h` for relay indexing.
     * @type {string | null}
     */
    labelCommunityPubkey = null,
    /** When false, skip document body scroll lock (e.g. thread inside header notifications). */
    modalLockBodyScroll = true,
    /** Base z-index for the thread Modal; child sheets stack above. */
    modalZIndex = 50,
    /** Thread/sheets sized to header inbox panel (`container-type: size` + cqh). */
    modalScopedInPanel = false,
} = $props();
let lightboxOpen = $state(false);
let lightboxUrls = $state([]);
let lightboxIndex = $state(0);
function openLightbox(url, _type, urls) {
    const list = urls?.length ? urls : [url];
    lightboxUrls = list;
    lightboxIndex = Math.max(0, list.indexOf(url));
    lightboxOpen = true;
}
let modalOpen = $state(false);
let zapModalOpen = $state(false);
/** Preset sats when opening {@link ZapSliderModal} from CommentActionsModal chips */
let zapPresetSats = $state(/** @type {number | null} */ (null));
let commentExpanded = $state(false);
/** When set, we're replying to this comment (show QuotedMessage above input) */
let replyingToComment = $state(null);
/** When set, Zap modal targets this comment instead of the root */
let zapTargetOverride = $state(null);
let replyInput = $state(null);
let submitting = $state(false);
let emojiPickerOpen = $state(false);
let insertModalOpen = $state(false);
/** @type {HTMLInputElement | null} */
let replyFileInputEl = $state(null);
function handleReplyCameraTap() {
	replyFileInputEl?.click();
}
function handleEmojiTap() {
	emojiPickerOpen = true;
}
function handleEmojiSelect(/** @type {{ shortcode: string; url: string; source: string }} */ emoji) {
	replyInput?.insertEmoji?.(emoji.shortcode, emoji.url, emoji.source);
	replyInput?.focus?.();
}
function handleInsertTap() {
	insertModalOpen = true;
}
function handleInsertNostrRef(/** @type {{ naddr: string; name?: string | null; iconUrl?: string | null }} */ payload) {
	replyInput?.insertNostrRef?.(payload);
	replyInput?.focus?.();
}
async function handleReplyFileChange(e) {
	const files = /** @type {HTMLInputElement} */ (e.target).files;
	if (!files?.length || !signEvent || !replyInput) return;
	const inputEl = /** @type {HTMLInputElement} */ (e.target);
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const type = file.type.startsWith("video") ? "video" : "image";
		const placeholderUrl = URL.createObjectURL(file);
		const id = replyInput.insertMediaBlock?.({ placeholderUrl, type });
		if (!id) {
			URL.revokeObjectURL(placeholderUrl);
			continue;
		}
		try {
			const url = await uploadFileToNostrBuild(file, signEvent);
			replyInput.setMediaBlockUrl?.(id, url);
		} catch (err) {
			console.error("Reply media upload failed:", err);
			replyInput.deleteMediaBlock?.(id);
		}
		URL.revokeObjectURL(placeholderUrl);
	}
	inputEl.value = "";
}
/** Which item the actions modal is for: 'root', a comment reply, or a zap (zap on zap) */
let actionsModalTarget = $state(null);
let actionsModalOpen = $state(false);
let actionsNestedOpen = $state(false);
/** True when any modal is open on top of the thread (Zap, Comment/Zap options, emoji, insert) – drives overlay + scale animation */
const childModalOpen = $derived(
	zapModalOpen || actionsModalOpen || actionsNestedOpen || emojiPickerOpen || insertModalOpen
);
// Replies only: threadComments excluding the root itself (threadComments includes root as first element)
const threadReplies = $derived(threadComments.filter((c) => c.id !== id));
// Unique people in the thread: comment repliers + zappers (by pubkey), same shape as ReplyComment for profile stack. App author first.
// Use threadReplies (excludes root) to only count actual replies, not the root comment author.
const uniqueRepliers = $derived.by(() => {
    const seen = new SvelteSet();
    const list = [];
    for (const r of threadReplies) {
        if (seen.has(r.pubkey))
            continue;
        seen.add(r.pubkey);
        list.push({ pubkey: r.pubkey, displayName: r.displayName, avatarUrl: r.avatarUrl });
    }
    for (const z of threadZaps ?? []) {
        const pk = z.senderPubkey ?? z.pubkey ?? "";
        if (!pk || seen.has(pk))
            continue;
        seen.add(pk);
        list.push({ pubkey: pk, displayName: z.displayName, avatarUrl: z.avatarUrl ?? null });
    }
    if (authorPubkey) {
        list.sort((a, b) => {
            if (a.pubkey === authorPubkey)
                return -1;
            if (b.pubkey === authorPubkey)
                return 1;
            return 0;
        });
    }
    return list;
});
const hasReplies = $derived(uniqueRepliers.length > 0);
const _featuredReplier = $derived(uniqueRepliers[0]);
const _otherRepliersCount = $derived(uniqueRepliers.length - 1);
const displayedRepliers = $derived(uniqueRepliers.slice(0, 3));
const REPLY_NAME_MAX = 18;
function trimName(name) {
    if (!name || typeof name !== "string") return "";
    const s = name.trim();
    if (s.length <= REPLY_NAME_MAX) return s;
    return s.slice(0, REPLY_NAME_MAX) + "...";
}
/** Profile stack text: 1 = "Name", 2 = "Name & Name", 3+ = "Name & N Others". Long names trimmed with "...". */
const replyIndicatorText = $derived.by(() => {
    if (uniqueRepliers.length === 0) return "";
    const n = uniqueRepliers.length;
    const a = trimName(uniqueRepliers[0]?.displayName) || "Someone";
    if (n === 1) return a;
    if (n === 2) return `${a} & ${trimName(uniqueRepliers[1]?.displayName) || "Someone"}`;
    return `${a} & ${n - 1} Others`;
});
// Count all nested comments in the thread (excluding the root itself)
const replyCount = $derived(threadReplies.length);
const sortedReplies = $derived([...replies].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
}));
const feedItems = $derived.by(() => {
    const commentItems = (threadComments.length > 0
        ? threadComments.filter((c) => c.id !== id)
        : sortedReplies).map((c) => ({ type: 'comment', data: c }));
    const zapItems = (threadZaps ?? []).map((z) => ({
        type: 'zap',
        data: {
            ...z,
            pubkey: z.senderPubkey ?? z.pubkey,
            createdAt: z.timestamp ?? z.createdAt,
        },
    }));
    return [...commentItems, ...zapItems].sort((a, b) => (a.data.createdAt ?? 0) - (b.data.createdAt ?? 0));
});
const threadById = $derived.by(() => {
    const map = new SvelteMap();
    for (const c of threadComments) {
        map.set(c.id, c);
        map.set(c.id.toLowerCase(), c);
    }
    return map;
});
const threadZapById = $derived.by(() => {
    const map = new SvelteMap();
    for (const z of threadZaps ?? []) {
        if (z?.id) {
            map.set(z.id.toLowerCase(), z);
            map.set(z.id, z);
        }
    }
    return map;
});
function getContentPreview(comment) {
    if (comment.content && comment.content.trim())
        return comment.content;
    if (comment.contentHtml) {
        return comment.contentHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }
    return "";
}
/** App a-tag so every zap from this page has it on the request → receipt has it → we find by #a only (no #p). */
const appATag = $derived(authorPubkey && appIdentifier ? `32267:${authorPubkey}:${appIdentifier}` : undefined);
/** Zap target: e-tag = event we're zapping, p-tag = that event's author; aTag = app so receipt is discoverable by #a. */
const rootZapTarget = $derived(pubkey
    ? {
        name: name || undefined,
        pubkey,
        id: id ?? undefined,
        pictureUrl: pictureUrl ?? undefined,
        aTag: appATag,
    }
    : null);
/** Active zap target (override when Zap chosen from a reply's menu) */
const zapTarget = $derived(zapTargetOverride ?? rootZapTarget);
/** Show Zap + Comment (or "Get started to comment" for guests) in thread modal when we have handlers and a root id. */
const showThreadActions = $derived((onReplySubmit != null || onZapReceived != null || onGetStarted != null) && (id != null || pubkey != null));
function openActionsModal(target) {
    actionsModalTarget = target;
    actionsModalOpen = true;
}
function onBubbleClick(e, target) {
    if (!showThreadActions)
        return;
    const t = e.target;
    if (t instanceof Element && t.closest("a, button, input, [contenteditable='true']"))
        return;
    e.preventDefault();
    e.stopPropagation();
    openActionsModal(target);
}
/** Keyboard activate for bubble wrappers (mirrors onBubbleClick when focus is on the wrapper). */
function onBubbleKeydown(/** @type {KeyboardEvent} */ e, /** @type {Parameters<typeof onBubbleClick>[1]} */ target) {
    if (e.key !== "Enter" && e.key !== " ")
        return;
    if (!showThreadActions)
        return;
    e.preventDefault();
    e.stopPropagation();
    openActionsModal(target);
}
function onRootCommentKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key !== "Enter" && e.key !== " ")
        return;
    e.preventDefault();
    openThread();
}
/** Thread feed zap rows carry `senderPubkey` + `amountSats`; comments use `pubkey` and no amount. */
function isActionsTargetThreadZap(t) {
    return Boolean(
        t &&
            typeof t === "object" &&
            "senderPubkey" in t &&
            "amountSats" in t
    );
}
function actionsModalOnComment() {
    modalOpen = true;
    if (actionsModalTarget === "root")
        handleReply();
    else if (isActionsTargetThreadZap(actionsModalTarget))
        openReplyToZap(actionsModalTarget);
    else if (actionsModalTarget && typeof actionsModalTarget === "object")
        openReplyToComment(actionsModalTarget);
}
function actionsModalOnZap() {
    zapPresetSats = null;
    if (actionsModalTarget === "root")
        handleZap();
    else if (actionsModalTarget)
        handleZapComment(actionsModalTarget);
}
function openReplyToZap(zap) {
    replyingToComment = {
        id: zap.id,
        pubkey: zap.senderPubkey ?? zap.pubkey ?? "",
        displayName: zap.displayName,
        avatarUrl: zap.avatarUrl ?? null,
        content: zap.comment,
        createdAt: zap.timestamp ?? zap.createdAt,
        quotedAsZap: true,
        amountSats: zap.amountSats ?? 0,
        emojiTags: zap.emojiTags ?? [],
    };
    commentExpanded = true;
}
function openThread() {
    modalOpen = true;
}
function handleZap() {
    zapPresetSats = null;
    zapModalOpen = true;
}
function handleReply() {
    replyingToComment = null;
    commentExpanded = true;
}
function openReplyToComment(comment) {
    replyingToComment = comment;
    commentExpanded = true;
}
function closeReply() {
    commentExpanded = false;
    replyingToComment = null;
}
/** Zap target: e-tag = comment or zap receipt id; p-tag = Lightning recipient (zapper when zapping a zap, comment author when zapping a comment). No a-tag so wallet sees a standard profile/event zap (p+e only). */
function handleZapComment(commentOrZap) {
    const isZap = "senderPubkey" in commentOrZap;
    const recipientPubkey = isZap
        ? (commentOrZap.senderPubkey ?? "")
        : (commentOrZap.pubkey ?? "");
    if (!recipientPubkey)
        return;
    zapTargetOverride = {
        name: commentOrZap.displayName || undefined,
        pubkey: recipientPubkey,
        id: commentOrZap.id,
        pictureUrl: commentOrZap.avatarUrl ?? undefined,
        aTag: undefined,
    };
    zapModalOpen = true;
}
/** Quick zap amount from actions sheet chips — same target as full zap, keeps {@link zapPresetSats}. */
function handleActionsZapPreset(sats) {
    zapPresetSats = sats;
    if (actionsModalTarget === "root") {
        zapTargetOverride = null;
        zapModalOpen = true;
    }
    else if (actionsModalTarget) {
        handleZapComment(actionsModalTarget);
    }
}
function handleZapClose(event) {
    zapModalOpen = false;
    zapTargetOverride = null;
    zapPresetSats = null;
    if (event.success)
        onZapReceived?.({ zapReceipt: {} });
    if (openZapOnMount)
        onModalClose?.();
}
async function handleReplySubmit(event) {
    if (submitting || !id)
        return;
    const parentId = replyingToComment ? replyingToComment.id : id;
    /** @type {number} */
    let parentKind = EVENT_KINDS.COMMENT;
    if (!replyingToComment) {
        if (isZapRoot)
            parentKind = EVENT_KINDS.ZAP_RECEIPT;
    }
    else if (replyingToComment.quotedAsZap === true) {
        parentKind = EVENT_KINDS.ZAP_RECEIPT;
    }
    submitting = true;
    try {
        onReplySubmit?.({
            ...event,
            parentId,
            replyToPubkey: replyingToComment?.pubkey ?? pubkey ?? undefined,
            parentKind,
        });
        replyInput?.clear?.();
        closeReply();
    }
    catch (err) {
        console.error("Failed to submit reply:", err);
    }
    finally {
        submitting = false;
    }
}
function handleReplyKeydown(e) {
    if (!modalOpen || !commentExpanded)
        return;
    if (e.key === "Escape") {
        closeReply();
        e.preventDefault();
        e.stopPropagation();
    }
}
$effect(() => {
    if (commentExpanded && replyInput) {
        const t = setTimeout(() => replyInput?.focus?.(), 120);
        return () => clearTimeout(t);
    }
});
$effect(() => {
    if (!commentExpanded) {
        emojiPickerOpen = false;
        insertModalOpen = false;
    }
});
$effect(() => {
    if (openThreadOnMount) {
        modalOpen = true;
        if (openReplyOnMount) {
            commentExpanded = true;
            replyingToComment = initialReplyTarget ?? null;
        }
    }
});

/** Last feed-only zap key applied (community / studio activity). */
let lastStandaloneZapKey = $state(-1);
$effect(() => {
	if (!openZapOnMount || !feedInitialZapTarget) {
		if (!openZapOnMount)
			lastStandaloneZapKey = -1;
		return;
	}
	if (lastStandaloneZapKey === standaloneZapOpenKey)
		return;
	lastStandaloneZapKey = standaloneZapOpenKey;
	void tick().then(() => {
		handleZapComment(feedInitialZapTarget);
	});
});
// Track first open so onModalClose fires when modal closes (but not on initial false state).
let _didOpen = $state(false);
$effect(() => {
    if (modalOpen) {
        _didOpen = true;
    } else if (_didOpen) {
        onModalClose?.();
    }
});
// Feed actions-only path never opens the thread modal; close callback must be driven by sheet close.
let _didOpenStandaloneActions = $state(false);
$effect(() => {
	if (!openActionsOnMount || openThreadOnMount) {
		_didOpenStandaloneActions = false;
		return;
	}
	if (actionsModalOpen) {
		_didOpenStandaloneActions = true;
	} else if (_didOpenStandaloneActions) {
		_didOpenStandaloneActions = false;
		onModalClose?.();
	}
});
function handleZapReceived(event) {
    onZapReceived?.(event);
}
function getActionsModalContentPreview() {
    if (actionsModalTarget === "root")
        return (content || "").trim();
    if (!actionsModalTarget)
        return "";
    if ("comment" in actionsModalTarget)
        return actionsModalTarget.comment ?? "";
    return getContentPreview(actionsModalTarget);
}
function handleOptions() {
    openActionsModal("root");
}

const actionsTargetEventId = $derived.by(() => {
	if (actionsModalTarget === "root") return String(id ?? "").trim();
	if (!actionsModalTarget || typeof actionsModalTarget !== "object") return "";
	return String(/** @type {{ id?: string }} */ (actionsModalTarget).id ?? "").trim();
});

const actionsTargetEventKind = $derived.by(() => {
	if (actionsModalTarget === "root")
		return isZapRoot ? EVENT_KINDS.ZAP_RECEIPT : EVENT_KINDS.COMMENT;
	if (!actionsModalTarget || typeof actionsModalTarget !== "object")
		return EVENT_KINDS.COMMENT;
	const o = /** @type {Record<string, unknown>} */ (actionsModalTarget);
	if ("senderPubkey" in o && ("amountSats" in o || "comment" in o))
		return EVENT_KINDS.ZAP_RECEIPT;
	return EVENT_KINDS.COMMENT;
});

/** Match sheet quote + reply routing: only thread zap rows, not arbitrary objects with an `id`. */
const actionsModalIsZapPreview = $derived.by(() => {
	if (actionsModalTarget === "root") return isZapRoot;
	return isActionsTargetThreadZap(actionsModalTarget);
});

/** Thread modal + root ⋯: actions sheet without Comment/Zap sections. */
const actionsModalCompact = $derived(modalOpen && actionsModalTarget === "root");

/** Thread visible first, then actions (legacy bundled open). */
let didApplyBundledActions = $state(false);
/** Last feed “actions only” key we applied — see `standaloneActionsOpenKey`. */
let lastStandaloneActionsKey = $state(-1);
$effect(() => {
	if (!openActionsOnMount) {
		if (!modalOpen)
			didApplyBundledActions = false;
		return;
	}
	const t = initialActionsTarget;
	if (t === null || t === undefined)
		return;

	if (openThreadOnMount) {
		if (!modalOpen) {
			didApplyBundledActions = false;
			return;
		}
		if (didApplyBundledActions)
			return;
		didApplyBundledActions = true;
		void tick().then(() => {
			openActionsModal(t);
		});
		return;
	}

	if (lastStandaloneActionsKey === standaloneActionsOpenKey)
		return;
	lastStandaloneActionsKey = standaloneActionsOpenKey;
	void tick().then(() => {
		openActionsModal(t);
	});
});
/** Plain click: close modal then client-navigate — closing first avoids tearing down the `<a>` before SvelteKit handles the click. */
function handleRootContextNav(e) {
    e.stopPropagation();
    const href = String(rootContext?.href ?? "").trim();
    if (!href) {
        e.preventDefault();
        return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
    e.preventDefault();
    modalOpen = false;
    void goto(href);
}
</script>

<svelte:window onkeydown={handleReplyKeydown} />

{#snippet feedDesktopRail()}
  <CommentBubbleActionRail
    onReply={() => {
      modalOpen = true;
      handleReply();
    }}
    onZap={() => {
      modalOpen = true;
      handleZap();
    }}
    onOptions={() => {
      openActionsModal("root");
    }}
  />
{/snippet}

{#if !hideRoot}
<div
  class="root-comment {className}"
  class:desktop-bubble-actions-target={showThreadActions}
  role="button"
  tabindex="0"
  onclick={openThread}
  onkeydown={onRootCommentKeydown}
>
  {#if isZapRoot}
    <ZapBubble
      {pictureUrl}
      {name}
      {pubkey}
      {timestamp}
      {profileUrl}
      {pending}
      message={content ?? ""}
      amount={zapAmount}
      {emojiTags}
      {resolveMentionLabel}
      actionRail={showThreadActions ? feedDesktopRail : undefined}
    />
  {:else}
    <MessageBubble
      {pictureUrl}
      {name}
      {pubkey}
      {timestamp}
      {profileUrl}
      {loading}
      {pending}
      {outgoing}
      actionRail={showThreadActions ? feedDesktopRail : undefined}
    >
      {#if (content != null && content !== undefined) || (mediaUrls?.length ?? 0) > 0}
        <ShortTextContent
          content={content ?? ''}
          emojiTags={emojiTags ?? []}
          mediaUrls={mediaUrls ?? []}
          {resolveMentionLabel}
          onMediaClick={({ url: u, type: t, urls: list }) => openLightbox(u, t, list)}
          class="root-comment-body"
        />
      {:else}
        {@render children?.()}
      {/if}
    </MessageBubble>
  {/if}

  {#if hasReplies}
    <div class="reply-indicator" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}>
      <div class="connector-column">
        <div class="connector-vertical"></div>
        <div class="connector-corner">
          <svg viewBox="0 0 27 16" fill="none">
            <path
              d="M1 0 L1 0 Q1 15 16 15 L27 15"
              stroke="hsl(var(--white16))"
              stroke-width="1.5"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <div class="repliers-row">
        <ProfilePicStack
          profiles={displayedRepliers.map((r) => ({
            pictureUrl: r.avatarUrl ?? undefined,
            name: r.displayName,
            pubkey: r.pubkey,
          }))}
          text={replyIndicatorText}
          suffix={replyCount != null ? String(replyCount) : ""}
          size="sm"
          onclick={openThread}
        />
      </div>
    </div>
  {/if}
</div>
{/if}

<Modal
  bind:open={modalOpen}
  ariaLabel="Comment thread"
  align="bottom"
  fillHeight={true}
  wide={true}
  zIndex={modalZIndex}
  lockBodyScroll={modalLockBodyScroll}
  scopedInPanel={modalScopedInPanel}
  class="thread-modal {childModalOpen ? 'thread-modal-child-open' : ''}"
>
  <div class="thread-content-wrap">
      <div class="thread-content">
      {#if rootContext}
        {#if rootContext.deleted || !String(rootContext.href ?? "").trim()}
          <div class="thread-root-context thread-root-context--deleted" role="status">
            <DeletedRootBadge />
            <span class="thread-root-context-label">{rootContext.label}</span>
          </div>
        {:else}
          <a
            href={rootContext.href}
            class="thread-root-context"
            onclick={handleRootContextNav}
          >
            {#if rootContext.isStack}
              <span class="thread-root-context-stack-badge" aria-hidden="true">
                <ActivityStackMiniBadge />
              </span>
            {:else if rootContext.iconUrl}
              <img src={rootContext.iconUrl} alt="" class="thread-root-context-icon" />
            {:else}
              <span class="thread-root-context-emoji" aria-hidden="true">💬</span>
            {/if}
            <span class="thread-root-context-label">{rootContext.label}</span>
            <svg class="thread-root-context-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </a>
        {/if}
      {/if}
      <div class="thread-root">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="thread-bubble-click-wrap"
          class:clickable={showThreadActions}
          role={showThreadActions ? "button" : undefined}
          tabindex={showThreadActions ? 0 : undefined}
          onclick={showThreadActions ? (e) => onBubbleClick(e, "root") : undefined}
          onkeydown={showThreadActions ? (e) => onBubbleKeydown(e, "root") : undefined}
        >
          {#if isZapRoot}
            <ThreadZap
              {pictureUrl}
              {name}
              {pubkey}
              amount={zapAmount}
              {timestamp}
              {profileUrl}
              {version}
              {pending}
              content={content ?? ""}
              {emojiTags}
              {resolveMentionLabel}
            />
          {:else}
            <ThreadComment
              {appIconUrl}
              {appName}
              {appIdentifier}
              {version}
              {pictureUrl}
              {name}
              {pubkey}
              {timestamp}
              {profileUrl}
              {loading}
              {pending}
            >
              {#if content !== undefined && content !== null || (mediaUrls?.length ?? 0) > 0}
                <ShortTextContent
                  content={content ?? ''}
                  emojiTags={emojiTags ?? []}
                  mediaUrls={mediaUrls ?? []}
                  {resolveMentionLabel}
                  onMediaClick={({ url: u, type: t, urls: list }) => openLightbox(u, t, list)}
                  class="root-comment-body"
                />
              {:else}
                {@render children?.()}
              {/if}
            </ThreadComment>
          {/if}
        </div>
      </div>

      <div class="thread-divider"></div>

      <div class="thread-replies">
        {#if feedItems.length > 0}
          {#each feedItems as item (item.type === 'zap' ? `zap-${item.data.id}` : item.data.id)}
            {#if item.type === 'comment'}
              {@const reply = item.data}
              {@const pid = reply.parentId ? String(reply.parentId).toLowerCase() : ''}
              {@const idNorm = id ? String(id).toLowerCase() : ''}
              {@const quotedParent = reply.parentId && pid !== idNorm ? (threadById.get(pid) ?? threadById.get(reply.parentId)) : null}
              {@const quotedZap = !quotedParent && reply.parentId && pid !== idNorm ? (threadZapById.get(pid) ?? threadZapById.get(reply.parentId)) : null}
              <div
                class="thread-reply-row"
                class:desktop-bubble-actions-target={showThreadActions}
              >
                <div
                  class="thread-bubble-with-rail"
                  class:thread-bubble-with-rail--solo={!showThreadActions}
                >
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <div
                  class="thread-bubble-click-wrap thread-bubble-with-rail__main"
                  class:clickable={showThreadActions}
                  role={showThreadActions ? "button" : undefined}
                  tabindex={showThreadActions ? 0 : undefined}
                  onclick={showThreadActions ? (e) => onBubbleClick(e, reply) : undefined}
                  onkeydown={showThreadActions ? (e) => onBubbleKeydown(e, reply) : undefined}
                >
                  <MessageBubble
                    pictureUrl={reply.avatarUrl}
                    name={reply.displayName}
                    pubkey={reply.pubkey}
                    timestamp={reply.createdAt}
                    profileUrl={reply.profileUrl}
                    loading={reply.profileLoading}
                    light={true}
                  >
                    {#if quotedParent}
                      <QuotedMessage
                        authorName={displayNameOrNpubShort(quotedParent.displayName, quotedParent.pubkey)}
                        authorPubkey={quotedParent.pubkey}
                        content={quotedParent.content ?? ""}
                        emojiTags={quotedParent.emojiTags ?? []}
                        mediaUrls={quotedParent.mediaUrls ?? []}
                        resolveMentionLabel={resolveMentionLabel}
                      />
                    {:else if quotedZap}
                      <QuotedZapMessage
                        authorName={displayNameOrNpubShort(quotedZap.displayName, quotedZap.senderPubkey ?? quotedZap.pubkey ?? null)}
                        authorPubkey={quotedZap.senderPubkey ?? quotedZap.pubkey ?? null}
                        amountSats={quotedZap.amountSats ?? 0}
                        content={quotedZap.comment ?? ""}
                        emojiTags={quotedZap.emojiTags ?? []}
                        mediaUrls={[]}
                        resolveMentionLabel={resolveMentionLabel}
                      />
                    {/if}
                    {#if reply.content !== undefined && reply.content !== null || (reply.mediaUrls?.length ?? 0) > 0}
                      <ShortTextContent
                        content={reply.content ?? ''}
                        emojiTags={reply.emojiTags ?? []}
                        mediaUrls={reply.mediaUrls ?? []}
                        {resolveMentionLabel}
                        onMediaClick={({ url: u, type: t, urls: list }) => openLightbox(u, t, list)}
                        class="reply-comment-body"
                      />
                    {:else}
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- from parseComment(): escaped text + <br> only; no raw author tags -->
                      {@html reply.contentHtml || "<p class='text-muted-foreground italic'>No content</p>"}
                    {/if}
                  </MessageBubble>
                </div>
                {#if showThreadActions}
                  <CommentBubbleActionRail
                    onReply={() => openReplyToComment(reply)}
                    onZap={() => handleZapComment(reply)}
                    onOptions={() => openActionsModal(reply)}
                  />
                {/if}
                </div>
              </div>
            {:else}
              {@const zap = item.data}
              <div
                class="thread-reply-row"
                class:desktop-bubble-actions-target={showThreadActions}
              >
                <div
                  class="thread-bubble-with-rail"
                  class:thread-bubble-with-rail--solo={!showThreadActions}
                >
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <div
                  class="thread-bubble-click-wrap thread-bubble-with-rail__main"
                  class:clickable={showThreadActions}
                  role={showThreadActions ? "button" : undefined}
                  tabindex={showThreadActions ? 0 : undefined}
                  onclick={showThreadActions ? (e) => onBubbleClick(e, zap) : undefined}
                  onkeydown={showThreadActions ? (e) => onBubbleKeydown(e, zap) : undefined}
                >
                  <ZapBubble
                    pictureUrl={zap.avatarUrl}
                    name={zap.displayName}
                    pubkey={zap.senderPubkey ?? zap.pubkey}
                    amount={zap.amountSats ?? 0}
                    timestamp={zap.timestamp ?? zap.createdAt}
                    profileUrl={zap.profileUrl}
                    message={zap.comment ?? ""}
                    emojiTags={zap.emojiTags ?? []}
                    {resolveMentionLabel}
                  />
                </div>
                {#if showThreadActions}
                  <CommentBubbleActionRail
                    onReply={() => openReplyToZap(zap)}
                    onZap={() => handleZapComment(zap)}
                    onOptions={() => openActionsModal(zap)}
                  />
                {/if}
                </div>
              </div>
            {/if}
          {/each}
        {:else}
          <EmptyState message="No comments yet" compact />
        {/if}
      </div>
    </div>
    </div>

  {#snippet footer()}
    {#if showThreadActions && getIsSignedIn()}
      <div class="thread-footer-wrap">
      <div class="thread-bottom-bar" class:expanded={commentExpanded}>
        {#if !commentExpanded}
          <div class="thread-bottom-bar-content">
            <button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
              <Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
              <span>Zap</span>
            </button>

            {#if getIsSignedIn()}
              <InputButton placeholder="Comment" onclick={handleReply}>
                {#snippet icon()}
                  <Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
                {/snippet}
              </InputButton>
            {:else}
              <button
                type="button"
                class="thread-get-started-comment-btn"
                onclick={() => onGetStarted?.()}
              >
                <span class="get-started-text">Sign in to comment</span>
              </button>
            {/if}

            <button type="button" class="btn-secondary-large btn-secondary-dark options-button" onclick={handleOptions}>
              <Options variant="fill" size={20} color="hsl(var(--white33))" />
            </button>
          </div>
        {:else}
          <div class="thread-reply-form">
            <div class="thread-reply-input-wrap">
              <input
                type="file"
                accept={ACCEPTED_MEDIA_TYPES}
                multiple
                class="thread-reply-file-input"
                bind:this={replyFileInputEl}
                onchange={handleReplyFileChange}
                aria-hidden="true"
                tabindex="-1"
              />
              <ShortTextInput
                bind:this={replyInput}
                placeholder="Comment on {replyingToComment?.displayName ?? name ?? 'this'}"
                size="medium"
                getCurrentPubkey={getCurrentPubkey}
                {searchProfiles}
                {searchEmojis}
                autoFocus={true}
                showActionRow={true}
                onClose={closeReply}
                onCameraTap={handleReplyCameraTap}
                onEmojiTap={handleEmojiTap}
                onGifTap={() => {}}
                onAddTap={handleInsertTap}
                onChevronTap={() => {}}
                onsubmit={handleReplySubmit}
              >
                {#snippet aboveEditor()}
                  {#if replyingToComment}
                    <div class="thread-reply-quote-inset">
                      {#if replyingToComment.quotedAsZap === true}
                        <QuotedZapMessage
                          authorName={displayNameOrNpubShort(replyingToComment.displayName, replyingToComment.pubkey)}
                          authorPubkey={replyingToComment.pubkey}
                          amountSats={replyingToComment.amountSats ?? 0}
                          content={replyingToComment.content ?? ""}
                          emojiTags={replyingToComment.emojiTags ?? []}
                          mediaUrls={replyingToComment.mediaUrls ?? []}
                          resolveMentionLabel={resolveMentionLabel}
                        />
                      {:else}
                        <QuotedMessage
                          authorName={replyingToComment.displayName || "Anonymous"}
                          authorPubkey={replyingToComment.pubkey}
                          content={replyingToComment.content ?? ""}
                          emojiTags={replyingToComment.emojiTags ?? []}
                          mediaUrls={replyingToComment.mediaUrls ?? []}
                          resolveMentionLabel={resolveMentionLabel}
                        />
                      {/if}
                    </div>
                  {/if}
                {/snippet}
              </ShortTextInput>
            </div>
          </div>
        {/if}
      </div>
      </div>
    {/if}
  {/snippet}
</Modal>

<CommentActionsModal
  bind:open={actionsModalOpen}
  bind:nestedChildOpen={actionsNestedOpen}
  sheetBackdrop={!modalOpen}
  lockBodyScroll={modalLockBodyScroll}
  scopedInPanel={modalScopedInPanel}
  zIndex={modalZIndex + 5}
  compactMode={actionsModalCompact}
  authorName={actionsModalTarget === "root"
    ? displayNameOrNpubShort(name, pubkey)
    : displayNameOrNpubShort(
        actionsModalTarget?.displayName,
        actionsModalTarget && isActionsTargetThreadZap(actionsModalTarget)
          ? actionsModalTarget.senderPubkey
          : actionsModalTarget?.pubkey
      )}
  authorPubkey={actionsModalTarget === "root" ? pubkey : (actionsModalTarget && isActionsTargetThreadZap(actionsModalTarget) ? actionsModalTarget.senderPubkey : actionsModalTarget?.pubkey) ?? null}
  contentPreview={getActionsModalContentPreview()}
  isZapPreview={actionsModalIsZapPreview}
  zapAmountSats={actionsModalTarget === "root" && isZapRoot ? (zapAmount ?? 0) : (actionsModalTarget && typeof actionsModalTarget === "object" && "amountSats" in actionsModalTarget ? (actionsModalTarget.amountSats ?? 0) : 0)}
  zapContent={actionsModalTarget === "root" && isZapRoot ? (content ?? "") : (actionsModalTarget && typeof actionsModalTarget === "object" && "comment" in actionsModalTarget ? (actionsModalTarget.comment ?? "") : "")}
  zapEmojiTags={actionsModalTarget === "root" && isZapRoot ? (emojiTags ?? []) : (actionsModalTarget && typeof actionsModalTarget === "object" && "emojiTags" in actionsModalTarget ? (actionsModalTarget.emojiTags ?? []) : [])}
  targetEventId={actionsTargetEventId}
  targetEventKind={actionsTargetEventKind}
  labelCommunityPubkey={labelCommunityPubkey}
  {searchProfiles}
  {searchEmojis}
  {signEvent}
  onComment={actionsModalOnComment}
  onZap={actionsModalOnZap}
  onZapPreset={handleActionsZapPreset}
/>

<ZapSliderModal
  bind:isOpen={zapModalOpen}
  target={zapTarget}
  publisherName={displayNameOrNpubShort(name, pubkey)}
  otherZaps={[]}
  nestedModal={modalOpen}
  lockBodyScroll={modalLockBodyScroll}
  scopedInPanel={modalScopedInPanel}
  zIndex={modalZIndex + 10}
  presetZapSats={zapPresetSats}
  {searchProfiles}
  {searchEmojis}
  onclose={handleZapClose}
  onzapReceived={handleZapReceived}
  {onZapPending}
  {onZapPendingClear}
/>

<EmojiPickerModal
  bind:isOpen={emojiPickerOpen}
  getCurrentPubkey={getCurrentPubkey}
  onSelectEmoji={handleEmojiSelect}
  onclose={() => { emojiPickerOpen = false; }}
/>

<InsertModal
  title="Insert"
  bind:isOpen={insertModalOpen}
  getCurrentPubkey={getCurrentPubkey}
  onInsert={handleInsertNostrRef}
  onclose={() => { insertModalOpen = false; }}
/>

<MediaLightboxModal bind:isOpen={lightboxOpen} urls={lightboxUrls} initialIndex={lightboxIndex} />

<style>
  .root-comment {
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }

  .reply-indicator {
    display: flex;
    align-items: flex-end;
    margin-left: 19px;
    width: calc(100% - 19px);
  }

  .connector-column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 27px;
    flex-shrink: 0;
    padding-bottom: 14px;
  }

  .connector-vertical {
    width: 1.5px;
    height: 12px;
    background: hsl(var(--white16));
    margin-left: 0.25px;
  }

  .connector-corner {
    width: 27px;
    height: 16px;
  }

  .connector-corner svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .repliers-row {
    display: flex;
    align-items: center;
    padding-top: 4px;
    flex: 1;
    min-width: 0;
  }

  .thread-content-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /**
   * Single dim layer over the entire thread sheet (scroll area + footer + safe-area padding).
   * In-document overlays inside `.modal-content` missed the bottom (padding / flex gap) and looked broken above stacked sheets.
   */
  :global(.thread-modal::before) {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: hsl(var(--black33));
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }

  :global(.thread-modal.thread-modal-child-open::before) {
    opacity: 1;
  }

  :global(.thread-modal .modal-content),
  :global(.thread-modal > .thread-footer-wrap) {
    position: relative;
    z-index: 0;
  }

  /* Whole thread modal scales and moves down when Zap or options modal opens (class is on Modal’s container) */
  :global(.thread-modal.thread-modal-child-open) {
    transform: scale(0.97) translateY(8px);
    transform-origin: top center;
    transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .thread-footer-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .thread-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .thread-root-context {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid hsl(var(--border));
    text-decoration: none;
    color: hsl(var(--white66));
    font-size: 0.8125rem;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .thread-root-context:hover {
    background: hsl(var(--foreground) / 0.025);
  }

  .thread-root-context--deleted {
    cursor: default;
    color: hsl(var(--white33));
  }

  .thread-root-context--deleted:hover {
    background: transparent;
  }

  .thread-root-context-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  /* Mini stack grid (28px) scaled to align with 24px app icons in this row */
  .thread-root-context-stack-badge {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thread-root-context-stack-badge :global(.stack-mini-badge) {
    transform: scale(calc(24 / 28));
    transform-origin: center center;
  }

  .thread-root-context-emoji {
    font-size: 20px;
    line-height: 1;
    flex-shrink: 0;
  }

  .thread-root-context-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-root-context-chevron {
    flex-shrink: 0;
    opacity: 0.5;
  }

  .thread-root {
    padding: 16px;
    padding-bottom: 12px;
  }

  .thread-bubble-click-wrap {
    display: block;
    width: 100%;
  }
  .thread-bubble-click-wrap.clickable {
    cursor: pointer;
  }

  /* Shrink-wrap so the action rail sits beside the bubble, not at the modal’s far right */
  .thread-bubble-with-rail {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
  }

  .thread-bubble-with-rail__main {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
  }

  .thread-bubble-with-rail__main.thread-bubble-click-wrap {
    width: auto;
    max-width: 100%;
  }

  @media (max-width: 767px) {
    .thread-bubble-with-rail--solo {
      gap: 0;
    }
  }

  .thread-divider {
    height: 1.4px;
    background-color: hsl(var(--white11));
    margin: 0;
  }

  .thread-replies {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 16px 16px;
  }

  .thread-reply-row {
    width: 100%;
    min-width: 0;
  }

  .thread-bottom-bar {
    background: hsl(var(--gray66));
    border-top: 0.33px solid hsl(var(--white16));
    padding: 16px 6px 16px 16px;
    max-height: 88px;
    overflow: hidden;
    transition: max-height 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .thread-bottom-bar.expanded {
    max-height: 50vh;
    padding: 12px;
  }

  .thread-bottom-bar-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .thread-reply-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
  }

  .thread-reply-quote-inset {
    padding-left: 4px;
    box-sizing: border-box;
    min-width: 0;
  }

  .thread-reply-input-wrap {
    position: relative;
    background: hsl(var(--black33));
    border-radius: var(--radius-16);
    border: 0.33px solid hsl(var(--white33));
    min-height: 0;
    flex: 1;
  }
  .thread-reply-file-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .zap-button {
    gap: 8px;
    padding: 0 20px 0 14px;
    flex-shrink: 0;
  }

  /* Same look as Comment InputButton: border, bg, height, radius */
  .thread-get-started-comment-btn {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 16px;
    background-color: hsl(var(--black33));
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white33));
    cursor: pointer;
    justify-content: flex-start;
  }
  .thread-get-started-comment-btn .get-started-text {
    color: hsl(var(--white33));
    font-size: 16px;
    font-weight: 500;
  }
  @media (max-width: 767px) {
    .thread-get-started-comment-btn {
      height: 38px;
    }
    .thread-get-started-comment-btn .get-started-text {
      font-size: 14px;
    }
  }

  .options-button {
    width: 42px;
    padding: 0;
    flex-shrink: 0;
    background: transparent !important;
    border: none !important;
    margin-left: -12px;
  }

  .options-button :global(svg) {
    width: 24px;
    height: 24px;
  }

  @media (max-width: 767px) {
    .options-button {
      width: 38px;
    }

    .zap-button span {
      font-size: 14px;
    }

    .thread-bottom-bar.expanded {
      padding: 16px;
    }
  }

  @media (min-width: 768px) {
    .thread-bottom-bar {
      padding: 12px 2px 12px 12px;
    }

    .thread-bottom-bar.expanded {
      padding: 12px;
    }
  }
</style>
