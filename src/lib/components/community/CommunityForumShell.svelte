<script lang="js">
	// @ts-nocheck
	/**
	 * Forum feed (persists in community layout when switching Activity ↔ Forum).
	 */
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import {
	fetchFromRelays,
	fetchKind1111ReferencingEventIds,
	fetchZapsByEventIds,
	hydrateFilters,
	putEvents,
	publishToRelays,
	buildEventPublishRelayUrls,
	queryEvents,
	queryProfilesForPubkeys,
	liveQuery,
	parseZapReceipt
} from '$lib/purpleweb';
import { parseForumPost } from '$lib/nostr';
import {
	EVENT_KINDS,
	ZAPSTORE_COMMUNITY_NPUB,
	FORUM_RELAY,
	ZAPSTORE_RELAY,
	FORUM_CATEGORIES,
	PROFILE_FETCH_RELAYS,
	commentZapRelayReadSince
} from '$lib/config';
import { relayLoading } from '$lib/stores/relay-loading.svelte.js';
import { isOnline } from '$lib/stores/online.svelte.js';
import RelayLoadingBar from '$lib/components/common/RelayLoadingBar.svelte';
	import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { goto } from '$app/navigation';
	import ForumPostCard from '$lib/components/ForumPostCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
	import ForumSearchModal from '$lib/components/modals/ForumSearchModal.svelte';
	import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
	import ForumFeedSkeleton from '$lib/components/community/ForumFeedSkeleton.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import { ChevronDown } from '$lib/components/icons';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';

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
	/* eslint-disable svelte/no-unnecessary-state-wrap -- $state tracks wholesale SvelteMap replacements */
	let feedProfiles = $state(/** @type {Map<string,any>} */ (new SvelteMap()));
	/** @type {Map<string, { profiles: any[], count: number }>} */
	let commentersByPostId = $state(new SvelteMap());
	/** @type {Map<string, number>} Total sats zapped per forum post ID. */
	let zapsByPostId = $state(/** @type {Map<string,number>} */ (new SvelteMap()));
	/* eslint-enable svelte/no-unnecessary-state-wrap */
	/** True after the first commentCountsQuery emission — drives ForumPostCard skeleton state. */
	let commentCountsSettled = $state(false);
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

	/** Scroll container — saved before leaving feed, restored on return. */
	let forumListViewport = $state(/** @type {HTMLDivElement | null} */ (null));
	let savedFeedScrollTop = $state(/** @type {number} */ (getCached('forum_feed_scroll') ?? 0));
	let pendingScrollRestore = $state(false);
	let restoreInFlight = false;

	function isForumFeedPath(pathname) {
		return pathname === '/community/forum' || pathname === '/community/forum/';
	}

	function persistFeedScroll(top) {
		savedFeedScrollTop = top;
		setCached('forum_feed_scroll', top);
	}

	function captureFeedScroll() {
		if (!forumListViewport) return;
		persistFeedScroll(forumListViewport.scrollTop);
	}

	function onFeedScroll() {
		if (!isForumFeedRoute || !forumListViewport) return;
		persistFeedScroll(forumListViewport.scrollTop);
	}

	async function restoreFeedScroll() {
		if (restoreInFlight) return;
		const top = savedFeedScrollTop || getCached('forum_feed_scroll') || 0;
		if (top <= 0 || !forumListViewport || !isForumFeedRoute) {
			pendingScrollRestore = false;
			return;
		}
		restoreInFlight = true;
		try {
			for (let i = 0; i < 12; i++) {
				await tick();
				await new Promise((r) => requestAnimationFrame(r));
				if (!forumListViewport || !isForumFeedRoute) return;
				forumListViewport.scrollTop = top;
				if (Math.abs(forumListViewport.scrollTop - top) <= 3) {
					pendingScrollRestore = false;
					return;
				}
			}
		} finally {
			restoreInFlight = false;
			pendingScrollRestore = false;
		}
	}

	beforeNavigate(({ from }) => {
		if (!browser || !forumListViewport || !from) return;
		if (isForumFeedPath(from.url.pathname)) captureFeedScroll();
	});

	afterNavigate(({ to, from }) => {
		if (!browser || !to || !from) return;
		if (isForumFeedPath(to.url.pathname) && !isForumFeedPath(from.url.pathname)) {
			pendingScrollRestore = true;
			void restoreFeedScroll();
		}
	});

	const isSignedIn = $derived(getIsSignedIn());

	/** Forum list only — post detail is a separate route; avoid relay work while user is on Activity. */
	const isForumFeedRoute = $derived(isForumFeedPath($page.url.pathname));

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
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': ids, limit: 300 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': ids, limit: 300 })
					]);
					const all = new SvelteMap();
					for (const e of [...lo, ...hi]) all.set(e.id, e);
					const commentEvs = Array.from(all.values());
					const pks = [
						...new SvelteSet([
							...posts.map((p) => String(p.pubkey).toLowerCase()),
							...commentEvs.map((c) => String(c.pubkey).toLowerCase())
						])
					];
					const profileData = await queryProfilesForPubkeys(pks);
					return { commentEvs, ...profileData };
				})
			: null
	);

	$effect(() => {
		if (!commentCountsQuery) return;
		const hydrated = Object.create(null);
		const sub = commentCountsQuery.subscribe({
			next: ({ commentEvs, profiles, missingProfilePubkeys }) => {
				commentCountsSettled = true;
				const evs = commentEvs ?? [];
				const byPost = new SvelteMap();
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
						const p = profiles?.[String(pk).toLowerCase()] ?? profiles?.[pk];
						entry.profiles.push({
							pubkey: pk,
							displayName: p?.displayName ?? p?.name ?? '',
							avatarUrl: p?.picture ?? ''
						});
					}
				}
				commentersByPostId = byPost;

				const authorMap = new SvelteMap();
				for (const post of posts) {
					const pk = String(post.pubkey).toLowerCase();
					const p = profiles?.[pk];
					if (p) authorMap.set(post.pubkey, p);
				}
				feedProfiles = authorMap;

				if (!isOnline()) return;
				const missing = (missingProfilePubkeys ?? []).filter((pk) => !hydrated[pk]);
				if (missing.length === 0) return;
				for (const pk of missing) hydrated[pk] = true;
				hydrateFilters(
					RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 3000, feature: 'forum-profiles' }
				).catch(() => {});
				hydrateFilters(
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 4000, feature: 'forum-profiles-catalog' }
				).catch(() => {});
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
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': ids, limit: 400 }),
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': ids, limit: 400 })
					]);
					// Deduplicate by event ID
					const byId = new SvelteMap();
					for (const e of [...lo, ...hi]) if (e?.id) byId.set(e.id, e);
					// Sum sats per post ID using bolt11 parsing
					const idsSet = new SvelteSet(ids.map((id) => id.toLowerCase()));
					const totals = new SvelteMap();
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
				zapsByPostId = totals ?? new SvelteMap();
			}
		});
		return () => sub.unsubscribe();
	});

	// Best-effort relay fetch: pull zap receipts for the current post list so the liveQuery
	// above has fresh data even on first load. putEvents (called inside fetchZapsByEventIds)
	// writes to Dexie, which triggers the liveQuery automatically.
	$effect(() => {
		if (!browser || posts.length === 0 || !isForumFeedRoute) return;
		const ids = posts.map((p) => p.id);
		fetchZapsByEventIds(ids, { timeout: 5000, limit: 2000 }).catch(() => {});
	});

	/** Retry scroll restore after feed becomes visible and card layout settles. */
	$effect(() => {
		if (!pendingScrollRestore || !isForumFeedRoute || !forumListViewport) return;
		void filteredPosts.length;
		void commentCountsSettled;
		void restoreFeedScroll();
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
		if (!browser || posts.length === 0 || !isForumFeedRoute) return;
		const anyPostHasDexieData = posts.some((p) => commentersByPostId.has(p.id));
		if (!anyPostHasDexieData) commentCountsSettled = false;
		const postIds = posts.map((p) => p.id);
		let cancelled = false;

		(async () => {
			try {
				relayLoading.forum = true;
				const rs = commentZapRelayReadSince();
				await fetchKind1111ReferencingEventIds(
					[ZAPSTORE_RELAY],
					postIds,
					{ since: rs, limit: 500, timeout: 6000, feature: 'forum-feed-comment-counts' }
				);
			} catch {
				/* non-fatal */
			} finally {
				if (!cancelled) {
					commentCountsSettled = true;
					relayLoading.forum = false;
				}
			}
		})();

		return () => {
			cancelled = true;
			relayLoading.forum = false;
		};
	});

	function openPost(post) {
		captureFeedScroll();
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
	// Primary relay (awaited) — spinner clears here; mirrors comment publish behaviour.
	publishError = '';
	try {
		await publishToRelays(RELAYS, ev);
		setTimeout(() => syncForumFromRelay(), 1200);
	} catch (err) {
		console.error('[Community] Publish failed:', err);
		const relayLabel = RELAYS[0] ?? 'relay';
		publishError = `Post is saved here but could not reach the relay (${relayLabel}). Other browsers won't see it. Check the console for details or try again.`;
	}
	// Secondary relays (fire-and-forget) — social relays + signer's NIP-65 write relays (outbox).
	// Same best-effort pattern used for comments; failures are silent.
	void buildEventPublishRelayUrls(ev.pubkey, null).then((allUrls) => {
		const primarySet = new SvelteSet(RELAYS);
		const secondary = allUrls.filter((u) => !primarySet.has(u));
		if (secondary.length > 0) {
			void publishToRelays(secondary, ev).catch(() => {});
		}
	}).catch(() => {});
	}

	onMount(() => {
		if (!browser) return;
		forumReady = true;
		if (!COMMUNITY_PUBKEY) return;
		const p = window.location.pathname;
		if (p === '/community/forum' || p === '/community/forum/') void syncForumFromRelay();
	});
