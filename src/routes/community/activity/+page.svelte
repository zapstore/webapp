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
		liveQuery,
		parseComment,
		publishComment
	} from '$lib/nostr';
	import {
		resolveForumDiscussionRootCommentId,
		collectCommentSubtree
	} from '$lib/nostr/thread-discussion.js';
	import { parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS, ZAPSTORE_COMMUNITY_NPUB, FORUM_RELAY } from '$lib/config';
	import { goto } from '$app/navigation';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import RootComment from '$lib/components/social/RootComment.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';

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

	/** Navigate to the forum post page (root label row click only). */
	function openRootPost(rootEvent) {
		if (!rootEvent?.id) return;
		try {
			const nevent = nip19.neventEncode({ id: rootEvent.id });
			goto(`/community/forum/${nevent}`);
		} catch {
			/* ignore */
		}
	}

	// ── In-feed thread modal (header = discussion root under the forum post) ───
	let threadModalRootId = $state(/** @type {string | null} */ (null));
	let threadModalRootEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let initialReplyTargetForModal = $state(/** @type {any} */ (null));
	let threadLoadGen = 0;
	let openReplyOnMount = $state(false);
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));

	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

	function enrichReplyTargetForModal(commentEv) {
		const c = parseComment(commentEv);
		const p = activityProfiles.get(commentEv.pubkey);
		let npub = '';
		try {
			npub = nip19.npubEncode(commentEv.pubkey);
		} catch {
			/* ignore */
		}
		return {
			id: commentEv.id,
			pubkey: commentEv.pubkey,
			displayName:
				p?.displayName ??
				p?.name ??
				(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : commentEv.pubkey.slice(0, 8)),
			avatarUrl: p?.picture ?? null,
			content: commentEv.content ?? '',
			createdAt: commentEv.created_at,
			emojiTags: c.emojiTags,
			mediaUrls: c.mediaUrls ?? []
		};
	}

	function openThread(commentEv, withReply = false) {
		const postId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		if (!postId) return;

		threadLoadGen++;
		const gen = threadLoadGen;
		openReplyOnMount = withReply;
		selectedThreadComments = [];
		threadModalRootId = null;
		threadModalRootEvent = null;
		initialReplyTargetForModal = null;

		const cmap = new Map();
		for (const c of activityComments) cmap.set(c.id.toLowerCase(), c);

		(async () => {
			const rootId = await resolveForumDiscussionRootCommentId(
				commentEv,
				postId,
				cmap,
				(id) => queryEvent({ ids: [id] }).catch(() => null)
			);
			if (gen !== threadLoadGen) return;

			let rootEv = cmap.get(rootId.toLowerCase());
			if (!rootEv) {
				rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
				if (rootEv) cmap.set(rootEv.id.toLowerCase(), rootEv);
			}
			if (!rootEv || gen !== threadLoadGen) return;

			threadModalRootId = rootId;
			threadModalRootEvent = rootEv;
			initialReplyTargetForModal =
				withReply && commentEv.id.toLowerCase() !== rootId.toLowerCase()
					? enrichReplyTargetForModal(commentEv)
					: null;

			await loadActivityThread(postId, rootId, gen, rootEv);
		})();
	}

	async function loadActivityThread(postId, rootId, gen, rootEv) {
		try {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [postId], limit: 300 })
			]);
			const merged = [];
			const seen = new Set();
			for (const e of [...lower, ...upper]) {
				if (!seen.has(e.id)) {
					seen.add(e.id);
					merged.push(e);
				}
			}
			if (!merged.some((e) => e.id === rootEv.id)) merged.push(rootEv);

			const subtree = collectCommentSubtree(rootId, merged);
			let byId = new Map(subtree.map((e) => [e.id, e]));

			fetchFromRelays(
				RELAYS,
				{ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 },
				{ timeout: 5000 }
			)
				.then(async (evs) => {
					const pool = [...merged];
					for (const e of evs) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, pool);
					const m2 = new Map(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen) return;
					await enrichAndSetActivityThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetActivityThread(rootId, gen, byId);
		} catch (err) {
			console.error('[Activity] thread load failed', err);
		}
	}

	async function enrichAndSetActivityThread(rootId, gen, byIdMap) {
		const evs = Array.from(byIdMap.values()).sort((a, b) => a.created_at - b.created_at);
		const pks = [...new Set(evs.map((e) => e.pubkey))];
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new Map());
		const profileMap = new Map();
		for (const [pk, ev] of profileResults) {
			if (ev?.content) {
				try {
					const j = JSON.parse(ev.content);
					profileMap.set(pk, { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture });
				} catch { /* ignore */ }
			}
		}
		if (gen !== threadLoadGen || threadModalRootId !== rootId) return;
		selectedThreadComments = evs.map((e) => {
			const c = parseComment(e);
			const p = profileMap.get(e.pubkey) ?? activityProfiles.get(e.pubkey);
			let npub = '';
			try { npub = nip19.npubEncode(e.pubkey); } catch { /* ignore */ }
			return {
				...c,
				displayName: p?.displayName ?? p?.name ?? (npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
				avatarUrl: p?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			};
		});
	}

	async function handleActivityThreadReply(rootPostId, rootPostPubkey, e) {
		if (!rootPostId || !e?.text?.trim()) return;
		const signed = await publishComment(
			e.text,
			{ contentType: 'forum', pubkey: rootPostPubkey, id: rootPostId, kind: EVENT_KINDS.FORUM_POST },
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? null,
			e.parentKind ?? EVENT_KINDS.COMMENT,
			e.mentions ?? [],
			RELAYS,
			e.mediaUrls ?? []
		);
		const parsed = parseComment(signed);
		let npub = '';
		try { npub = nip19.npubEncode(signed.pubkey); } catch { /* ignore */ }
		const profile = activityProfiles.get(signed.pubkey);
		selectedThreadComments = [
			...selectedThreadComments,
			{
				...parsed,
				displayName: profile?.displayName ?? profile?.name ?? (npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
				avatarUrl: profile?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			}
		];
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

<div class="panel-content activity-panel" class:scroll-locked={!!threadModalRootId}>
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
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="activity-item"
				role="button"
				tabindex="0"
				onclick={() => openThread(commentEv)}
				onkeydown={(e) => e.key === 'Enter' && openThread(commentEv)}
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
					onRootClick={rootEvent ? () => openRootPost(rootEvent) : null}
					feedActions={{
						onReply: () => openThread(commentEv, true),
						onZap: () => openThread(commentEv),
						onOptions: () => openThread(commentEv)
					}}
				/>
			</div>
		{/each}
		</div>
	{/if}
</div>

{#if threadModalRootId && threadModalRootEvent}
	{@const _rootEv = threadModalRootEvent}
	{#key threadModalRootId}
		{@const _eRoot = _rootEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
		{@const _rootPost = _eRoot ? activityRootEvents.get(_eRoot) ?? null : null}
		{@const _authorRaw = activityProfiles.get(_rootEv.pubkey)}
		{@const _authorNpub = (() => { try { return nip19.npubEncode(_rootEv.pubkey); } catch { return ''; } })()}
		{@const _postTitle = _rootPost?.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? 'Forum Post'}
		{@const _postNevent = (() => { try { return _rootPost ? nip19.neventEncode({ id: _rootPost.id }) : null; } catch { return null; } })()}
		{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			openReplyOnMount={openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			id={_rootEv.id}
			content={_rootEv.content ?? ''}
			version={_evVersion}
			emojiTags={(_rootEv.tags ?? []).filter((t) => t[0] === 'emoji' && t[1] && t[2]).map((t) => ({ shortcode: t[1], url: t[2] }))}
			mediaUrls={(_rootEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
			pictureUrl={_authorRaw?.picture ?? null}
			name={_authorRaw?.displayName ?? _authorRaw?.name ?? ''}
			pubkey={_rootEv.pubkey}
			timestamp={_rootEv.created_at}
			profileUrl={_authorNpub ? `/profile/${_authorNpub}` : ''}
			threadComments={selectedThreadComments}
			threadZaps={[]}
			rootContext={_postNevent
				? { label: _postTitle, iconUrl: null, href: `/community/forum/${_postNevent}` }
				: null}
			onModalClose={() => {
				threadLoadGen++;
				threadModalRootId = null;
				threadModalRootEvent = null;
				initialReplyTargetForModal = null;
				selectedThreadComments = [];
			}}
			{signEvent}
			{searchProfiles}
			{searchEmojis}
			onReplySubmit={_rootPost ? (e) => handleActivityThreadReply(_rootPost.id, _rootPost.pubkey, e) : undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

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

	.activity-panel.scroll-locked {
		overflow-y: hidden;
	}

	.loading-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 24px;
		min-height: 280px;
	}

	.loading-wrap span {
		color: hsl(var(--white66));
		font-size: 0.9375rem;
	}

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 12px;
		padding: 16px 16px 0;
		width: 100%;
		box-sizing: border-box;
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
