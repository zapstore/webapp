<script lang="js">
	/**
	 * Activity feed — comments within the Zapstore forum (posts with #h tag).
	 * Uses same CommentCard as chateau; liveQuery from Dexie, seed from relay.
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
		fetchProfilesBatch,
		putEvents,
		queryEvents,
		queryEvent,
		liveQuery
	} from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS, ZAPSTORE_COMMUNITY_NPUB, FORUM_RELAY } from '$lib/config';
	import { goto } from '$app/navigation';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const RELAYS = [FORUM_RELAY];

	const FORUM_FILTER = { kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: 500 };

	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityComments = $state([]);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} root id/addr -> root event */
	let activityRootEvents = $state(new Map());
	/** @type {Map<string, { displayName?: string, name?: string, picture?: string }>} */
	let activityProfiles = $state(new Map());

	const activityCommentMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityComments) m.set(ev.id, ev);
		return m;
	});

	let activityReady = $state(false);
	let activityLoading = $state(false);
	let activityError = $state('');

	// liveQuery: get forum post IDs, then comments that reference them (#E tag)
	const activityQuery = $derived(
		browser && COMMUNITY_PUBKEY && activityReady
			? liveQuery(async () => {
					const forumEvs = await queryEvents(FORUM_FILTER);
					const rootIds = forumEvs.map((e) => e.id).filter(Boolean);
					if (rootIds.length === 0) return [];

					const [commentsE, commentsEUpper] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 300 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': rootIds, limit: 300 })
					]);
					const byId = new Map();
					for (const ev of [...commentsE, ...commentsEUpper]) byId.set(ev.id, ev);
					return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
				})
			: null
	);

	$effect(() => {
		if (!activityQuery) return;
		const sub = activityQuery.subscribe({
			next: (val) => {
				activityComments = val ?? [];
				for (const ev of activityComments) {
					resolveActivityRootEvent(ev);
					scheduleActivityProfileFetch(ev.pubkey);
					const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
					if (parentTag?.[1]) {
						const parent = val?.find((c) => c.id === parentTag[1]);
						if (parent?.pubkey) scheduleActivityProfileFetch(parent.pubkey);
					}
				}
			},
			error: (e) => {
				console.error('[Activity] liveQuery error', e);
				activityError = 'Failed to load activity.';
			}
		});
		return () => sub.unsubscribe();
	});

	async function resolveActivityRootEvent(commentEvent) {
		if (!commentEvent?.tags) return;
		const eRootTag = commentEvent.tags.find((t) => t[0] === 'E' && t[1]);
		const rootId = eRootTag?.[1] ?? null;
		if (!rootId || activityRootEvents.get(rootId)) return;

		let rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
		if (rootEv) {
			activityRootEvents = new Map(activityRootEvents).set(rootId, rootEv);
			return;
		}

		try {
			const arr = await fetchFromRelays(RELAYS, { ids: [rootId], limit: 1 }, { timeout: 4000 });
			if (arr?.[0]) {
				await putEvents([arr[0]]).catch(() => {});
				activityRootEvents = new Map(activityRootEvents).set(rootId, arr[0]);
			}
		} catch {
			// non-fatal
		}
	}

	let _activityProfileTimer = null;
	const _activityPendingProfiles = new Set();
	function scheduleActivityProfileFetch(pubkey) {
		if (!pubkey || activityProfiles.get(pubkey)) return;
		_activityPendingProfiles.add(pubkey);
		if (_activityProfileTimer) return;
		_activityProfileTimer = setTimeout(async () => {
			_activityProfileTimer = null;
			const keys = [..._activityPendingProfiles];
			_activityPendingProfiles.clear();
			if (!keys.length) return;
			try {
				const results = await fetchProfilesBatch(keys, { timeout: 4000 });
				for (const [pk, event] of results) {
					try {
						activityProfiles = new Map(activityProfiles).set(pk, parseProfile(event));
					} catch {
						/* skip */
					}
				}
			} catch {
				/* non-fatal */
			}
		}, 200);
	}

	async function seedActivityFromRelay() {
		if (!COMMUNITY_PUBKEY || !browser) return;
		activityLoading = true;
		activityError = '';
		try {
			const forumEvs = await queryEvents(FORUM_FILTER);
			const rootIds = forumEvs.map((e) => e.id).filter(Boolean);
			if (rootIds.length > 0) {
				const evs = await fetchFromRelays(
					RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 500 },
					{ timeout: 7000 }
				);
				if (evs?.length) await putEvents(evs).catch(() => {});
			}
		} catch (err) {
			console.error('[Activity] relay seed failed', err);
			activityError = 'Failed to sync activity.';
		} finally {
			activityLoading = false;
		}
	}

	/**
	 * Navigate to the forum post. If commentId is set (deeper reply), add ?comment= so the post page opens the thread modal for that comment.
	 */
	function openRootPost(rootEvent, commentId = null) {
		if (!rootEvent?.id) return;
		try {
			const nevent = nip19.neventEncode({ id: rootEvent.id });
			const url = commentId ? `/community/forum/${nevent}?comment=${commentId}` : `/community/forum/${nevent}`;
			goto(url);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		if (!browser) return;
		activityReady = true;
		seedActivityFromRelay();
	});
