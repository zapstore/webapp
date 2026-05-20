<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { createStacksListingQuery } from '$lib/purpleweb';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { nip19 } from 'nostr-tools';
	import { fetchProfilesBatch } from '$lib/purpleweb';
	import { parseProfile, encodeStackNaddr } from '$lib/nostr/models';
	import '$lib/styles/browse-grid.css';

	const SCROLL_THRESHOLD = 800;
	const SKELETON_COUNT = 8;

	let { data } = $props();

	// Local-first stacks listing via purpleweb. Owns liveQuery, SSR seed,
	// back-nav cache, pagination state, and `loadMore`.
	const listing = createStacksListingQuery(() => ({ seedEvents: data.seedEvents ?? [] }));
	const liveStacks = $derived(listing.items);
	const hasMore = $derived(listing.hasMore);
	const loadingMore = $derived(listing.loadingMore);

	// Resolved stacks with creator profiles
	// Initialize from cache so back navigation shows content instantly.
	let resolvedStacks = $state(getCached('stacks:resolved') ?? []);
	let loading = $state(!getCached('stacks:resolved'));
	let resolvedStackKeys = $state('');

	const stacksGridTwoCol = $derived(
		loading && resolvedStacks.length === 0 ? SKELETON_COUNT > 1 : resolvedStacks.length > 1
	);

	function isHexPubkey(value) {
		return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
	}

	function hasIdentifier(value) {
		return typeof value === 'string' && value.trim().length > 0;
	}

	function safeEncodeStackNaddr(pubkey, dTag) {
		if (!isHexPubkey(pubkey) || !hasIdentifier(dTag)) return '';
		try {
			return encodeStackNaddr(pubkey.trim().toLowerCase(), dTag.trim());
		} catch {
			return '';
		}
	}

	function safeNpub(pubkey) {
		if (!isHexPubkey(pubkey)) return '';
		try {
			return nip19.npubEncode(pubkey.trim().toLowerCase());
		} catch {
			return '';
		}
	}

	function getStackUrl(stack) {
		const naddr = safeEncodeStackNaddr(stack?.pubkey, stack?.dTag);
		return naddr ? `/stacks/${naddr}` : '#';
	}

	// Fetch creator profiles when liveQuery stacks change
	async function resolveCreators(stacksWithApps) {
		if (!browser) return;
		if (stacksWithApps.length === 0) {
			loading = false;
			return;
		}
		loading = true;
		try {
			const creatorPubkeys = [
				...new Set(stacksWithApps.map((s) => s.stack.pubkey).filter((pk) => isHexPubkey(pk)))
			];
			const creatorEvents = await fetchProfilesBatch(creatorPubkeys);
			resolvedStacks = stacksWithApps.map(({ stack, apps: stackApps }) => {
				let creator = undefined;
				if (isHexPubkey(stack.pubkey)) {
					const profileEvent = creatorEvents.get(stack.pubkey);
					if (profileEvent) {
						const profile = parseProfile(profileEvent);
						creator = {
							name: profile.displayName || profile.name,
							picture: profile.picture,
							pubkey: stack.pubkey,
							npub: safeNpub(stack.pubkey)
						};
					}
				}
				return {
					name: stack.title,
					description: stack.description,
					apps: stackApps,
					creator,
					pubkey: stack.pubkey,
					dTag: stack.dTag
				};
			});
			setCached('stacks:resolved', resolvedStacks);
		} catch (err) {
			console.error('Error resolving stacks:', err);
		} finally {
			loading = false;
		}
	}

	// Re-resolve creators when liveQuery stacks change
	$effect(() => {
		if (!browser) return;
		const items = liveStacks;
		if (!items) return;
		const key = items.map((s) => s.stack.id).join(',');
		if (key !== resolvedStackKeys) {
			resolvedStackKeys = key;
			resolveCreators(items);
		}
	});

	let scrollContainer = null;

	// Infinite scroll
	function shouldLoadMore() {
		if (!browser) return false;
		const el = scrollContainer;
		if (!el) return false;
		return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (hasMore && !loadingMore && shouldLoadMore()) {
			listing.loadMore();
		}
	}

	onMount(async () => {
		if (!browser) return;
		// On a cold cache (no SSR seed, e.g. client-side nav) prime the first
		// page from relays. Seeded loads handle themselves via the listing
		// query's seed-persist path.
		if ((!data.seedEvents || data.seedEvents.length === 0) && navigator.onLine) {
			await listing.loadMore();
		}
		// Use the app shell's scroll container, fall back to window
		scrollContainer = document.querySelector('[data-scroll-container]') ?? window;
		scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
	});

	onDestroy(() => {
		if (browser) {
			scrollContainer?.removeEventListener('scroll', handleScroll);
		}
	});