</script>

<div class="forum-page-wrap">
<div class="panel-content">
	<header class="forum-feed-header">
	<div class="forum-categories-wrap">
		<div class="forum-categories-scroll" data-chrome-scroll use:wheelScroll>
			<div class="forum-categories-inner">
				{#each FORUM_CATEGORIES as category (category)}
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
				<DropdownMenu class="forum-sort-dropdown">
					<button
						type="button"
						class="dropdown-item"
						class:dropdown-item--active={sortOrder === 'latest'}
						role="menuitem"
						onclick={() => { sortOrder = 'latest'; latestDropdownOpen = false; }}
					>
						Latest
					</button>
					<button
						type="button"
						class="dropdown-item"
						class:dropdown-item--active={sortOrder === 'most_zapped'}
						role="menuitem"
						onclick={() => { sortOrder = 'most_zapped'; latestDropdownOpen = false; }}
					>
						Most Zapped
					</button>
				</DropdownMenu>
			{/if}
		</div>
	</div>
	</header>
	<RelayLoadingBar loading={relayLoading.forum && !commentCountsSettled} />
	{#if publishError}
		<div class="forum-publish-error" role="alert">
			{publishError}
			<button type="button" class="forum-publish-error-dismiss" onclick={() => (publishError = '')} aria-label="Dismiss">×</button>
		</div>
	{/if}
	<div
		class="forum-list-viewport"
		data-main-scroll
		bind:this={forumListViewport}
		onscroll={onFeedScroll}
	>
	<div class="forum-list">
		{#if (!forumReady || postsLoading) && posts.length === 0}
			<ForumFeedSkeleton rows={6} />
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
					commentersLoading={!commentCountsSettled}
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
		border-bottom: 1px solid var(--shell-border);
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

	:global(.forum-sort-dropdown) {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 160px;
		z-index: 50;
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
