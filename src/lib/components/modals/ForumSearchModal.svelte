<script lang="js">
/**
 * ForumSearchModal - Search forum posts (title, content, tags). Same bottom-sheet style as InsertModal
 * but no title/description. Rows: profile pic + author name + post title. Click opens post page.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Search } from 'lucide-svelte';
import { nip19 } from 'nostr-tools';
import { goto } from '$app/navigation';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import { queryEvents, fetchProfilesBatch } from '$lib/nostr';
import { parseForumPost, parseProfile } from '$lib/nostr/models';
import { EVENT_KINDS } from '$lib/config';

let {
	isOpen = $bindable(false),
	/** Community pubkey hex for #h filter */
	communityPubkeyHex = '',
	onclose = () => {}
} = $props();

let query = $state('');
let searchLoading = $state(false);
/** @type {import('nostr-tools').NostrEvent[]} */
let searchResults = $state([]);
/** @type {Map<string, { name?: string, picture?: string }>} */
let profilesByPubkey = $state(new Map());
/** @type {HTMLInputElement | null} */
let searchInputEl = $state(null);

/** Match query against forum post event: title, content, or t tags (labels). Case-insensitive. */
function eventMatchesQuery(event, q) {
	const lower = q.toLowerCase();
	const post = parseForumPost(event);
	if (!post) return false;
	if ((post.title ?? '').toLowerCase().includes(lower)) return true;
	if ((post.content ?? '').toLowerCase().includes(lower)) return true;
	const labels = post.labels ?? [];
	if (labels.some((t) => t.toLowerCase().includes(lower))) return true;
	return false;
}

$effect(() => {
	if (!isOpen) {
		query = '';
		searchResults = [];
		profilesByPubkey = new Map();
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
		return;
	}
	const controller = new AbortController();
	const debounceTimer = setTimeout(() => {
		searchLoading = true;
		(async () => {
			try {
				const events = await queryEvents({
					kinds: [EVENT_KINDS.FORUM_POST],
					'#h': [communityPubkeyHex],
					limit: 200
				});
				if (controller.signal.aborted) return;
				const filtered = events
					.filter((e) => eventMatchesQuery(e, q))
					.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
					.slice(0, 30);
				searchResults = filtered;
				const pubkeys = [...new Set(filtered.map((e) => e.pubkey).filter(Boolean))];
				if (pubkeys.length > 0) {
					const batch = await fetchProfilesBatch(pubkeys, { signal: controller.signal });
					const map = new Map();
					for (const [pk, ev] of batch) {
						const p = ev ? parseProfile(ev) : null;
						map.set(pk, {
							name: p?.displayName ?? p?.name ?? null,
							picture: p?.picture ?? null
						});
					}
					if (!controller.signal.aborted) profilesByPubkey = map;
				}
			} catch {
				if (!controller.signal.aborted) searchResults = [];
			} finally {
				if (!controller.signal.aborted) searchLoading = false;
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

function openPost(post) {
	const nevent = post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '';
	if (nevent) {
		isOpen = false;
		onclose?.();
		goto(`/community/forum/${nevent}`);
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
	<div class="forum-search-overlay" onclick={handleOverlayClick} role="presentation"></div>

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
				</div>
			</div>

			<div class="forum-search-body-wrap">
				<div class="forum-search-body-inner" class:forum-search-body-inner-scroll={displayResults.length > 0}>
					{#if hasQuery}
						{#if searchLoading}
							<div class="forum-search-empty-state">
								<div class="forum-search-spinner" aria-hidden="true">
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="12" cy="12" r="10" stroke-dasharray="47 15" stroke-linecap="round"/>
									</svg>
								</div>
							</div>
						{:else if displayResults.length === 0}
							<div class="forum-search-empty-state">
								<p class="forum-search-empty-text">No posts found</p>
							</div>
						{:else}
							<ul class="forum-search-list">
								{#each displayResults as event (event.id)}
									{@const post = parseForumPost(event)}
									{@const profile = profilesByPubkey.get(event.pubkey)}
									{@const authorName = profile?.name ?? (event.pubkey?.slice(0, 12) + '…') ?? 'Anonymous'}
									<li class="forum-search-row-item">
										<button
											type="button"
											class="forum-search-row-btn"
											onclick={() => post && openPost(post)}
										>
											<div class="forum-search-row-avatar">
												<ProfilePic
													pictureUrl={profile?.picture}
													name={authorName}
													pubkey={event.pubkey}
													size="sm"
												/>
											</div>
											<div class="forum-search-row-text">
												<span class="forum-search-author">{authorName}</span>
												<span class="forum-search-title">{post?.title ?? 'Untitled'}</span>
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
		background: transparent;
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
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		max-height: 50vh;
	}

	@media (min-width: 768px) {
		.forum-search-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
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
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: 16px;
	}

	.forum-search-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.forum-search-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 16px;
	}

	.forum-search-input::placeholder {
		color: hsl(var(--white33));
	}

	.forum-search-body-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 12px;
	}

	.forum-search-body-inner {
		background: hsl(var(--black33));
		border-radius: var(--radius-12);
		min-height: 160px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.forum-search-body-inner-scroll {
		max-height: 280px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--white33)) transparent;
	}
	.forum-search-body-inner-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.forum-search-body-inner-scroll::-webkit-scrollbar-thumb {
		background: hsl(var(--white33));
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
		color: hsl(var(--white16));
		text-align: center;
		margin: 0;
		padding: 24px 16px;
	}
	.forum-search-spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--white33));
	}
	.forum-search-spinner svg {
		animation: forum-search-spin 0.8s linear infinite;
	}
	@keyframes forum-search-spin {
		to { transform: rotate(360deg); }
	}

	.forum-search-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.forum-search-row-item {
		border-bottom: 1px solid hsl(var(--white8));
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
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.forum-search-title {
		font-size: 15px;
		font-weight: 500;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
