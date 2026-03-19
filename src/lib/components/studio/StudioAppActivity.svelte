<script lang="js">
	/**
	 * Comments on the signed-in developer's apps (NIP-22 root `A` / `a` = 32267:pubkey:d-tag).
	 * Local-first via Dexie liveQuery; background seed from DEFAULT_SOCIAL_RELAYS only.
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchCommentsByRootATags,
		fetchProfilesBatch,
		putEvents,
		queryEvents,
		queryEvent,
		liveQuery,
		encodeAppNaddr
	} from '$lib/nostr';
	import { parseApp, parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS } from '$lib/config';
	import { goto } from '$app/navigation';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import { DUMMY_MODE } from './studio-config.js';

	/** @type {{ id: string, name: string, icon: string }[]} */
	let { devPubkey = null, apps = [] } = $props();

	const appAddrs = $derived(
		devPubkey && apps.length
			? apps.map((a) => `${EVENT_KINDS.APP}:${devPubkey}:${a.id}`)
			: []
	);

	const seedKey = $derived(appAddrs.slice().sort().join('|'));

	/** @type {Map<string, { id: string, name: string, icon: string }>} */
	const appByAddr = $derived.by(() => {
		const m = new Map();
		if (!devPubkey) return m;
		for (const a of apps) {
			m.set(`${EVENT_KINDS.APP}:${devPubkey}:${a.id}`, a);
		}
		return m;
	});

	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityComments = $state([]);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} root `a` value → kind 32267 app event */
	let rootAppEvents = $state(new Map());
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

	/** @type {string} last `seedKey` we fetched from relays (non-reactive on purpose). */
	let lastActivitySeedKey = '';

	const activityQuery = $derived(
		browser && !DUMMY_MODE && devPubkey && appAddrs.length > 0 && activityReady
			? liveQuery(async () => {
					const [commentsA, commentsUpper] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': appAddrs, limit: 500 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': appAddrs, limit: 500 })
					]);
					const byId = new Map();
					for (const ev of [...commentsA, ...commentsUpper]) byId.set(ev.id, ev);
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
					resolveRootAppEvent(ev);
					scheduleActivityProfileFetch(ev.pubkey);
					const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
					if (parentTag?.[1]) {
						const parent = val?.find((c) => c.id === parentTag[1]);
						if (parent?.pubkey) scheduleActivityProfileFetch(parent.pubkey);
					}
				}
			},
			error: (e) => {
				console.error('[StudioActivity] liveQuery error', e);
				activityError = 'Failed to load activity.';
			}
		});
		return () => sub.unsubscribe();
	});

	async function resolveRootAppEvent(commentEvent) {
		if (!commentEvent?.tags) return;
		const aRoot = commentEvent.tags.find((t) => t[0] === 'A' && t[1])?.[1];
		if (!aRoot || rootAppEvents.get(aRoot)) return;

		const parts = aRoot.split(':');
		if (parts.length < 3 || parts[0] !== String(EVENT_KINDS.APP)) return;
		const pk = parts[1];
		const dTag = parts.slice(2).join(':');

		const { DEFAULT_CATALOG_RELAYS, PLATFORM_FILTER } = await import('$lib/config.js');
		let appEv = await queryEvent({
			kinds: [EVENT_KINDS.APP],
			authors: [pk],
			'#d': [dTag],
			...PLATFORM_FILTER,
			limit: 1
		}).catch(() => null);

		if (appEv) {
			rootAppEvents = new Map(rootAppEvents).set(aRoot, appEv);
			return;
		}

		try {
			const { fetchFromRelays } = await import('$lib/nostr/service.js');
			const arr = await fetchFromRelays(
				DEFAULT_CATALOG_RELAYS,
				{
					kinds: [EVENT_KINDS.APP],
					authors: [pk],
					'#d': [dTag],
					...PLATFORM_FILTER,
					limit: 1
				},
				{ timeout: 5000, feature: 'studio-activity' }
			);
			if (arr?.[0]) {
				await putEvents([arr[0]]).catch(() => {});
				rootAppEvents = new Map(rootAppEvents).set(aRoot, arr[0]);
			}
		} catch {
			/* non-fatal */
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

	$effect(() => {
		if (!browser || !activityReady || DUMMY_MODE || !seedKey) return;
		if (seedKey === lastActivitySeedKey) return;
		lastActivitySeedKey = seedKey;
		let cancelled = false;
		activityLoading = true;
		activityError = '';
		(async () => {
			try {
				const evs = await fetchCommentsByRootATags(appAddrs, { timeout: 8000 });
				if (!cancelled && evs?.length) await putEvents(evs).catch(() => {});
			} catch (err) {
				console.error('[StudioActivity] relay seed failed', err);
				if (!cancelled) activityError = 'Failed to sync comments from relays.';
			} finally {
				if (!cancelled) activityLoading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function openAppForComment(aTagValue, commentId = null) {
		if (!aTagValue) return;
		const parts = aTagValue.split(':');
		if (parts.length < 3 || parts[0] !== String(EVENT_KINDS.APP)) return;
		const pk = parts[1];
		const dTag = parts.slice(2).join(':');
		try {
			const naddr = encodeAppNaddr(pk, dTag);
			const base = `/apps/${naddr}`;
			goto(commentId ? `${base}?comment=${encodeURIComponent(commentId)}` : base);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		if (!browser) return;
		activityReady = true;
		return () => {
			lastActivitySeedKey = '';
		};
	});
</script>

{#if DUMMY_MODE}
	<div class="empty-state-wrap">
		<EmptyState message="Nothing here yet." minHeight={280} />
	</div>
{:else if !devPubkey || apps.length === 0}
	<div class="empty-state-wrap">
		<EmptyState message="Comments on your apps will show here once you publish an app." minHeight={280} />
	</div>
{:else if !activityReady || (activityLoading && activityComments.length === 0)}
	<div class="loading-wrap">
		<Spinner size={24} />
		<span>Loading comments…</span>
	</div>
{:else if activityError && activityComments.length === 0}
	<div class="empty-state-wrap">
		<EmptyState message={activityError} minHeight={280} />
	</div>
{:else if activityComments.length === 0}
	<div class="empty-state-wrap">
		<EmptyState message="No comments on your apps yet." minHeight={280} />
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
			{@const aRootTag = commentEv.tags?.find((t) => t[0] === 'A' && t[1])}
			{@const rootATag = aRootTag?.[1] ?? null}
			{@const rootEvent = rootATag ? rootAppEvents.get(rootATag) ?? null : null}
			{@const rootEId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
			{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
			{@const parentId =
				eParentTag?.[1] && eParentTag[1] !== rootEId ? eParentTag[1] : null}
			{@const parentComment = parentId ? activityCommentMap.get(parentId) ?? null : null}
			{@const parentAuthorRaw = parentComment ? activityProfiles.get(parentComment.pubkey) : null}
			{@const parentCommentAuthor =
				parentComment && parentAuthorRaw
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
			{@const appMeta = rootATag ? appByAddr.get(rootATag) : null}
			{@const appBadge = (() => {
				if (appMeta) {
					return {
						iconUrl: appMeta.icon || null,
						name: appMeta.name,
						identifier: appMeta.id
					};
				}
				if (rootEvent?.kind === EVENT_KINDS.APP) {
					const p = parseApp(rootEvent);
					return {
						iconUrl: p.icon ?? null,
						name: p.name,
						identifier: p.dTag
					};
				}
				return null;
			})()}
			<div
				class="activity-item"
				role="button"
				tabindex="0"
				onclick={() => openAppForComment(rootATag, isDeeperReply ? commentEv.id : null)}
				onkeydown={(e) =>
					e.key === 'Enter' && openAppForComment(rootATag, isDeeperReply ? commentEv.id : null)}
			>
				<CommentCard
					event={commentEv}
					{authorProfile}
					{rootEvent}
					{parentComment}
					{parentCommentAuthor}
					{appBadge}
					profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
					resolveMentionLabel={(pk) =>
						activityProfiles.get(pk)?.displayName ??
						activityProfiles.get(pk)?.name ??
						pk?.slice(0, 8) ??
						''}
				/>
			</div>
		{/each}
	</div>
{/if}

<style>
	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		min-height: 280px;
		width: 100%;
	}

	/* Tight padding for EmptyState (match SocialTabs-style ~16–20px) */
	.empty-state-wrap :global(.empty-state-text) {
		padding: 16px 20px !important;
	}

	.loading-wrap {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		color: hsl(var(--white66));
		font-size: 0.9375rem;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		margin: 0 -20px;
	}

	.activity-item {
		padding: 12px 20px;
		border-bottom: 1px solid hsl(var(--white11));
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}
</style>
