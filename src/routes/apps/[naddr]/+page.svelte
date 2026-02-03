<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { ReleaseCard } from '$lib/components';
	import type { App, Release } from '$lib/nostr';
	import { queryStoreOne, watchEvent, parseApp, parseRelease, initNostrService } from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const error = $derived(data.error ?? null);

	// Local state - start with prerendered data
	let app = $state<App | null>(data.app);
	let latestRelease = $state<Release | null>(data.latestRelease);
	let refreshing = $state(false);

	onMount(() => {
		if (!browser || !data.app) return;

		const aTagValue = `${EVENT_KINDS.APP}:${data.app.pubkey}:${data.app.dTag}`;

		// Sync: query EventStore immediately (data from listing/prefetch)
		const cachedRelease = queryStoreOne({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue] });
		if (cachedRelease) {
			latestRelease = parseRelease(cachedRelease);
		}

		const cachedApp = queryStoreOne({ 
			kinds: [EVENT_KINDS.APP], 
			authors: [data.app.pubkey], 
			'#d': [data.app.dTag] 
		});
		if (cachedApp) {
			app = parseApp(cachedApp);
		}

		// Background refresh from relays
		const schedule =
			'requestIdleCallback' in window
				? window.requestIdleCallback
				: (cb: () => void) => setTimeout(cb, 1);

		schedule(async () => {
			await initNostrService();

			refreshing = true;
			let pending = 2;

			const done = () => {
				pending--;
				if (pending === 0) refreshing = false;
			};

			// Background relay fetch for app
			watchEvent(
				{ kinds: [EVENT_KINDS.APP], authors: [data.app!.pubkey], '#d': [data.app!.dTag] },
				{ relays: DEFAULT_CATALOG_RELAYS },
				(freshEvent) => {
					if (freshEvent) app = parseApp(freshEvent);
					done();
				}
			);

			// Background relay fetch for release
			watchEvent(
				{ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue] },
				{ relays: DEFAULT_CATALOG_RELAYS },
				(freshEvent) => {
					if (freshEvent) latestRelease = parseRelease(freshEvent);
					done();
				}
			);
		});
	});
</script>

<svelte:head>
	{#if app}
		<title>{app.name} — Zapstore</title>
		<meta name="description" content={app.description.slice(0, 160)} />
		<meta property="og:title" content={app.name} />
		<meta property="og:description" content={app.description.slice(0, 160)} />
		{#if app.icon}
			<meta property="og:image" content={app.icon} />
		{/if}
	{:else}
		<title>App — Zapstore</title>
	{/if}
</svelte:head>

{#if error}
	<div class="error-page">
		<h1>Error</h1>
		<p>{error}</p>
		<a href="/apps">Browse all apps</a>
	</div>
{:else if app}
	<article class="app-detail">
		<header class="app-header">
			{#if app.icon}
				<img src={app.icon} alt={app.name} class="app-icon" decoding="async" />
			{:else}
				<div class="app-icon placeholder">
					<span>{app.name.charAt(0).toUpperCase()}</span>
				</div>
			{/if}

			<div class="app-info">
				<div class="name-row">
					<h1 class="app-name">{app.name}</h1>
					{#if latestRelease?.version}
						<span class="version-pill">{latestRelease.version}</span>
					{/if}
					{#if refreshing}
						<span class="refresh-icon" title="Refreshing from relays...">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
								<path d="M21 3v5h-5" />
							</svg>
						</span>
					{/if}
				</div>
			</div>
		</header>

		<section class="app-description">
			<p>{app.description}</p>
		</section>

		{#if app.images.length > 0}
			<section class="app-screenshots">
				<h2>Screenshots</h2>
				<div class="screenshots-scroll">
					{#each app.images as image}
						<img src={image} alt="Screenshot" class="screenshot" decoding="async" />
					{/each}
				</div>
			</section>
		{/if}

		{#if latestRelease}
			<section class="app-releases">
				<h2>Latest Release</h2>
				<div class="releases-list">
					<ReleaseCard release={latestRelease} />
				</div>
			</section>
		{/if}

		<section class="app-meta">
			{#if app.repository}
				<p>
					<strong>Repository:</strong>
					<a href={app.repository} target="_blank" rel="noopener noreferrer">{app.repository}</a>
				</p>
			{/if}
			{#if app.license}
				<p><strong>License:</strong> {app.license}</p>
			{/if}
		</section>
	</article>
{/if}

<style>
	.error-page {
		text-align: center;
		padding: 3rem;
	}

	.error-page h1 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.error-page p {
		color: var(--color-text-secondary, #6b7280);
		margin-bottom: 1rem;
	}

	.error-page a {
		color: var(--color-accent, #8b5cf6);
	}

	.app-detail {
		max-width: 800px;
	}

	.app-header {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.app-icon {
		width: 6rem;
		height: 6rem;
		border-radius: 1rem;
		object-fit: cover;
		flex-shrink: 0;
	}

	.app-icon.placeholder {
		background: var(--color-accent, #8b5cf6);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 2rem;
		font-weight: 600;
	}

	.app-info {
		flex: 1;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.app-name {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}

	.version-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-accent, #8b5cf6);
		background: var(--color-accent-bg, #f3e8ff);
		border-radius: 9999px;
	}

	.refresh-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-accent, #8b5cf6);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.app-description {
		margin-bottom: 2rem;
	}

	.app-description p {
		color: var(--color-text-secondary, #4b5563);
		line-height: 1.7;
		white-space: pre-wrap;
	}

	.app-screenshots {
		margin-bottom: 2rem;
	}

	.app-screenshots h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.screenshots-scroll {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		padding-bottom: 1rem;
	}

	.screenshot {
		height: 20rem;
		border-radius: 0.75rem;
		flex-shrink: 0;
	}

	.app-releases {
		margin-bottom: 2rem;
	}

	.app-releases h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.releases-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.app-meta {
		font-size: 0.875rem;
		color: var(--color-text-secondary, #6b7280);
	}

	.app-meta p {
		margin: 0.5rem 0;
	}

	.app-meta a {
		color: var(--color-accent, #8b5cf6);
	}
</style>
