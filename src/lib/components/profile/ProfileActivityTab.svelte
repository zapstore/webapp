<script lang="js">
/**
 * ProfileActivityTab — lazy-loaded kind:1111 comments authored by a profile.
 *
 * Clicking an activity card opens the same RootComment thread modal as the
 * community activity feed, using the same resolution helpers.
 *
 * Key invariant: threadRootEvent is always the ROOT COMMENT event (kind:1111),
 * NOT the app/stack/forum-post event. RootComment needs the comment's own
 * pubkey/content/timestamp for its internal reply-threading logic even when
 * hideRoot={true}. The app/stack/forum context is passed separately via rootContext.
 */
import { onMount } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { nip19 } from 'nostr-tools';
import {
	fetchFromRelays,
	queryEvents,
	queryEvent,
	putEvents,
	parseApp,
	parseAppStack,
	parseComment,
	parseProfile,
	publishComment,
	getEventOneliner,
	fetchProfilesBatch
} from '$lib/nostr';
import { resolveAppDiscussionRootCommentId, collectCommentSubtree } from '$lib/nostr/thread-discussion.js';
import {
	EVENT_KINDS,
	ZAPSTORE_RELAY,
	DEFAULT_SOCIAL_RELAYS,
	COMMENT_PUBLISH_RELAYS
} from '$lib/config';
import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import CommentCard from '$lib/components/community/CommentCard.svelte';
import RootComment from '$lib/components/social/RootComment.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';

let { pubkey = '', profileName = '', profilePicture = '' } = $props();

/** @type {import('nostr-tools').NostrEvent[]} */
let comments = $state([]);

/* eslint-disable svelte/no-unnecessary-state-wrap -- $state tracks wholesale SvelteMap replacements */
/**
 * Unified root event map — keyed by A/a-tag value (addr) or event-id (forum post).
 * These are the APP / STACK / FORUM-POST events, used for rootContext + appBadge.
 */
let rootEventByKey = $state(/** @type {Map<string, import('nostr-tools').NostrEvent>} */ (new SvelteMap()));

/** Parsed badge info for addr roots. */
let rootInfoByATag = $state(/** @type {Map<string, { icon?: string|null, name: string, identifier: string, isStack: boolean, href: string|null }>} */ (new SvelteMap()));

/** parent comment event map for reply quotes in the activity feed. */
let parentCommentMap = $state(/** @type {Map<string, import('nostr-tools').NostrEvent>} */ (new SvelteMap()));

/** pubkey → parsed profile; used to resolve @mention labels in comment content. */
let mentionProfiles = $state(/** @type {Map<string, { name?: string, displayName?: string }>} */ (new SvelteMap()));
/* eslint-enable svelte/no-unnecessary-state-wrap */

let loading = $state(true);
let error = $state('');

// ── Thread modal state ────────────────────────────────────────────────────────
/** ID of the root comment event (kind:1111) for the open thread. */
let threadRootId = $state(/** @type {string | null} */ (null));
/** The root COMMENT event (kind:1111) — NOT the app/stack/forum-post event. */
let threadRootCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
/** The app/stack/forum-post event for rootContext banner. */
let threadContextEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
/** A-tag value ("kind:pubkey:dTag") for addr roots; null for forum-post roots. */
let threadAddrATag = $state(/** @type {string | null} */ (null));
/** Which comment to auto-expand inside the thread modal. */
let threadExpandId = $state(/** @type {string | null} */ (null));
/** Enriched thread comment objects for RootComment.threadComments. */
let threadComments = $state(/** @type {any[]} */ ([]));

const searchProfilesFn = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojisFn = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Root reference for a NIP-22 comment:
 * - { type: 'addr', value: "kind:pubkey:dTag" } for apps/stacks
 * - { type: 'id',   value: "<event-id>" }        for forum posts
 */
function getRootRef(event) {
	const aTag =
		event.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
		event.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
		null;
	if (aTag) return { type: 'addr', value: aTag };

	const eTag = event.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
	if (eTag) return { type: 'id', value: eTag };

	return null;
}

