<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { ReleaseCard } from '$lib/components';
import { queryEvent, parseRelease } from '$lib/nostr';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { renderMarkdown } from '$lib/utils/markdown';
let { app, initialRelease = null } = $props();
// Local state (set from initialRelease in onMount to avoid capturing stale reference)
let latestRelease = $state(null);
let refreshing = $state(false);
onMount(() => {
    if (!browser || !app)
        return;
    latestRelease = initialRelease ?? null;
    const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
    // Async: query Dexie for cached release
    const cachedRelease = await queryEvent({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], ...PLATFORM_FILTER });
    if (cachedRelease) {
        latestRelease = parseRelease(cachedRelease);
    }
});
</script>

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
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
							<path d="M21 3v5h-5" />
						</svg>
					</span>
				{/if}
			</div>
		</div>
	</header>

	<section class="app-description prose prose-invert max-w-none">
		{@html renderMarkdown(app.description)}
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

<style>
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
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.app-description {
		margin-bottom: 2rem;
		color: var(--color-text-secondary, #4b5563);
		line-height: 1.7;
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
