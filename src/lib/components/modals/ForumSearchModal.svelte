<script lang="js">
	/**
	 * ForumSearchModal - Search forum posts AND comments. Same bottom-sheet style as InsertModal.
	 *
	 * Results are unified: posts first (post title row), then comments (Reply icon + snippet row).
	 * Clicking a comment navigates to the parent post with ?comment=<id> so the thread auto-opens.
	 *
	 * Two-phase search:
	 *   1. Instant local Dexie query — results appear immediately (<50ms).
	 *   2. Parallel NIP-50 relay search for both posts and comments — after EOSE, re-queries Dexie
	 *      to merge any new events without replacing visible local results until relay is done.
	 */
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { Search } from 'lucide-svelte';
	import { nip19 } from 'nostr-tools';
	import { goto } from '$app/navigation';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import { Reply } from '$lib/components/icons';
	import {
		queryEvents,
		fetchProfilesBatch,
		searchForumPosts,
		searchForumComments
	} from '$lib/nostr';
	import { parseForumPost, parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS, ZAPSTORE_RELAY } from '$lib/config';

	let {
		isOpen = $bindable(false),
		/** Community pubkey hex for #h filter */
		communityPubkeyHex = '',
		onclose = () => {}
	} = $props();

	let query = $state('');
	let searchLoading = $state(false);
	/** True while the relay NIP-50 query is still in-flight (local results already visible). */
	let relaySearchLoading = $state(false);
	/**
	 * Unified result list.
	 * @type {Array<
	 *   { type: 'post', event: import('nostr-tools').NostrEvent } |
	 *   { type: 'comment', event: import('nostr-tools').NostrEvent, rootPostId: string, rootPostNevent: string }
	 * >}
	 */
	let searchResults = $state([]);
	/** @type {Map<string, { name?: string, picture?: string }>} */
	let profilesByPubkey = $state(new Map());
	/** @type {HTMLInputElement | null} */
	let searchInputEl = $state(null);

	/** Match query against forum post event: title, content, or t tags (labels). Case-insensitive. */
	function postMatchesQuery(event, lower) {
		const post = parseForumPost(event);
		if (!post) return false;
		if ((post.title ?? '').toLowerCase().includes(lower)) return true;
		if ((post.content ?? '').toLowerCase().includes(lower)) return true;
		const labels = post.labels ?? [];
		return labels.some((t) => t.toLowerCase().includes(lower));
	}

	/** Encode event id to nevent safely; returns '' on failure. */
	function safeNevent(id) {
		try {
			return nip19.neventEncode({ id });
		} catch {
			return '';
		}
	}

	/**
	 * Query Dexie for forum posts + comments matching q, build unified results.
	 * @param {string} q - trimmed query string
	 * @param {string} hPubkey - community pubkey hex
	 * @param {AbortSignal} signal
	 * @param {{ postLimit?: number, commentLimit?: number }} limits
	 */
	async function runLocalSearch(q, hPubkey, signal, { postLimit = 200, commentLimit = 200 } = {}) {
		const lower = q.toLowerCase();

		const [postEvents, commentEvents] = await Promise.all([
			queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], '#h': [hPubkey], limit: postLimit }),
			queryEvents({
				kinds: [EVENT_KINDS.COMMENT],
				'#K': [String(EVENT_KINDS.FORUM_POST)],
				limit: commentLimit
			})
		]);
		if (signal.aborted) return;

		// Filter + sort posts
		const filteredPosts = postEvents
			.filter((e) => postMatchesQuery(e, lower))
			.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
			.slice(0, 15);

		// Filter comments by content
		const matchingComments = commentEvents
			.filter((e) => (e.content ?? '').toLowerCase().includes(lower))
			.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

		// Look up root posts to: (a) check community membership, (b) get nevent for navigation
		const rootIdSet = new Set(
			matchingComments.map((e) => e.tags?.find((t) => t[0] === 'E' && t[1])?.[1]).filter(Boolean)
		);
		let rootPostMap = new Map();
		if (rootIdSet.size > 0) {
			const rootPosts = await queryEvents({ ids: [...rootIdSet], limit: rootIdSet.size });
			if (signal.aborted) return;
			for (const rp of rootPosts) {
				// Only keep root posts that belong to this community
				if (rp.tags?.some((t) => t[0] === 'h' && t[1] === hPubkey)) {
					rootPostMap.set(rp.id, rp);
				}
			}
		}

		// Build comment result objects (community-filtered, max 15)
		const commentResults = matchingComments
			.flatMap((e) => {
				const rootId = e.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
				const rootPost = rootId ? rootPostMap.get(rootId) : null;
				if (!rootPost) return [];
				const rootPostNevent = safeNevent(rootPost.id);
				if (!rootPostNevent) return [];
				return [
					{
						type: /** @type {'comment'} */ ('comment'),
						event: e,
						rootPostId: rootPost.id,
						rootPostNevent
					}
				];
			})
			.slice(0, 15);

		searchResults = [
			...filteredPosts.map((e) => ({ type: /** @type {'post'} */ ('post'), event: e })),
			...commentResults
		];

		// Profiles for all result authors
		const pubkeys = [...new Set(searchResults.map((r) => r.event.pubkey).filter(Boolean))];
		if (pubkeys.length > 0 && !signal.aborted) {
			const batch = await fetchProfilesBatch(pubkeys, { signal });
			if (signal.aborted) return;
			const map = new Map();
			for (const [pk, ev] of batch) {
				const p = ev ? parseProfile(ev) : null;
				map.set(pk, { name: p?.displayName ?? p?.name ?? null, picture: p?.picture ?? null });
			}
			profilesByPubkey = map;
		}
	}

	$effect(() => {
		if (!isOpen) {
			query = '';
			searchResults = [];
			profilesByPubkey = new Map();
			relaySearchLoading = false;
			return;
		}
		const t = setTimeout(() => searchInputEl?.focus(), 80);
		return () => clearTimeout(t);
	});

	const SEARCH_DEBOUNCE_MS = 280;

	$effect(() => {
		const q = query.trim();
		if (!isOpen || !communityPubkeyHex) {
			searchResults = [];
			return;
		}
		if (!q) {
			searchResults = [];
			searchLoading = false;
			relaySearchLoading = false;
			return;
		}
		const controller = new AbortController();
		const debounceTimer = setTimeout(() => {
			searchLoading = true;
			relaySearchLoading = true;

			// Phase 1 — instant local Dexie results (posts + comments already in cache)
			(async () => {
				try {
					await runLocalSearch(q, communityPubkeyHex, controller.signal, {
						postLimit: 200,
						commentLimit: 200
					});
				} catch {
					if (!controller.signal.aborted) searchResults = [];
				} finally {
					if (!controller.signal.aborted) searchLoading = false;
				}
			})();

			// Phase 2 — parallel NIP-50 relay queries for posts and comments
			(async () => {
				try {
					await Promise.all([
						searchForumPosts([ZAPSTORE_RELAY], communityPubkeyHex, q, {
							limit: 50,
							timeout: 6000,
							signal: controller.signal
						}),
						searchForumComments([ZAPSTORE_RELAY], q, {
							limit: 50,
							timeout: 6000,
							signal: controller.signal
						})
					]);
					// Both wrote new events to Dexie — re-run with wider limits to merge them
					if (!controller.signal.aborted) {
						await runLocalSearch(q, communityPubkeyHex, controller.signal, {
							postLimit: 400,
							commentLimit: 400
						});
					}
				} catch {
					// Silent — relay failure never hides local results
				} finally {
					if (!controller.signal.aborted) relaySearchLoading = false;
				}
			})();
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			clearTimeout(debounceTimer);
			controller.abort();
		};
	});

	const hasQuery = $derived(query.trim().length > 0);
	const displayResults = $derived(hasQuery ? searchResults : []);

	/** Navigate to the forum post, optionally anchoring to a specific comment. */
	function openResult(result) {
		if (result.type === 'post') {
			const post = parseForumPost(result.event);
			const nevent = post?.id ? safeNevent(post.id) : '';
			if (nevent) {
				isOpen = false;
				onclose?.();
				goto(`/community/forum/${nevent}`);
			}
		} else {
			const { rootPostNevent, event } = result;
			if (rootPostNevent) {
				isOpen = false;
				onclose?.();
				goto(`/community/forum/${rootPostNevent}?comment=${event.id}`);
			}
		}
	}

	function handleOverlayClick() {
		isOpen = false;
		onclose?.();
	}

	function handleKeydown(/** @type {KeyboardEvent} */ e) {
		if (e.key === 'Escape') {
			isOpen = false;
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="forum-search-overlay bg-overlay"
		onclick={handleOverlayClick}
		role="presentation"
		transition:fade={{ duration: 200 }}
	></div>

	<div class="forum-search-wrapper" role="dialog" aria-modal="true" aria-label="Search forum posts">
		<div class="forum-search-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<div class="forum-search-row">
				<div class="forum-search-inner">
					<span class="forum-search-icon" aria-hidden="true"><Search /></span>
					<input
						type="search"
						class="forum-search-input"
						placeholder="Search by title, content, or tags"
						bind:value={query}
						bind:this={searchInputEl}
						aria-label="Search forum posts"
					/>
					{#if relaySearchLoading && !searchLoading}
						<span class="forum-search-relay-dot" aria-hidden="true" title="Searching relay…"></span>
					{/if}
				</div>
			</div>

			<div class="forum-search-body-wrap">
				<div
					class="forum-search-body-inner"
					class:forum-search-body-inner-scroll={displayResults.length > 0}
				>
					{#if hasQuery}
						{#if searchLoading}
							<div class="forum-search-empty-state">
								<div class="forum-search-spinner" aria-hidden="true">
									<svg
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<circle
											cx="12"
											cy="12"
											r="10"
											stroke-dasharray="47 15"
											stroke-linecap="round"
										/>
									</svg>
								</div>
							</div>
						{:else if displayResults.length === 0}
							<div class="forum-search-empty-state">
								<p class="forum-search-empty-text">No posts found</p>
							</div>
						{:else}
							<ul class="forum-search-list">
								{#each displayResults as result (result.event.id)}
									{@const profile = profilesByPubkey.get(result.event.pubkey)}
									{@const authorName =
										profile?.name ?? (result.event.pubkey?.slice(0, 12) ?? '') + '…'}
									<li class="forum-search-row-item">
										<button
											type="button"
											class="forum-search-row-btn"
											onclick={() => openResult(result)}
										>
											<div class="forum-search-row-avatar">
												<ProfilePic
													pictureUrl={profile?.picture}
													name={authorName}
													pubkey={result.event.pubkey}
													size="bubble"
												/>
											</div>
											<div class="forum-search-row-text">
												<span class="forum-search-author">{authorName}</span>
												{#if result.type === 'post'}
													{@const post = parseForumPost(result.event)}
													<span class="forum-search-title">
														<img
															src="/images/emoji/forum.png"
															alt=""
															class="forum-search-title-emoji"
															aria-hidden="true"
														/>
														{post?.title ?? 'Untitled'}
													</span>
												{:else}
													{@const snippet = result.event.content.replace(/\n/g, ' ')}
													<span class="forum-search-comment">
														<span class="forum-search-comment-icon" aria-hidden="true">
															<Reply
																variant="outline"
																size={13}
																strokeWidth={1.4}
																color="var(--white66)"
															/>
														</span>
														<span class="forum-search-comment-text"
															>{snippet.length > 80 ? snippet.slice(0, 79) + '…' : snippet}</span
														>
													</span>
												{/if}
											</div>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<div class="forum-search-empty-state">
							<p class="forum-search-empty-text">Search by title, content, or tags</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.forum-search-overlay {
		position: fixed;
		inset: 0;
		z-index: 61;
	}

	.forum-search-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 62;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.forum-search-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: var(--gray66);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid var(--white8);
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		max-height: 70vh;
	}

	@media (min-width: 768px) {
		.forum-search-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px;
		}
	}

	.forum-search-row {
		flex-shrink: 0;
		padding-bottom: 0;
	}
	.forum-search-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 12px;
		background: var(--black33);
		border: 0.33px solid var(--white33);
		border-radius: 16px;
	}

	.forum-search-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--white33);
	}

	.forum-search-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 16px;
	}

	.forum-search-input::placeholder {
		color: var(--white33);
	}

	.forum-search-body-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 12px;
	}

	.forum-search-body-inner {
		background: var(--black33);
		border-radius: var(--radius-12);
		min-height: 240px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.forum-search-body-inner-scroll {
		max-height: 420px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--white33) transparent;
	}
	.forum-search-body-inner-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.forum-search-body-inner-scroll::-webkit-scrollbar-thumb {
		background: var(--white33);
		border-radius: 2px;
	}

	.forum-search-empty-state {
		width: 100%;
		min-height: 160px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.forum-search-empty-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		margin: 0;
		padding: 24px 16px;
	}
	.forum-search-spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--white33);
	}
	.forum-search-spinner svg {
		animation: forum-search-spin 0.8s linear infinite;
	}
	@keyframes forum-search-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.forum-search-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.forum-search-row-item {
		border-bottom: 1px solid var(--white8);
	}
	.forum-search-row-item:last-child {
		border-bottom: none;
	}

	.forum-search-row-btn {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: 0;
		padding: 10px 12px;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
	}
	.forum-search-row-avatar {
		flex-shrink: 0;
	}

	.forum-search-row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.forum-search-author {
		font-size: 12px;
		font-weight: 500;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.forum-search-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.forum-search-title-emoji {
		flex-shrink: 0;
		width: 13px;
		height: 13px;
		object-fit: contain;
	}

	.forum-search-comment {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.forum-search-comment-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		margin-top: 1px;
	}
	.forum-search-comment-text {
		font-size: 14px;
		font-weight: 400;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Subtle pulsing dot shown in the search bar while the relay NIP-50 query is in-flight */
	.forum-search-relay-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--white33);
		animation: forum-search-relay-pulse 1.2s ease-in-out infinite;
	}
	@keyframes forum-search-relay-pulse {
		0%,
		100% {
			opacity: 0.3;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