function getParentCommentId(event) {
	const upperRef = event.tags?.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1])?.[1];
	const lowerRef = event.tags?.find((t) => t[0] === 'e' && t[1])?.[1];
	if (!lowerRef) return null;
	if (upperRef && lowerRef === upperRef) return null;
	return lowerRef;
}

/** Convert a raw Nostr event to the shape RootComment.threadComments expects. */
function toThreadComment(e) {
	const c = parseComment(e);
	const p = mentionProfiles.get(e.pubkey);
	let npub = '';
	try { npub = nip19.npubEncode(e.pubkey); } catch { /* ignore */ }
	return {
		...c,
		id: e.id,
		pubkey: e.pubkey,
		createdAt: e.created_at,
		displayName:
			p?.displayName ??
			p?.name ??
			(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
		avatarUrl: p?.picture ?? null,
		profileUrl: npub ? `/profile/${npub}` : '',
		profileLoading: false
	};
}

// ── Data loading ──────────────────────────────────────────────────────────────

const ACTIVITY_LIST_LIMIT = 20;

onMount(async () => {
	if (!browser || !pubkey) { loading = false; return; }

	try {
		let local = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], authors: [pubkey], limit: ACTIVITY_LIST_LIMIT });
		if (local.length > 0) {
			local.sort((a, b) => b.created_at - a.created_at);
			comments = local;
			loading = false;
			await Promise.all([resolveRoots(local), resolveParents(local), resolveMentionProfiles(local)]);
		}

		const fetched = await fetchFromRelays(
			[ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS],
			{ kinds: [EVENT_KINDS.COMMENT], authors: [pubkey], limit: ACTIVITY_LIST_LIMIT },
			{ timeout: 7000, feature: 'profile-activity' }
		);

		if (fetched.length > 0) {
			const deduped = new SvelteMap();
			for (const e of [...local, ...fetched]) if (e.id) deduped.set(e.id, e);
			const merged = Array.from(deduped.values()).sort((a, b) => b.created_at - a.created_at);
			comments = merged;
			await Promise.all([resolveRoots(merged), resolveParents(merged), resolveMentionProfiles(merged)]);
		}
	} catch (e) {
		console.error('[ProfileActivityTab] fetch error', e);
		error = 'Could not load activity.';
	} finally {
		loading = false;
	}
});

async function resolveRoots(evts) {
	const addrKeys = new SvelteSet();
	const forumIds = new SvelteSet();

	for (const e of evts) {
		const ref = getRootRef(e);
		if (!ref) continue;
		if (ref.type === 'addr') addrKeys.add(ref.value);
		else forumIds.add(ref.value);
	}

	if (addrKeys.size === 0 && forumIds.size === 0) return;

	const appDTags = [];
	const stackDTags = [];
	for (const key of addrKeys) {
		const parts = key.split(':');
		const kind = Number(parts[0]);
		const dTag = parts[2];
		if (!dTag) continue;
		if (kind === EVENT_KINDS.APP) appDTags.push(dTag);
		else if (kind === EVENT_KINDS.APP_STACK) stackDTags.push(dTag);
	}

	const [appEvents, stackEvents, forumEvents] = await Promise.all([
		appDTags.length > 0 ? queryEvents({ kinds: [EVENT_KINDS.APP], '#d': appDTags }) : Promise.resolve([]),
		stackDTags.length > 0 ? queryEvents({ kinds: [EVENT_KINDS.APP_STACK], '#d': stackDTags }) : Promise.resolve([]),
		forumIds.size > 0 ? queryEvents({ ids: [...forumIds] }) : Promise.resolve([])
	]);

	const nextEvents = new SvelteMap(rootEventByKey);
	const nextInfo = new SvelteMap(rootInfoByATag);

	for (const rawEvent of appEvents) {
		const app = parseApp(rawEvent);
		if (app.pubkey && app.dTag) {
			const key = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
			let href = null;
			try { href = `/apps/${nip19.naddrEncode({ kind: EVENT_KINDS.APP, pubkey: app.pubkey, identifier: app.dTag })}`; }
			catch { href = `/apps/${app.dTag}`; }
			nextEvents.set(key, rawEvent);
			nextInfo.set(key, { icon: app.icon ?? null, name: app.name || app.dTag || '', identifier: app.dTag, isStack: false, href });
		}
	}

	for (const rawEvent of stackEvents) {
		const stack = parseAppStack(rawEvent);
		if (stack.pubkey && stack.dTag) {
			const key = `${EVENT_KINDS.APP_STACK}:${stack.pubkey}:${stack.dTag}`;
			let href = null;
			try { href = `/stacks/${nip19.naddrEncode({ kind: EVENT_KINDS.APP_STACK, pubkey: stack.pubkey, identifier: stack.dTag })}`; }
			catch { /* ignore */ }
			nextEvents.set(key, rawEvent);
			nextInfo.set(key, { icon: null, name: stack.title || stack.dTag || '', identifier: stack.dTag, isStack: true, href });
		}
	}

	for (const rawEvent of forumEvents) {
		if (rawEvent.id) nextEvents.set(rawEvent.id, rawEvent);
	}

	rootEventByKey = nextEvents;
	rootInfoByATag = nextInfo;
}