</script>

<svelte:head>
	<title>Activity — Zapstore</title>
</svelte:head>

<div class="panel-content activity-panel">
	{#if !activityReady || (activityLoading && activityComments.length === 0)}
		<div class="loading-wrap">
			<Spinner size={24} />
			<span>Loading activity…</span>
		</div>
	{:else if activityError && activityComments.length === 0}
		<div class="empty-state-wrap">
			<EmptyState message={activityError} minHeight={280} />
		</div>
	{:else if activityComments.length === 0}
		<div class="empty-state-wrap">
			<EmptyState message="No Activity yet" minHeight={280} />
		</div>
	{:else}
		<div class="activity-list">
			{#each activityComments as commentEv (commentEv.id)}
				{@const authorProfileRaw = activityProfiles.get(commentEv.pubkey)}
				{@const authorProfile = authorProfileRaw
					? {
							name: authorProfileRaw.displayName ?? authorProfileRaw.name,
							picture: authorProfileRaw.picture,
							pubkey: commentEv.pubkey
						}
					: { name: '', picture: '', pubkey: commentEv.pubkey }}
				{@const eRootTag = commentEv.tags?.find((t) => t[0] === 'E' && t[1])}
				{@const rootKey = eRootTag?.[1] ?? null}
				{@const rootEvent = rootKey ? activityRootEvents.get(rootKey) ?? null : null}
				{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
				{@const parentId = eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null}
				{@const parentComment = parentId ? activityCommentMap.get(parentId) ?? null : null}
				{@const parentAuthorRaw = parentComment ? activityProfiles.get(parentComment.pubkey) : null}
				{@const parentCommentAuthor = parentComment && parentAuthorRaw
					? {
							name: parentAuthorRaw.displayName ?? parentAuthorRaw.name,
							picture: parentAuthorRaw.picture,
							pubkey: parentComment.pubkey
						}
					: null}
				{@const authorNpub = (() => {
					try {
						return nip19.npubEncode(commentEv.pubkey);
					} catch {
						return '';
					}
				})()}
				{@const isDeeperReply = !!parentId}
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => openRootPost(rootEvent, isDeeperReply ? commentEv.id : null)}
					onkeydown={(e) => e.key === 'Enter' && openRootPost(rootEvent, isDeeperReply ? commentEv.id : null)}
				>
					<CommentCard
						event={commentEv}
						{authorProfile}
						{rootEvent}
						{parentComment}
						{parentCommentAuthor}
						profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
						resolveMentionLabel={(pk) =>
							activityProfiles.get(pk)?.displayName ?? activityProfiles.get(pk)?.name ?? pk?.slice(0, 8) ?? ''}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.activity-panel {
		overflow-y: auto;
	}

	.loading-wrap,
	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 24px;
		min-height: 280px;
	}

	.loading-wrap span,
	.empty-state-wrap :global(.empty-state-message) {
		color: hsl(var(--white66));
		font-size: 0.9375rem;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		padding: 0 0 16px;
	}

	.activity-item {
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--white11));
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}
</style>
