<script lang="js">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { createProfilesQuery, createStacksListingQuery } from '$lib/purpleweb';
	import { STACKS_BROWSE_INITIAL } from '$lib/constants';
	import { nip19 } from 'nostr-tools';
	import { encodeStackNaddr } from '$lib/nostr/models';
	import '$lib/styles/browse-grid.css';

	const SCROLL_THRESHOLD = 800;
	const SKELETON_COUNT = 8;
	const RENDER_BATCH = STACKS_BROWSE_INITIAL;

	let { data } = $props();

	const listing = createStacksListingQuery(() => ({
		seedEvents: data.seedEvents ?? [],
		browseAll: true
	}));
	const liveStacks = $derived(listing.items);
	const hasMore = $derived(listing.hasMore);
	const loadingMore = $derived(listing.loadingMore);

	const creatorPubkeys = $derived(
		[...new Set((liveStacks ?? []).map((s) => s.stack.pubkey).filter((pk) => isHexPubkey(pk)))]
	);
	const creatorProfiles = createProfilesQuery(() => creatorPubkeys);

	let displayLimit = $state(RENDER_BATCH);

	const stackCards = $derived.by(() => {
		void creatorProfiles.profileMap;
		return (liveStacks ?? []).map(({ stack, apps: stackApps }) => {
			let creator = undefined;
			if (isHexPubkey(stack.pubkey)) {
				const profile = creatorProfiles.profiles[stack.pubkey.toLowerCase()];
				if (profile) {
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
	});

	const visibleCards = $derived(stackCards.slice(0, displayLimit));
	const canRevealMore = $derived(displayLimit < stackCards.length);

	const showSkeleton = $derived(
		stackCards.length === 0 &&
			(listing.loading || (listing.hasMore && !loadingMore))
	);
	const showEmpty = $derived(
		!showSkeleton && stackCards.length === 0 && !listing.hasMore && !loadingMore
	);

	const stacksGridTwoCol = $derived(
		showSkeleton ? SKELETON_COUNT > 1 : visibleCards.length > 1
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

	function revealMoreCards() {
		if (canRevealMore) {
			displayLimit = Math.min(displayLimit + RENDER_BATCH, stackCards.length);
			return;
		}
		if (hasMore && !loadingMore) listing.loadMore();
	}

	function shouldLoadMore() {
		if (!browser) return false;
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;
		return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (!shouldLoadMore()) return;
		revealMoreCards();
	}

	onMount(async () => {
		if (!browser) return;
		if (stackCards.length === 0 && hasMore && navigator.onLine) {
			await listing.loadMore();
		}
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<SeoHead
	title="Stacks | Zapstore"
	description="Browse curated app collections, or create and share your own stacks."
	url="{SITE_URL}/stacks"
/>

<section class="stacks-page">
	<div class="stacks-page-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="stacks-page-frame">
			<header class="stacks-page-header">
				<SectionHeader title="Stacks" />
				<p class="stacks-intro">
					Curated collections of apps. Browse what others have shared, or create and share your own.
				</p>
			</header>

			<div class="stacks-page-body">
				{#if showSkeleton}
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
				{:else if visibleCards.length > 0}
					<ul class="browse-grid" class:browse-grid--two-col={stacksGridTwoCol} role="list">
						{#each visibleCards as stack (`${stack.pubkey}:${stack.dTag}`)}
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

					{#if !hasMore && !canRevealMore}
						<p class="stacks-end-message">You've reached the end</p>
					{/if}
				{:else if showEmpty}
					<div class="stacks-empty-state">
						<p class="text-muted-foreground">
							No app stacks found yet. Create one in the Zapstore app!
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.stacks-page {
		min-height: calc(100dvh - 64px);
	}

	.stacks-page-outer {
		position: relative;
	}

	.stacks-page-frame {
		--stacks-pad-x: 14px;
		display: flex;
		flex-direction: column;
		min-height: calc(100dvh - 64px);
		border-left: 1px solid var(--shell-border);
		border-right: 1px solid var(--shell-border);
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (min-width: 768px) {
		.stacks-page-frame {
			--stacks-pad-x: 20px;
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

	.stacks-page-header {
		flex-shrink: 0;
		padding: var(--stacks-pad-x);
		padding-bottom: 12px;
		border-bottom: 1px solid var(--shell-border);
	}

	.stacks-page-header :global(.section-header) {
		padding: 0;
		margin-bottom: 8px;
	}

	.stacks-intro {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--white66);
		max-width: 42rem;
	}

	.stacks-page-frame :global(.browse-grid) {
		border-top: none;
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