async function resolveParents(evts) {
	const toFetch = [];
	for (const ev of evts) {
		const parentId = getParentCommentId(ev);
		if (parentId && ev.id) toFetch.push({ commentId: ev.id, parentId });
	}
	if (toFetch.length === 0) return;

	const parentIds = [...new SvelteSet(toFetch.map((f) => f.parentId))];
	let found = await queryEvents({ ids: parentIds });
	const foundIds = new SvelteSet(found.map((e) => e.id));

	const missing = parentIds.filter((id) => !foundIds.has(id));
	if (missing.length > 0) {
		const fromRelay = await fetchFromRelays(
			[ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS],
			{ ids: missing, limit: missing.length },
			{ timeout: 5000, feature: 'profile-parent-comments' }
		);
		found = [...found, ...fromRelay];
	}

	const byId = new SvelteMap(found.map((e) => [e.id, e]));
	const next = new SvelteMap(parentCommentMap);
	for (const { commentId, parentId } of toFetch) {
		const parent = byId.get(parentId);
		if (parent) next.set(commentId, parent);
	}
	parentCommentMap = next;
}

async function resolveMentionProfiles(evts) {
	const pubkeys = new SvelteSet();
	for (const ev of evts) {
		// Include the comment author so thread bubbles get real names/pics.
		if (ev.pubkey) pubkeys.add(ev.pubkey);
		for (const tag of ev.tags) {
			if (tag[0] === 'p' && tag[1]) pubkeys.add(tag[1]);
		}
	}
	if (pubkeys.size === 0) return;

	const rawProfiles = await fetchProfilesBatch([...pubkeys]);
	const next = new SvelteMap(mentionProfiles);
	for (const [pk, event] of rawProfiles) {
		if (event) next.set(pk, parseProfile(event));
	}
	mentionProfiles = next;
}

// ── Thread modal ──────────────────────────────────────────────────────────────

async function fetchEvent(id) {
	const local = await queryEvent({ ids: [id] });
	if (local) return local;
	const fetched = await fetchFromRelays(
		[ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS],
		{ ids: [id], limit: 1 },
		{ timeout: 4000, feature: 'profile-thread-parent' }
	);
	return fetched[0] ?? null;
}

async function openThread(commentEv) {
	const ref = getRootRef(commentEv);
	if (!ref) return;

	// Build a comment map from what's already loaded (avoids relay trips when possible).
	const commentMap = new SvelteMap(comments.map((c) => [c.id.toLowerCase(), c]));

	// resolveAppDiscussionRootCommentId walks the `e` parent chain upward.
	// It works for both addr (app/stack) and id (forum post) threads:
	// for forum posts the walk stops when the parent is not a kind:1111 comment.
	const rootId = await resolveAppDiscussionRootCommentId(commentEv, commentMap, fetchEvent);

	// The context event is the APP/STACK/FORUM-POST event — for rootContext banner.
	const contextEv = rootEventByKey.get(ref.value) ?? null;
	const addrATag = ref.type === 'addr' ? ref.value : null;

	// Fetch the actual ROOT COMMENT event (kind:1111) — RootComment needs it
	// for pubkey/content/timestamp even with hideRoot={true}.
	let rootCommentEv = commentMap.get(rootId.toLowerCase()) ?? await fetchEvent(rootId);

	threadRootId = rootId;
	threadRootCommentEv = rootCommentEv;
	threadContextEv = contextEv;
	threadAddrATag = addrATag;
	threadExpandId = commentEv.id !== rootId ? commentEv.id : null;
	threadComments = [];

	// Start loading thread comments — modal renders immediately.
	loadThreadComments(rootId, addrATag);
}

