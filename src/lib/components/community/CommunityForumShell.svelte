<script lang="js">
	// @ts-nocheck
	/**
	 * Forum feed (persists in community layout when switching Activity ↔ Forum).
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
		fetchKind1111ReferencingEventIds,
		fetchZapsByEventIds,
		fetchProfilesBatch,
		putEvents,
		publishToRelays,
		queryEvents,
		liveQuery,
		parseForumPost,
		parseZapReceipt
	} from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import {
		EVENT_KINDS,
		ZAPSTORE_COMMUNITY_NPUB,
		FORUM_RELAY,
		ZAPSTORE_RELAY,
		FORUM_CATEGORIES,
		commentZapRelayReadSince
	} from '$lib/config';
	import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { goto } from '$app/navigation';
	import ForumPostCard from '$lib/components/ForumPostCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
	import ForumSearchModal from '$lib/components/modals/ForumSearchModal.svelte';
	import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import { ChevronDown } from '$lib/components/icons';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';

	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const RELAYS = [FORUM_RELAY];

	let selectedCategory = $state(/** @type {string | null} */ (null));
	/** @type {'latest' | 'most_zapped'} */
	let sortOrder = $state('latest');
	let latestDropdownOpen = $state(false);
	/** @type {HTMLDivElement | null} */
	let latestDropdownWrap = $state(null);
	// Initialize from cache so back navigation from post detail shows list immediately (apps pattern)
	let posts = $state(/** @type {any[]} */ (getCached('forum_posts') ?? []));
	let postsLoading = $state(false);
	let postsError = $state('');
	let feedProfiles = $state(/** @type {Map<string,any>} */ (new Map()));
	/** @type {Map<string, { profiles: any[], count: number }>} */
	let commentersByPostId = $state(new Map());
	/** @type {Map<string, number>} Total sats zapped per forum post ID. */
	let zapsByPostId = $state(/** @type {Map<string,number>} */ (new Map()));
	/** Non-reactive cache for commenter profiles; used by the reactive comment liveQuery. */
	let commentProfileCache = new Map();
	let addPostModalOpen = $state(false);
	let searchModalOpen = $state(false);
	let getStartedModalOpen = $state(false);
	/** Shown when a post was saved locally but relay publish failed (so other browsers won't see it) */
	let publishError = $state('');
	// Defer Dexie/liveQuery until after mount so first paint isn't blocked by DB
	let forumReady = $state(false);
	/** Progressive Dexie/relay cap — grows with Load more / infinite scroll */
	let forumFeedLimit = $state(45);
	const FORUM_FEED_CAP = 320;

	const isSignedIn = $derived(getIsSignedIn());

	const forumQuery = $derived(
		browser && COMMUNITY_PUBKEY && forumReady
			? liveQuery(async () => {
					const evs = await queryEvents({
						kinds: [EVENT_KINDS.FORUM_POST],
						'#h': [COMMUNITY_PUBKEY],
						limit: forumFeedLimit
					});
					return evs
						.map((e) => {
							const p = parseForumPost(e);
							return p ? { ...p, _raw: e } : null;
						})
						.filter(Boolean)
						.sort((a, b) => b.createdAt - a.createdAt);
				})
			: null
	);

	/** Posts filtered by selected category and ordered by sort selection. */
	const filteredPosts = $derived.by(() => {
		const base = selectedCategory
			? posts.filter((p) => p.labels?.includes(selectedCategory))
			: posts;
		if (sortOrder === 'most_zapped') {
			return [...base].sort(
				(a, b) => (zapsByPostId.get(b.id) ?? 0) - (zapsByPostId.get(a.id) ?? 0)
			);
		}
		// 'latest': liveQuery already sorts by createdAt desc
		return base;
	});

	const forumLikelyHasMore = $derived(posts.length >= forumFeedLimit && forumFeedLimit < FORUM_FEED_CAP);

	function loadMoreForum() {
		forumFeedLimit = Math.min(FORUM_FEED_CAP, forumFeedLimit + 45);
	}

	let forumSeedKey = $state('');
	$effect(() => {
		if (!browser) return;
		const path = $page.url.pathname;
		if (path !== '/community/forum' && path !== '/community/forum/') return;
		const seed = $page.data?.seedEvents;
		if (!Array.isArray(seed) || seed.length === 0) return;
		const key = seed.map((e) => e?.id).join(',');
		if (!key || key === forumSeedKey) return;
		forumSeedKey = key;
		void putEvents(seed).catch((err) => console.error('[Forum] seed putEvents failed:', err));
	});

	$effect(() => {
		if (!latestDropdownOpen || !latestDropdownWrap) return;
		function handleClick(e) {
			if (latestDropdownWrap && !latestDropdownWrap.contains(/** @type {Node} */ (e.target))) {
				latestDropdownOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	$effect(() => {
		if (!forumQuery) return;
		const sub = forumQuery.subscribe({
			next: (v) => {
				const list = v ?? [];
				posts = list;
				setCached('forum_posts', list);
			},
			error: (err) => {
				console.error('[Community] liveQuery error:', err);
				postsError = 'Failed to load posts.';
			}
		});
		return () => sub.unsubscribe();
	});

	// ── Reactive comment counts ──────────────────────────────────────────────
	// liveQuery re-fires whenever Dexie changes (e.g. new comment published from Inbox).
	// This keeps comment counts and commenter avatars in sync without a full page reload.
	const commentCountsQuery = $derived(
		browser && posts.length > 0
			? liveQuery(async () => {
					const ids = posts.map((p) => p.id);
					const [lo, hi] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': ids, limit: 1000 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': ids, limit: 1000 })
					]);
					const all = new Map();
					for (const e of [...lo, ...hi]) all.set(e.id, e);
					return Array.from(all.values());
				})
			: null
	);

	$effect(() => {
		if (!commentCountsQuery) return;
		const sub = commentCountsQuery.subscribe({
			next: (commentEvs) => {
				const evs = commentEvs ?? [];
				const byPost = new Map();
				for (const c of evs) {
					const rootE =
						c.tags?.find((t) => t[0] === 'E')?.[1] ??
						c.tags?.find((t) => t[0] === 'e')?.[1];
					if (!rootE) continue;
					if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
					const entry = byPost.get(rootE);
					entry.count += 1;
					const pk = c.pubkey;
					if (!entry.profiles.some((p) => p.pubkey === pk)) {
						const p = commentProfileCache.get(pk);
						entry.profiles.push({
							pubkey: pk,
							displayName: p?.displayName ?? p?.name ?? '',
							avatarUrl: p?.picture ?? ''
						});
					}
				}
				commentersByPostId = byPost;
			}
		});
		return () => sub.unsubscribe();
	});

	// ── Reactive zap totals ─────────────────────────────────────────────────
	// liveQuery over ZAP_RECEIPT events for the current page of posts.
	// Uses parseZapReceipt (bolt11 regex) to extract amountSats — the same parser
	// used everywhere else in the codebase. Re-fires when Dexie changes.
	const zapTotalsQuery = $derived(
		browser && posts.length > 0
			? liveQuery(async () => {
					const ids = posts.map((p) => p.id);
					// Zap receipts use lowercase 'e' tag; query both cases for safety
					const [lo, hi] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': ids, limit: 2000 }),
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': ids, limit: 2000 })
					]);
					// Deduplicate by event ID
					const byId = new Map();
					for (const e of [...lo, ...hi]) if (e?.id) byId.set(e.id, e);
					// Sum sats per post ID using bolt11 parsing
					const idsSet = new Set(ids.map((id) => id.toLowerCase()));
					const totals = new Map();
					for (const e of byId.values()) {
						const { amountSats, zappedEventId } = parseZapReceipt(e);
						if (!amountSats || amountSats <= 0 || !zappedEventId) continue;
						if (!idsSet.has(zappedEventId)) continue;
						totals.set(zappedEventId, (totals.get(zappedEventId) ?? 0) + amountSats);
					}
					return totals;
				})
			: null
	);

	$effect(() => {
		if (!zapTotalsQuery) return;
		const sub = zapTotalsQuery.subscribe({
			next: (totals) => {
				zapsByPostId = totals ?? new Map();
			}
		});
		return () => sub.unsubscribe();
	});

	// Best-effort relay fetch: pull zap receipts for the current post list so the liveQuery
	// above has fresh data even on first load. putEvents (called inside fetchZapsByEventIds)
	// writes to Dexie, which triggers the liveQuery automatically.
	$effect(() => {
		if (!browser || posts.length === 0) return;
		const ids = posts.map((p) => p.id);
		fetchZapsByEventIds(ids, { timeout: 5000, limit: 2000 }).catch(() => {});
	});

	async function syncForumFromRelay() {
		if (!COMMUNITY_PUBKEY || !browser) return;
		postsLoading = true;
		postsError = '';
		try {
			await fetchFromRelays(
				RELAYS,
				{ kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: forumFeedLimit },
				{ timeout: 7000 }
			);
		} catch (err) {
			console.error('[Community/Forum] relay sync failed', err);
			postsError = 'Failed to sync. Check your connection.';
		} finally {
			postsLoading = false;
		}
	}

	$effect(() => {
		if (!browser || posts.length === 0) return;
		const pks = [...new Set(posts.map((p) => p.pubkey))];
		const postIds = posts.map((p) => p.id);
		let cancelled = false;

		(async () => {
			const pEvs = await fetchProfilesBatch(pks, { timeout: 4000 });
			if (cancelled) return;
			const m = new Map();
			// fetchProfilesBatch returns Map<pubkey, event>
			for (const [pk, event] of pEvs) {
				try {
					m.set(pk, { ...parseProfile(event), content: event.content });
				} catch {
					/* skip */
				}
			}
			// Fetch missing profiles from forum relay (authors may only be there)
			const missing = pks.filter((pk) => !m.has(pk));
			if (missing.length > 0) {
				try {
					const fromForum = await fetchFromRelays(
						RELAYS,
						{ kinds: [0], authors: missing, limit: missing.length * 2 },
						{ timeout: 3000 }
					);
					for (const event of fromForum) {
						const pk = event.pubkey?.toLowerCase();
						if (pk && !m.has(pk)) {
							try {
								m.set(pk, { ...parseProfile(event), content: event.content });
							} catch {
								/* skip */
							}
						}
					}
				} catch {
					/* keep partial */
				}
			}
			feedProfiles = m;

			const [evsE, evsEUpper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': postIds, limit: 500 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': postIds, limit: 500 })
			]);
			if (cancelled) return;
			const byId = new Map();
			for (const e of [...evsE, ...evsEUpper]) {
				if (!byId.has(e.id)) byId.set(e.id, e);
			}
			const commentEvs = Array.from(byId.values());

			const byPost = new Map();
			for (const c of commentEvs) {
				const rootE = c.tags?.find((t) => t[0] === 'E')?.[1] ?? c.tags?.find((t) => t[0] === 'e')?.[1];
				if (!rootE) continue;
				if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
				const entry = byPost.get(rootE);
				entry.count += 1;
				const pk = c.pubkey;
				if (!entry.profiles.some((p) => p.pubkey === pk)) {
					entry.profiles.push({ pubkey: pk, displayName: '', avatarUrl: '' });
				}
			}

			const allCommenterPks = [...new Set(commentEvs.map((e) => e.pubkey))];
			const commenterProfiles =
				allCommenterPks.length > 0 ? await fetchProfilesBatch(allCommenterPks, { timeout: 3000 }) : [];
			if (cancelled) return;
			const profileMap = new Map();
			for (const [pk, event] of commenterProfiles) {
				try {
					profileMap.set(pk, parseProfile(event));
				} catch {
					/* skip */
				}
			}
			// Populate cache so the reactive liveQuery can enrich profiles on next tick.
			for (const [pk, p] of profileMap.entries()) commentProfileCache.set(pk, p);
			for (const entry of byPost.values()) {
				entry.profiles = entry.profiles.map((r) => {
					const p = profileMap.get(r.pubkey);
					return {
						pubkey: r.pubkey,
						displayName: p?.displayName ?? p?.name ?? '',
						avatarUrl: p?.picture ?? ''
					};
				});
			}
			commentersByPostId = byPost;

			const rs = commentZapRelayReadSince();
			const allRelay = await fetchKind1111ReferencingEventIds(
				[ZAPSTORE_RELAY],
				postIds,
				{ since: rs, limit: 500, timeout: 6000, feature: 'forum-feed-comment-counts' }
			);
			if (cancelled) return;
			const newEvs = allRelay.filter((e) => !byId.has(e.id));
			if (newEvs.length > 0) {
				for (const c of newEvs) {
					const rootE = c.tags?.find((t) => t[0] === 'E')?.[1] ?? c.tags?.find((t) => t[0] === 'e')?.[1];
					if (!rootE) continue;
					if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
					const entry = byPost.get(rootE);
					entry.count += 1;
					const pk = c.pubkey;
					if (!entry.profiles.some((p) => p.pubkey === pk)) {
						entry.profiles.push({ pubkey: pk, displayName: '', avatarUrl: '' });
					}
				}
				const extraPks = [...new Set(newEvs.map((e) => e.pubkey))].filter((pk) => !profileMap.has(pk));
				const extraProfiles = extraPks.length > 0 ? await fetchProfilesBatch(extraPks, { timeout: 3000 }) : [];
				for (const [pk, event] of extraProfiles) {
					try {
						profileMap.set(pk, parseProfile(event));
					} catch {
						/* skip */
					}
				}
				// Fetch any still-missing from forum relay
				const stillMissing = extraPks.filter((pk) => !profileMap.has(pk));
				if (stillMissing.length > 0) {
					try {
						const fromForum = await fetchFromRelays(
							RELAYS,
							{ kinds: [0], authors: stillMissing, limit: stillMissing.length * 2 },
							{ timeout: 2000 }
						);
						for (const event of fromForum) {
							const pk = event.pubkey?.toLowerCase();
							if (pk && !profileMap.has(pk)) {
								try {
									profileMap.set(pk, parseProfile(event));
								} catch {
									/* skip */
								}
							}
						}
					} catch {
						/* keep partial */
					}
				}
				// Merge new profiles into cache so the reactive liveQuery picks them up.
				for (const [pk, p] of profileMap.entries()) commentProfileCache.set(pk, p);
				for (const entry of byPost.values()) {
					entry.profiles = entry.profiles.map((r) => {
						const p = profileMap.get(r.pubkey);
						return {
							pubkey: r.pubkey,
							displayName: p?.displayName ?? p?.name ?? '',
							avatarUrl: p?.picture ?? ''
						};
					});
				}
				commentersByPostId = byPost;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function openPost(post) {
		const nevent = post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '';
		if (post?.id) {
			setCached(`forum_post:${post.id}`, post);
		}
		if (nevent) goto(`/community/forum/${nevent}`);
	}

	async function handleForumPostSubmit({ title, text, labels = [], emojiTags = [], mediaUrls = [] }) {
		if (!isSignedIn) throw new Error('Sign in to post');
		const emojiTagEntries = (Array.isArray(emojiTags) ? emojiTags : [])
			.filter((e) => e?.shortcode && e?.url)
			.map((e) => ['emoji', e.shortcode, e.url]);
		const mediaTags = (Array.isArray(mediaUrls) ? mediaUrls : [])
			.filter((u) => typeof u === 'string' && u.trim())
			.map((u) => ['media', u.trim()]);
		const ev = await signEvent({
			kind: EVENT_KINDS.FORUM_POST,
			content: text,
			tags: [
				['h', COMMUNITY_PUBKEY],
				['title', title],
				...labels.map((l) => ['t', l]),
				...emojiTagEntries,
				...mediaTags
			],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		const parsed = parseForumPost(ev);
		if (parsed) {
			posts = [{ ...parsed, _raw: ev }, ...posts];
		}
		// Publish to forum relay so other browsers/devices see the post
		publishError = '';
		try {
			await publishToRelays(RELAYS, ev);
			setTimeout(() => syncForumFromRelay(), 1200);
		} catch (err) {
			console.error('[Community] Publish failed:', err);
			const relayLabel = RELAYS[0] ?? 'relay';
			publishError = `Post is saved here but could not reach the relay (${relayLabel}). Other browsers won't see it. Check the console for details or try again.`;
		}
	}

	onMount(() => {
		if (!browser) return;
		forumReady = true;
		if (COMMUNITY_PUBKEY) syncForumFromRelay();
	});
</script>

<div class="forum-page-wrap">
<div class="panel-content">
	<header class="forum-feed-header">
	<div class="forum-categories-wrap">
		<div class="forum-categories-scroll" use:wheelScroll>
			<div class="forum-categories-inner">
				{#each FORUM_CATEGORIES as category}
					<Label
						text={category}
						isSelected={selectedCategory === category}
						isEmphasized={false}
						onTap={() => {
							selectedCategory = selectedCategory === category ? null : category;
						}}
					/>
				{/each}
			</div>
		</div>
		<div class="forum-latest-wrap" bind:this={latestDropdownWrap}>
			<button
				type="button"
				class="forum-all-btn forum-latest-btn"
				onclick={() => { latestDropdownOpen = !latestDropdownOpen; }}
				aria-label="Sort order"
				aria-expanded={latestDropdownOpen}
			>
				<span>{sortOrder === 'most_zapped' ? 'Most Zapped' : 'Latest'}</span>
				<span class="forum-all-btn-icon">
					<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="var(--white66)" />
				</span>
			</button>
			{#if latestDropdownOpen}
				<div class="forum-latest-dropdown" role="menu">
					<button
						type="button"
						class="forum-latest-dropdown-item"
						class:is-active={sortOrder === 'latest'}
						role="menuitem"
						onclick={() => { sortOrder = 'latest'; latestDropdownOpen = false; }}
					>
						Latest
					</button>
					<button
						type="button"
						class="forum-latest-dropdown-item"
						class:is-active={sortOrder === 'most_zapped'}
						role="menuitem"
						onclick={() => { sortOrder = 'most_zapped'; latestDropdownOpen = false; }}
					>
						Most Zapped
					</button>
				</div>
			{/if}
		</div>
	</div>
	</header>
	{#if publishError}
		<div class="forum-publish-error" role="alert">
			{publishError}
			<button type="button" class="forum-publish-error-dismiss" onclick={() => (publishError = '')} aria-label="Dismiss">×</button>
		</div>
	{/if}
	<div class="forum-list-viewport">
	<div class="forum-list">
		{#if (!forumReady || postsLoading) && posts.length === 0}
			<div class="loading-wrap">
				<Spinner size={24} />
				<span>Loading posts…</span>
			</div>
		{:else if postsError}
			<div class="empty-state-wrap">
				<EmptyState message={postsError} minHeight={400} />
				<button type="button" class="btn-secondary-large" onclick={syncForumFromRelay}>Retry</button>
			</div>
		{:else if filteredPosts.length === 0}
			<div class="empty-state-wrap">
				<EmptyState
					message={selectedCategory ? `No posts in ${selectedCategory}` : 'No Forum Posts yet'}
					minHeight={280}
				/>
			</div>
		{:else}
			{#each filteredPosts as post (post.id)}
				{@const authorProfile = feedProfiles.get(post.pubkey)}
				{@const postCommenters = commentersByPostId.get(post.id)}
				<ForumPostCard
					author={{
						name: authorProfile?.displayName ?? authorProfile?.name,
						picture: authorProfile?.picture,
						npub: (() => {
							try {
								return nip19.npubEncode(post.pubkey);
							} catch {
								return '';
							}
						})()
					}}
					title={post.title}
					content={post.content}
					timestamp={post.createdAt}
					labels={post.labels ?? []}
					mediaUrls={post.mediaUrls ?? []}
					emojiTags={post.emojiTags ?? []}
					commenters={postCommenters?.profiles ?? []}
					commentCount={postCommenters?.count ?? 0}
					totalZapAmount={zapsByPostId.get(post.id?.toLowerCase?.() ?? post.id) ?? 0}
					onClick={() => openPost(post)}
				/>
			{/each}
			{#if forumLikelyHasMore}
				<div class="forum-load-more">
					<button type="button" class="forum-load-more-btn" onclick={loadMoreForum}>
						Load more posts
					</button>
				</div>
			{/if}
		{/if}
	</div>
	</div>
</div>

<CommunityBottomBar
	showFeedBar={true}
	selectedSection="forum"
	modalOpen={addPostModalOpen || searchModalOpen}
	{isSignedIn}
	onAdd={() => { addPostModalOpen = true; }}
	onSearch={() => { searchModalOpen = true; }}
	onGetStarted={() => { getStartedModalOpen = true; }}
/>

<ForumPostModal
	bind:isOpen={addPostModalOpen}
	communityName="Zapstore"
	{getCurrentPubkey}
	{signEvent}
	onsubmit={handleForumPostSubmit}
	onclose={() => {
		addPostModalOpen = false;
	}}
/>

<ForumSearchModal
	bind:isOpen={searchModalOpen}
	communityPubkeyHex={COMMUNITY_PUBKEY}
	onclose={() => {
		searchModalOpen = false;
	}}
/>

<GetStartedModal bind:open={getStartedModalOpen} onconnected={() => { getStartedModalOpen = false; }} />
</div>

<style>
	.forum-page-wrap {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: var(--black);
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.forum-feed-header {
		flex-shrink: 0;
		position: relative;
		z-index: 20;
		overflow: visible;
		background: var(--black);
	}

	.forum-categories-wrap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0;
		border-bottom: 1px solid var(--white16);
		/* Let .forum-latest-dropdown extend below the row; horizontal overflow stays in .forum-categories-scroll */
		overflow: visible;
		position: relative;
		isolation: isolate;
	}

	.forum-categories-scroll {
		position: relative;
		z-index: 0;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-x: contain;
		overscroll-behavior-y: none;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x;
		mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
	}

	.forum-categories-scroll::-webkit-scrollbar {
		display: none;
	}

	.forum-categories-inner {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
		padding: 12px 0 12px 16px;
		align-items: center;
	}

	.forum-all-btn {
		position: relative;
		z-index: 1;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px 0 16px;
		font-size: 14px;
		font-weight: 500;
		color: var(--white66);
		background: var(--white16);
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.forum-all-btn .forum-all-btn-icon {
		display: flex;
		align-items: center;
		padding-top: 2px;
	}

	.forum-all-btn:hover:not(.forum-latest-btn) {
		background: var(--white33);
		color: var(--white66);
	}

	/* Strong gray look for Latest only — always on, independent of category chips */
	.forum-all-btn.forum-latest-btn {
		background: var(--gray66);
		color: var(--white);
	}

	.forum-all-btn.forum-latest-btn:hover {
		filter: brightness(1.08);
	}

	.forum-latest-wrap {
		position: relative;
		z-index: 2;
		flex-shrink: 0;
		margin-right: 16px;
		pointer-events: auto;
	}

	.forum-list-viewport {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 100px;
	}

	.forum-latest-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 200px;
		background: var(--gray);
		border: 0.33px solid var(--white8);
		border-radius: 12px;
		box-shadow: 0 8px 24px var(--black);
		padding: 6px 0;
		z-index: 50;
	}

	.forum-latest-dropdown-item {
		display: block;
		width: 100%;
		padding: 8px 16px;
		border: none;
		background: none;
		color: var(--white);
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.forum-latest-dropdown-item:hover {
		background: var(--white8);
	}

	.forum-latest-dropdown-item.is-active {
		color: var(--white);
		font-weight: 600;
	}

	.forum-publish-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		margin: 0 12px 12px;
		background: color-mix(in srgb, var(--rougeColor) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--rougeColor) 40%, transparent);
		border-radius: 10px;
		font-size: 0.875rem;
		color: var(--rougeColor);
	}

	.forum-publish-error-dismiss {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0.85;
	}

	.forum-publish-error-dismiss:hover {
		opacity: 1;
	}

	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}

	.forum-load-more {
		display: flex;
		justify-content: center;
		padding: 20px 16px 28px;
	}

	.forum-load-more-btn {
		padding: 10px 20px;
		font-size: 0.9375rem;
		font-weight: 500;
		border-radius: 12px;
		border: 1px solid var(--white22);
		background: var(--white6);
		color: var(--white);
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.forum-load-more-btn:hover {
		background: var(--white11);
		border-color: var(--white33);
	}

	.loading-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 60px 24px;
		color: var(--white33);
		font-size: 0.9375rem;
	}

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 16px;
		padding: 16px 16px 0;
		width: 100%;
		box-sizing: border-box;
	}

	.empty-state-wrap .btn-secondary-large {
		align-self: center;
	}

	.btn-secondary-large {
		padding: 10px 20px;
		font-size: 0.9375rem;
		font-weight: 500;
		border-radius: 12px;
		border: 1px solid var(--white33);
		background: transparent;
		color: var(--white);
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn-secondary-large:hover {
		background: var(--white8);
		border-color: var(--white66);
	}
</style>
