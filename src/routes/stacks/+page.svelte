<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import {
		createStacksQuery,
		seedStackEvents,
		getStacksHasMore,
		isStacksLoadingMore,
		loadMoreStacks
	} from '$lib/stores/stacks.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { nip19 } from 'nostr-tools';
	import { fetchProfilesBatch, fetchFromRelays } from '$lib/nostr/service';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config';
	import { parseProfile, encodeStackNaddr } from '$lib/nostr/models';

	const SCROLL_THRESHOLD = 800;

	let { data } = $props();

	// liveQuery-driven stacks from Dexie (local-first, auto-updates)
	// Initialize from cache to avoid skeleton flash on back navigation.
	let liveStacks = $state(getCached('stacks'));

	// Pagination state
	const hasMore = $derived(getStacksHasMore());
	const loadingMore = $derived(isStacksLoadingMore());

	// Subscribe to Dexie liveQuery for reactive stacks
	$effect(() => {
		const sub = createStacksQuery().subscribe({
			next: (value) => {
				liveStacks = value;
				setCached('stacks', value);
			},
			error: (err) => console.error('[StacksPage] liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	// Resolved stacks with creator profiles
	// Initialize from cache so back navigation shows content instantly.
	let resolvedStacks = $state(getCached('stacks:resolved') ?? []);
	let loading = $state(!getCached('stacks:resolved'));
	let resolvedStackKeys = $state('');

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
		if (!browser || liveStacks === null) return;
		const key = liveStacks.map((s) => s.stack.id).join(',');
		if (key !== resolvedStackKeys) {
			resolvedStackKeys = key;
			resolveCreators(liveStacks);
		}
	});

	// Infinite scroll
	function shouldLoadMore() {
		if (!browser) return false;
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;
		return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (hasMore && !loadingMore && shouldLoadMore()) {
			loadMoreStacks(fetchFromRelays, DEFAULT_CATALOG_RELAYS);
		}
	}

	onMount(async () => {
		if (!browser) return;
		// Seed prerendered events into Dexie → liveQuery picks them up
		seedStackEvents(data.seedEvents ?? []);
		// If no seed (client-side nav), fetch first page from relays
		if ((!data.seedEvents || data.seedEvents.length === 0) && navigator.onLine) {
			await loadMoreStacks(fetchFromRelays, DEFAULT_CATALOG_RELAYS);
		}
		// Scroll listener for infinite scroll
		window.addEventListener('scroll', handleScroll, { passive: true });
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('scroll', handleScroll);
		}
	});
</script>

<svelte:head>
	<title>App Stacks — Zapstore</title>
	<meta name="description" content="Browse curated app collections on Zapstore" />
</svelte:head>

<section class="stacks-page">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<div class="page-header">
			<h1 class="text-2xl md:text-3xl font-bold">Latest Stacks</h1>
		</div>

		{#if loading && resolvedStacks.length === 0}
			<div class="stacks-grid">
				{#each [1, 2, 3] as _}
					<div class="skeleton-stack">
						<div class="skeleton-stack-grid">
							<SkeletonLoader />
						</div>
						<div class="skeleton-stack-info">
							<div class="skeleton-stack-name"><SkeletonLoader /></div>
							<div class="skeleton-stack-desc"></div>
							<div class="skeleton-stack-creator">
								<div class="skeleton-stack-avatar"><SkeletonLoader /></div>
								<div class="skeleton-stack-creator-name"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else if resolvedStacks.length > 0}
			<div class="stacks-grid">
				{#each resolvedStacks as stack}
					<AppStackCard {stack} href={getStackUrl(stack)} />
				{/each}
				{#if loadingMore}
					{#each [1, 2, 3, 4, 5, 6] as _}
						<div class="skeleton-stack">
							<div class="skeleton-stack-grid">
								<SkeletonLoader />
							</div>
							<div class="skeleton-stack-info">
								<div class="skeleton-stack-name"><SkeletonLoader /></div>
								<div class="skeleton-stack-desc"></div>
								<div class="skeleton-stack-creator">
									<div class="skeleton-stack-avatar"><SkeletonLoader /></div>
									<div class="skeleton-stack-creator-name"></div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			{#if !hasMore}
				<p class="end-message">You've reached the end</p>
			{/if}
		{:else}
			<div class="empty-state">
				<p class="text-muted-foreground">
					No app stacks found yet. Create one in the Zapstore app!
				</p>
			</div>
		{/if}
	</div>
</section>

<style>
	.stacks-page {
		min-height: 100vh;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.stacks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}
	.stacks-grid :global(.app-stack-card) {
		padding: 4px 0;
	}
	@media (min-width: 768px) {
		.stacks-grid {
			gap: 20px;
		}
		.stacks-grid :global(.app-stack-card) {
			padding: 8px 0;
		}
	}

	.end-message {
		text-align: center;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}

	.empty-state {
		padding: 48px 24px;
		background-color: hsl(var(--gray66));
		border-radius: 16px;
		text-align: center;
	}

	/* Skeleton styles */
	.skeleton-stack {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 0;
	}

	.skeleton-stack-grid {
		width: 84px;
		height: 84px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.skeleton-stack-name {
		width: 100px;
		height: 16px;
		border-radius: 6px;
		overflow: hidden;
	}

	.skeleton-stack-desc {
		width: 140px;
		height: 10px;
		border-radius: 4px;
		background-color: hsl(var(--gray33));
	}

	.skeleton-stack-creator {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}

	.skeleton-stack-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-creator-name {
		width: 60px;
		height: 12px;
		border-radius: 4px;
		background-color: hsl(var(--gray33));
	}

	@media (min-width: 768px) {
		.skeleton-stack {
			gap: 20px;
		}
		.skeleton-stack-grid {
			width: 104px;
			height: 104px;
			border-radius: 20px;
		}
	}
</style>