async function loadThreadComments(rootId, addrATag) {
	// Fetch the broad pool: all comments on this app/stack/forum-post.
	// Then narrow to the subtree rooted at rootId via collectCommentSubtree,
	// so we only show the specific branch the user clicked — not every comment
	// on the parent app/stack.
	let pool = [];
	if (addrATag) {
		pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [addrATag], limit: 300 });
		if (pool.length === 0)
			pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [addrATag], limit: 300 });
	} else {
		pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [rootId], limit: 300 });
		if (pool.length === 0)
			pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [rootId], limit: 300 });
	}

	// Narrow to the branch: descendants of rootId only, excluding the root itself.
	const subtree = collectCommentSubtree(rootId, pool);
	const filtered = subtree.filter((e) => e.id !== rootId);

	if (threadRootId === rootId) {
		// Resolve author profiles first so toThreadComment can use real names/pics.
		await resolveMentionProfiles(filtered);
		if (threadRootId === rootId) threadComments = filtered.map(toThreadComment);
	}

	// Background relay hydration — fetch from relays, re-narrow to subtree.
	const relayFilter = addrATag
		? { kinds: [EVENT_KINDS.COMMENT], '#A': [addrATag], limit: 300 }
		: { kinds: [EVENT_KINDS.COMMENT], '#E': [rootId], limit: 300 };

	fetchFromRelays(
		[ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS],
		relayFilter,
		{ timeout: 6000, feature: 'profile-thread-comments' }
	).then(async (more) => {
		if (!more.length || threadRootId !== rootId) return;
		await putEvents(more);
		const combined = new SvelteMap();
		for (const e of [...pool, ...more]) combined.set(e.id, e);
		const subtree2 = collectCommentSubtree(rootId, Array.from(combined.values()));
		const all = subtree2.filter((e) => e.id !== rootId);
		await resolveMentionProfiles(all);
		if (threadRootId === rootId) threadComments = all.map(toThreadComment);
	}).catch(() => { /* ignore */ });
}

function closeThread() {
	threadRootId = null;
	threadRootCommentEv = null;
	threadContextEv = null;
	threadAddrATag = null;
	threadExpandId = null;
	threadComments = [];
}

async function handleThreadReply(e) {
	if (!e?.text?.trim() || !threadRootId) return;

	/** @type {any} */
	let contentTarget = null;
	if (threadAddrATag) {
		const parts = threadAddrATag.split(':');
		const kindNum = Number(parts[0]);
		const pk = parts[1];
		const identifier = parts.slice(2).join(':');
		if (kindNum === EVENT_KINDS.APP) contentTarget = { contentType: 'app', pubkey: pk, identifier };
		else if (kindNum === EVENT_KINDS.APP_STACK) contentTarget = { contentType: 'stack', pubkey: pk, identifier };
	} else if (threadContextEv) {
		contentTarget = { contentType: 'forum', eventId: threadContextEv.id, pubkey: threadContextEv.pubkey };
	}

	if (!contentTarget) return;

	const signed = await publishComment(
		e.text,
		contentTarget,
		signEvent,
		e.emojiTags ?? [],
		e.parentId ?? null,
		e.replyToPubkey ?? null,
		e.parentKind ?? EVENT_KINDS.COMMENT,
		e.mentions ?? [],
		COMMENT_PUBLISH_RELAYS,
		e.mediaUrls ?? []
	);

	if (signed) threadComments = [...threadComments, toThreadComment(signed)];
}
</script>

