<script lang="js">
	// @ts-nocheck
	/**
	 * Community Page — /community
	 *
	 * Matches Studio layout: container mx-auto px-0 sm:px-6 lg:px-8, dashboard with
	 * sidebar (260px) + content. Forum feed uses ForumPostCard + EmptyState, with
	 * CommunityBottomBar at bottom for + Post and Search Forum.
	 *
	 * All posts and comments fetched from ZAPSTORE_COMMUNITY_RELAY (enforced).
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
		fetchProfilesBatch,
		putEvents,
		publishToRelays,
		queryEvents,
		liveQuery,
		parseForumPost
	} from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import {
		EVENT_KINDS,
		ZAPSTORE_COMMUNITY_RELAY,
		ZAPSTORE_COMMUNITY_NPUB,
		FORUM_RELAY_OVERRIDE
	} from '$lib/config';
	import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
	import ForumPostCard from '$lib/components/ForumPostCard.svelte';
	import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
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

	const RELAYS = [FORUM_RELAY_OVERRIDE ?? ZAPSTORE_COMMUNITY_RELAY];

	/** @type {'forum' | 'blog' | 'activity'} */
	let activeSection = $state('forum');
	let sectionMenuOpen = $state(false);

	const SECTIONS = [
		{ id: 'forum', label: 'Forum', icon: '/images/emoji/forum.png' },
		{ id: 'blog', label: 'Blog', icon: '/images/emoji/article.png' },
		{ id: 'activity', label: 'Activity', icon: '/images/emoji/activity.png' }
	];

	const FORUM_CATEGORIES = [
		'General',
		'Dev Support',
		'User Support',
		'Feature Request',
		'Ideas',
		'Bugs',
		'Announcements',
		'News',
		'Showcase',
		'Off-Topic'
	];
	const activeSectionLabel = $derived(
		SECTIONS.find((s) => s.id === activeSection)?.label ?? 'Forum'
	);

	// Forum feed — null = "All" selected
	let selectedCategory = $state(/** @type {string | null} */ (null));
	let posts = $state(/** @type {any[]} */ ([]));
	let postsLoading = $state(false);
	let postsError = $state('');
	let feedProfiles = $state(/** @type {Map<string,any>} */ (new Map()));
	/** @type {Map<string, { profiles: any[], count: number }>} */
	let commentersByPostId = $state(new Map());

	// Detail
	let selectedPost = $state(/** @type {any|null} */ (null));

	// Modals
	let addPostModalOpen = $state(false);

	const isSignedIn = $derived(getIsSignedIn());

	// NIP-01 filter: kind 11 with #h = community hex — relay returns ONLY matching posts (no post-fetch filter)
	const FORUM_FILTER = { kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: 50 };

	// Local-first: liveQuery from Dexie (instant), relay fetch in background writes to Dexie
	const forumQuery = $derived(
		browser && COMMUNITY_PUBKEY
			? liveQuery(async () => {
					const evs = await queryEvents(FORUM_FILTER);
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

	$effect(() => {
		if (!forumQuery) return;
		const sub = forumQuery.subscribe({
			next: (v) => {
				posts = v ?? [];
			},
			error: (err) => {
				console.error('[Community] liveQuery error:', err);
				postsError = 'Failed to load posts.';
			}
		});
		return () => sub.unsubscribe();
	});

	async function syncForumFromRelay() {
		if (!COMMUNITY_PUBKEY || !browser) return;
		postsLoading = true;
		postsError = '';
		try {
			// Request kind 11 with #h directly — relay returns only Zapstore community posts
			await fetchFromRelays(RELAYS, FORUM_FILTER, { timeout: 7000 });
		} catch (err) {
			console.error('[Community/Forum] relay sync failed', err);
			postsError = 'Failed to sync. Check your connection.';
		} finally {
			postsLoading = false;
		}
	}

	// Load profiles and commenters when posts change (local-first: Dexie first, then relay)
	$effect(() => {
		if (!browser || posts.length === 0) return;
		const pks = [...new Set(posts.map((p) => p.pubkey))];
		const postIds = posts.map((p) => p.id);
		let cancelled = false;

		(async () => {
			// Profiles: Dexie-first via fetchProfilesBatch
			const pEvs = await fetchProfilesBatch(pks, { timeout: 4000 });
			if (cancelled) return;
			const m = new Map();
			for (const e of pEvs) {
				try {
					m.set(e.pubkey, { ...parseProfile(e), content: e.content });
				} catch {
					/* skip */
				}
			}
			feedProfiles = m;

			// Comments: Dexie first (#e and #E for root), then relay (all comments allowed on enforcing relay)
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
			for (const e of commenterProfiles) {
				try {
					const p = parseProfile(e);
					profileMap.set(e.pubkey, p);
				} catch {
					/* skip */
				}
			}
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

			// Background: fetch comments from relay → putEvents → Dexie
			const [relayE, relayEUpper] = await Promise.all([
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.COMMENT], '#e': postIds, limit: 500 }, { timeout: 6000 }),
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.COMMENT], '#E': postIds, limit: 500 }, { timeout: 6000 })
			]);
			if (cancelled) return;
			const allRelay = [...relayE, ...relayEUpper];
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
				for (const e of extraProfiles) {
					try {
						const p = parseProfile(e);
						profileMap.set(e.pubkey, p);
					} catch {
						/* skip */
					}
				}
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

	function setSection(s) {
		activeSection = s;
		selectedPost = null;
	}

	function openPost(post) {
		selectedPost = post;
	}

	function clearDetail() {
		selectedPost = null;
	}

	async function handleForumPostSubmit({ title, text, labels = [] }) {
		if (!isSignedIn) throw new Error('Sign in to post');
		const ev = await signEvent({
			kind: EVENT_KINDS.FORUM_POST,
			content: text,
			tags: [['h', COMMUNITY_PUBKEY], ['title', title], ...labels.map((l) => ['t', l])],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		// Optimistic update: show our post immediately (Dexie has it via putEvents)
		const parsed = parseForumPost(ev);
		if (parsed) {
			posts = [{ ...parsed, _raw: ev }, ...posts];
		}
		// Fire-and-forget: publish to relay in background (don't block modal close)
		publishToRelays(RELAYS, ev).catch((err) => console.error('[Community] Publish failed:', err));
		// Refresh from relay after a short delay so relay has time to process
		setTimeout(() => syncForumFromRelay(), 1200);
	}

	function onKeydown(e) {
		if (e.key === 'Escape') {
			if (sectionMenuOpen) {
				sectionMenuOpen = false;
				e.preventDefault();
				return;
			}
			if (addPostModalOpen) {
				addPostModalOpen = false;
				e.preventDefault();
				return;
			}
			if (selectedPost) {
				selectedPost = null;
				clearDetail();
				e.preventDefault();
			}
		}
	}

	onMount(() => {
		if (browser && activeSection === 'forum' && COMMUNITY_PUBKEY) {
			syncForumFromRelay();
		}
	});
</script>

<svelte:head>
	<title>Community — Zapstore</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Section switcher — Studio-style collapsible top box (mobile only) -->
		<div class="section-switcher">
			{#if sectionMenuOpen}
				<div class="section-switcher-panel">
					<button
						type="button"
						class="section-switcher-zone"
						onclick={() => {
							sectionMenuOpen = false;
						}}
					>
						<span class="section-switcher-label">{activeSectionLabel}</span>
						<span class="section-chevron open">
							<ChevronDown
								variant="outline"
								color="hsl(var(--white33))"
								size={14}
								strokeWidth={1.4}
							/>
						</span>
					</button>
					<div class="section-switcher-content">
						{#each SECTIONS as section}
							<button
								type="button"
								class="section-item"
								class:active={activeSection === section.id}
								onclick={() => {
									setSection(section.id);
									sectionMenuOpen = false;
								}}
							>
								{#if section.icon}
									<img src={section.icon} alt="" class="section-item-icon" />
								{/if}
								{section.label}
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<button
					type="button"
					class="section-switcher-zone"
					onclick={() => {
						sectionMenuOpen = true;
					}}
				>
					<span class="section-switcher-label">{activeSectionLabel}</span>
					<span class="section-chevron">
						<ChevronDown
							variant="outline"
							color="hsl(var(--white33))"
							size={14}
							strokeWidth={1.4}
						/>
					</span>
				</button>
			{/if}
		</div>

		<!-- Sidebar — desktop only -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each SECTIONS as section}
					<button
						type="button"
						class="nav-item"
						class:active={activeSection === section.id}
						onclick={() => setSection(section.id)}
					>
						<span class="icon-wrap" class:icon-emoji={!!section.icon}>
							{#if section.icon}
								<img src={section.icon} alt="" class="section-icon" />
							{:else}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
								</svg>
							{/if}
						</span>
						<span class="nav-label">{section.label}</span>
					</button>
				{/each}
			</nav>
		</aside>

		<!-- Content — right-page-viewport scopes modals/bars to this column -->
		<div class="content right-page-viewport">
			{#if activeSection === 'forum'}
				{#if selectedPost}
					<div class="panel-content panel-content-detail">
						<ForumPostDetail
							post={selectedPost}
							relays={RELAYS}
							onBack={() => {
								selectedPost = null;
								clearDetail();
							}}
						/>
					</div>
				{:else}
					<!-- Forum feed — category labels row (with shader mask) + All button + feed + CommunityBottomBar -->
					<div class="panel-content" class:has-bottom-bar={true}>
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
							<button
								type="button"
								class="forum-all-btn"
								class:selected={selectedCategory === null}
								onclick={() => {
									selectedCategory = null;
								}}
								aria-label="All categories"
							>
								<span>All</span>
								<span class="forum-all-btn-icon">
									<ChevronDown
										variant="outline"
										size={14}
										strokeWidth={1.4}
										color="hsl(var(--white33))"
									/>
								</span>
							</button>
						</div>
						<div class="forum-list">
							{#if postsLoading}
								<div class="loading-wrap">
									<Spinner size={24} />
									<span>Loading posts…</span>
								</div>
							{:else if postsError}
								<div class="empty-state-wrap">
									<EmptyState message={postsError} minHeight={400} />
									<button type="button" class="btn-secondary-large" onclick={syncForumFromRelay}
										>Retry</button
									>
								</div>
							{:else if posts.length === 0}
								<div class="empty-state-wrap">
									<EmptyState message="No Forum Posts yet" minHeight={280} />
								</div>
							{:else}
								{#each posts as post (post.id)}
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
										commenters={postCommenters?.profiles ?? []}
										commentCount={postCommenters?.count ?? 0}
										onClick={() => openPost(post)}
									/>
								{/each}
							{/if}
						</div>
					</div>

					{#if !selectedPost}
						<CommunityBottomBar
							showFeedBar={true}
							selectedSection="forum"
							modalOpen={addPostModalOpen}
							onAdd={() => {
								addPostModalOpen = true;
							}}
							onSearch={() => {
								/* TODO */
							}}
						/>
					{/if}
				{/if}
			{:else if activeSection === 'blog'}
				<div class="panel-content">
					<div class="section-placeholder">
						<EmptyState message="Blog content — go to /blog for updates." minHeight={280} />
						<a href="/blog" class="btn-primary-large">Go to Blog →</a>
					</div>
				</div>
			{:else}
				<div class="panel-content">
					<div class="section-placeholder">
						<EmptyState message="Activity feed coming soon." minHeight={280} />
					</div>
				</div>
			{/if}

			<!-- ForumPostModal inside right-page-viewport so overlay scopes to content column -->
			<ForumPostModal
				bind:isOpen={addPostModalOpen}
				communityName="Zapstore"
				{getCurrentPubkey}
				onsubmit={handleForumPostSubmit}
				onclose={() => {
					addPostModalOpen = false;
				}}
			/>
		</div>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		min-height: calc(100dvh - 64px);
		border-left: 1px solid hsl(var(--border));
		border-right: 1px solid hsl(var(--border));
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (max-width: 639px) {
		.dashboard {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.dashboard {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
			flex-direction: column;
		}
	}

	/* Section switcher — Studio-style collapsible top box (mobile only) */
	.section-switcher {
		display: none;
	}

	@media (max-width: 767px) {
		.section-switcher {
			display: block;
			flex-shrink: 0;
		}
	}

	.section-switcher-zone {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		color: hsl(var(--foreground));
		font-size: 14px;
		font-weight: 500;
	}

	.section-switcher-label {
		font-size: 14px;
		font-weight: 500;
	}

	.section-chevron {
		display: flex;
		align-items: center;
		transition: transform 0.2s;
	}

	.section-chevron.open {
		transform: rotate(180deg);
	}

	.section-switcher-panel {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: hsl(var(--background));
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.section-switcher-panel .section-switcher-zone {
		flex-shrink: 0;
	}

	.section-switcher-content {
		flex: 1;
		padding: 8px 4px 24px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition:
			color 0.15s,
			background 0.15s;
	}

	.section-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.section-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	/* Sidebar — desktop only */
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 767px) {
		.sidebar {
			display: none;
		}
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition:
			color 0.15s,
			background 0.15s;
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.nav-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-wrap.icon-emoji {
		opacity: 0.66;
	}

	.nav-item.active .icon-wrap.icon-emoji {
		opacity: 1;
	}

	.section-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}

	.section-item-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
		opacity: 0.66;
		flex-shrink: 0;
	}

	.section-item.active .section-item-icon {
		opacity: 1;
	}

	/* Right-page-viewport: creates containing block so fixed modals/bars scope to this column */
	.right-page-viewport {
		position: relative;
		transform: translateZ(0);
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		border-left: 1px solid hsl(var(--border));
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
		}
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content.has-bottom-bar {
		padding-bottom: 100px;
	}

	.forum-categories-wrap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0;
		border-bottom: 1px solid hsl(var(--border));
	}

	.forum-categories-scroll {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		/* fade out the last ~24px before the All button */
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
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px 0 16px;
		margin-right: 16px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white66));
		background: hsl(var(--white16));
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

	.forum-all-btn:hover:not(.selected) {
		background: hsl(var(--white33));
		color: hsl(var(--white66));
	}

	.forum-all-btn.selected {
		background: hsl(var(--gray66));
		color: hsl(var(--white));
	}

	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.loading-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 60px 24px;
		color: hsl(var(--white33));
		font-size: 0.9375rem;
	}

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px 24px;
		flex: 1;
		min-height: 0;
	}

	.section-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding: 60px 24px;
	}

	/* Detail view */
	.panel-content-detail {
		position: relative;
	}

	/* Detail view styles moved to ForumPostDetail.svelte */

	.detail-back-row {
		position: sticky;
		top: 0;
		z-index: 10;
		padding: 12px 20px 10px;
		border-bottom: 1px solid hsl(var(--white8));
		background: hsl(var(--background) / 0.9);
		backdrop-filter: blur(12px);
	}

	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		padding: 4px 0;
	}

	.back-btn:hover {
		color: hsl(var(--foreground));
	}

	.detail-post-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 20px 24px 10px;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-author-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.detail-time {
		font-size: 0.75rem;
		color: hsl(var(--white33));
	}

	.detail-title {
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1.3;
		margin: 0 0 12px;
		padding: 0 24px;
		color: hsl(var(--foreground));
	}

	.detail-labels {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 0 24px 14px;
	}

	.detail-label {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 2px 10px;
		border-radius: 99px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}

	.detail-content {
		font-size: 0.9375rem;
		line-height: 1.7;
		color: hsl(var(--foreground) / 0.9);
		white-space: pre-wrap;
		word-break: break-word;
		padding: 0 24px 28px;
	}

	.comments-section {
		border-top: 1px solid hsl(var(--white8));
		padding: 20px 24px 0;
	}

	.comments-heading {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		margin: 0 0 16px;
	}

	.comments-empty {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		padding: 4px 0 20px;
		margin: 0;
	}

	.comment {
		display: flex;
		gap: 10px;
		padding: 12px 0;
		border-bottom: 1px solid hsl(var(--white4));
	}

	.comment:last-child {
		border-bottom: none;
	}

	.comment-body {
		flex: 1;
		min-width: 0;
	}

	.comment-meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 4px;
	}

	.comment-author {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.comment-time {
		font-size: 0.75rem;
		color: hsl(var(--white33));
	}

	.comment-content {
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.detail-bottom-spacer {
		height: 40px;
	}

	/* BottomBar (detail) */
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
		transition:
			transform 0.25s cubic-bezier(0.33, 1, 0.68, 1),
			opacity 0.2s ease;
	}

	.bottom-bar-wrapper.bar-out .bottom-bar,
	.bottom-bar-wrapper.bar-out .bottom-bar-comment-form {
		transform: translateY(100%);
		opacity: 0;
	}

	.bottom-bar {
		pointer-events: auto;
		width: 100%;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 12px;
		backdrop-filter: blur(24px);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	@media (min-width: 768px) {
		.bottom-bar {
			max-width: 560px;
			border-radius: 24px;
			margin-bottom: 16px;
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
	}

	.zap-btn {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 18px 0 14px;
	}

	.reply-input-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 40px;
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--foreground));
	}

	.reply-input-btn:hover {
		background: hsl(var(--white8));
	}

	.reply-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		flex: 1;
	}

	.icon-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		color: hsl(var(--white33));
	}

	.icon-btn:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}

	.guest-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.guest-bar-text {
		font-size: 0.875rem;
		color: hsl(var(--white33));
	}

	.bottom-bar-comment-form {
		pointer-events: auto;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
	}

	.comment-form-card {
		width: 100%;
		background: hsl(var(--gray66));
		border-radius: 24px 24px 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 16px 16px 20px;
		backdrop-filter: blur(24px);
	}

	@media (min-width: 768px) {
		.comment-form-card {
			max-width: 560px;
			border-radius: 24px;
			margin-bottom: 16px;
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
	}

	.comment-textarea {
		display: block;
		width: 100%;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		font-family: inherit;
		line-height: 1.5;
		padding: 10px 14px;
		resize: none;
		box-sizing: border-box;
		margin-bottom: 10px;
	}

	.comment-form-error {
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		margin: 6px 0 0;
	}

	.comment-form-row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.cancel-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white66));
		background: hsl(var(--white8));
		border: none;
		border-radius: 9999px;
		cursor: pointer;
	}

	.cancel-btn:hover {
		background: hsl(var(--white16));
		color: hsl(var(--foreground));
	}

	/* Zap modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 48;
		background: hsl(var(--black) / 0.65);
		backdrop-filter: blur(4px);
	}

	.zap-modal {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background: hsl(var(--card));
		border-radius: 24px 24px 0 0;
		border: 0.33px solid hsl(var(--white16));
		border-bottom: none;
		box-shadow: 0 -8px 40px hsl(var(--black));
		padding: 24px 24px 36px;
		max-width: 560px;
		margin: 0 auto;
	}

	@media (min-width: 768px) {
		.zap-modal {
			border-radius: 24px;
			bottom: 24px;
		}
	}

	.zap-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}

	.zap-modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.zap-amounts {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
		margin-bottom: 16px;
	}

	.zap-amount-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px 4px 8px;
		font-size: 0.875rem;
		font-weight: 600;
		border-radius: 12px;
		border: 0.33px solid hsl(var(--white16));
		background: hsl(var(--white4));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition:
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}

	.zap-amount-btn:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}

	.zap-amount-btn.selected {
		background: hsl(var(--primary) / 0.14);
		border-color: hsl(var(--primary) / 0.4);
		color: hsl(var(--primary));
	}

	.zap-sats-label {
		font-size: 0.6875rem;
		font-weight: 400;
		opacity: 0.7;
		margin-top: 2px;
	}

	.zap-field {
		margin-bottom: 12px;
	}

	.zap-field-label {
		display: block;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		margin-bottom: 6px;
	}

	.zap-input {
		display: block;
		width: 100%;
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 10px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		font-family: inherit;
		padding: 10px 14px;
		box-sizing: border-box;
	}

	.zap-error {
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		margin: 0 0 12px;
	}

	.zap-confirm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		width: 100%;
	}

	.zap-invoice-view {
		text-align: center;
	}

	.zap-invoice-label {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		margin: 0 0 10px;
	}

	.zap-invoice-code {
		display: block;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: hsl(var(--white66));
		background: hsl(var(--white4));
		padding: 10px 14px;
		border-radius: 10px;
		word-break: break-all;
		margin-bottom: 16px;
	}
</style>