</script>

<SeoHead
	title="App Stacks — Zapstore"
	description="Browse curated app collections on Zapstore"
	url="{SITE_URL}/stacks"
/>

<section class="stacks-page">
	<div class="stacks-page-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="stacks-page-frame">
			<div class="stacks-page-header">
				<SectionHeader title="Stacks" />
			</div>

			{#if loading && resolvedStacks.length === 0}
				<ul
					class="browse-grid"
					class:browse-grid--two-col={stacksGridTwoCol}
					role="list"
					aria-hidden="true"
				>
					{#each Array(SKELETON_COUNT) as _, i (i)}
						<li class="browse-grid-item">
							<div class="stacks-browse-skeleton">
								<div class="stacks-browse-skeleton-grid"><SkeletonLoader /></div>
								<div class="stacks-browse-skeleton-info">
									<div class="stacks-browse-skeleton-name"><SkeletonLoader /></div>
									<div class="stacks-browse-skeleton-line"></div>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{:else if resolvedStacks.length > 0}
				<ul class="browse-grid" class:browse-grid--two-col={stacksGridTwoCol} role="list">
					{#each resolvedStacks as stack (`${stack.pubkey}:${stack.dTag}`)}
						<li class="browse-grid-item">
							<AppStackCard {stack} href={getStackUrl(stack)} />
						</li>
					{/each}
					{#if loadingMore}
						{#each Array(4) as _, i (`more-${i}`)}
							<li class="browse-grid-item" aria-hidden="true">
								<div class="stacks-browse-skeleton">
									<div class="stacks-browse-skeleton-grid"><SkeletonLoader /></div>
									<div class="stacks-browse-skeleton-info">
										<div class="stacks-browse-skeleton-name"><SkeletonLoader /></div>
										<div class="stacks-browse-skeleton-line"></div>
									</div>
								</div>
							</li>
						{/each}
					{/if}
				</ul>

				{#if !hasMore}
					<p class="stacks-end-message">You've reached the end</p>
				{/if}
			{:else}
				<div class="stacks-empty-state">
					<p class="text-muted-foreground">
						No app stacks found yet. Create one in the Zapstore app!
					</p>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.stacks-page {
		min-height: 100vh;
	}

	.stacks-page-outer {
		padding-top: 24px;
		padding-bottom: 24px;
	}

	.stacks-page-frame {
		--stacks-pad-x: 14px;
		border-left: 1px solid var(--white16);
		border-right: 1px solid var(--white16);
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (min-width: 768px) {
		.stacks-page-frame {
			--stacks-pad-x: 16px;
		}
	}

	@media (max-width: 639px) {
		.stacks-page-frame {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.stacks-page-frame {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
		}
	}

	.stacks-page-header :global(.section-header) {
		padding-left: var(--stacks-pad-x);
		padding-right: var(--stacks-pad-x);
		margin-bottom: 12px;
	}

	.stacks-end-message {
		text-align: center;
		padding: 2rem var(--stacks-pad-x);
		color: var(--white66);
		font-size: 0.875rem;
		margin: 0;
	}

	.stacks-empty-state {
		padding: 48px var(--stacks-pad-x);
		text-align: center;
	}

	.stacks-browse-skeleton {
		display: flex;
		gap: 16px;
		align-items: stretch;
	}

	.stacks-browse-skeleton-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.stacks-browse-skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
	}

	.stacks-browse-skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.stacks-browse-skeleton-line {
		width: 140px;
		height: 10px;
		border-radius: 12px;
		background: var(--gray33);
	}

	@media (min-width: 768px) {
		.stacks-browse-skeleton-grid {
			width: 104px;
			height: 104px;
		}
	}
</style>