<div class="profile-activity">
	{#if loading && comments.length === 0}
		<ActivityFeedSkeleton />
	{:else if error}
		<EmptyState message={error} minHeight={200} topAlign={true} />
	{:else if comments.length === 0}
		<EmptyState message="No activity yet" minHeight={200} topAlign={true} />
	{:else}
		<div class="activity-feed">
			{#each comments as event (event.id)}
				{@const rootRef = getRootRef(event)}
				{@const rootEvent = rootRef ? (rootEventByKey.get(rootRef.value) ?? null) : null}
				{@const rootInfo = rootRef?.type === 'addr' ? (rootInfoByATag.get(rootRef.value) ?? null) : null}
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => openThread(event)}
					onkeydown={(e) => { if (e.key === 'Enter') openThread(event); }}
				>
				<CommentCard
					{event}
					{rootEvent}
					authorProfile={{ name: profileName, picture: profilePicture || undefined, pubkey }}
					parentComment={parentCommentMap.get(event.id) ?? null}
					appBadge={rootInfo && !rootInfo.isStack
						? { iconUrl: rootInfo.icon, name: rootInfo.name, identifier: rootInfo.identifier }
						: null}
					onRootClick={rootInfo?.href ? () => goto(rootInfo.href) : null}
					resolveMentionLabel={(pk) =>
						mentionProfiles.get(pk)?.displayName ?? mentionProfiles.get(pk)?.name ?? null}
				/>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if threadRootId}
	{@const rootInfo = threadAddrATag ? (rootInfoByATag.get(threadAddrATag) ?? null) : null}
	{@const contextOneliner = getEventOneliner(threadContextEv)}
	{@const rootContext = rootInfo
		? { label: rootInfo.name, iconUrl: rootInfo.icon ?? null, href: rootInfo.href ?? null, isStack: rootInfo.isStack }
		: threadContextEv
			? { label: contextOneliner.label, iconUrl: null, href: null }
			: null}
	{@const wrapperRoot = threadAddrATag
		? (() => { const p = threadAddrATag.split(':'); return { kind: Number(p[0]), pubkey: p[1], identifier: p.slice(2).join(':') }; })()
		: threadContextEv
			? { kind: threadContextEv.kind, pubkey: threadContextEv.pubkey, eventId: threadContextEv.id }
			: null}
	{@const rootNpub = (() => { try { return threadRootCommentEv ? nip19.npubEncode(threadRootCommentEv.pubkey) : ''; } catch { return ''; } })()}
	{@const rootEmojiTags = (threadRootCommentEv?.tags ?? []).filter((t) => t[0] === 'emoji' && t[1] && t[2]).map((t) => ({ shortcode: t[1], url: t[2] }))}
	{@const rootMediaUrls = (threadRootCommentEv?.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
	{#key threadRootId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			id={threadRootId}
			pubkey={threadRootCommentEv?.pubkey ?? null}
			content={threadRootCommentEv?.content ?? ''}
			emojiTags={rootEmojiTags}
			mediaUrls={rootMediaUrls}
			timestamp={threadRootCommentEv?.created_at ?? null}
			name={rootNpub ? `npub1${rootNpub.slice(5, 8)}…${rootNpub.slice(-6)}` : ''}
			pictureUrl={null}
			{threadComments}
			expandCommentId={threadExpandId}
			appIconUrl={rootInfo?.icon ?? null}
			appName={rootInfo?.name ?? ''}
			appIdentifier={rootInfo?.identifier ?? null}
			{rootContext}
			{wrapperRoot}
		onModalClose={closeThread}
		{signEvent}
		searchProfiles={searchProfilesFn}
		searchEmojis={searchEmojisFn}
		onReplySubmit={handleThreadReply}
		resolveMentionLabel={(pk) =>
			mentionProfiles.get(pk)?.displayName ?? mentionProfiles.get(pk)?.name ?? null}
	/>
	{/key}
{/if}

<style>
	.profile-activity {
		display: flex;
		flex-direction: column;
	}

	.activity-feed {
		display: flex;
		flex-direction: column;
	}

	.activity-item {
		padding: 12px 16px;
		border-bottom: 1px solid var(--white11);
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}
</style>
