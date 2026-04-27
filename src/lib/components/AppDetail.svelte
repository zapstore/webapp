<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { ReleaseCard } from '$lib/components';
import { queryEvent, parseRelease } from '$lib/nostr';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { renderMarkdown } from '$lib/utils/markdown';
import { ChevronDown, ChevronRight } from '$lib/components/icons';
import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';

let {
	app,
	initialRelease = null,
	/** Called when user picks "Via Zapstore" — parent opens DownloadModal */
	onDownloadViaZapstore = null,
	/** Direct APK download URL for "Direct Download" option */
	directDownloadUrl = null
} = $props();

// Local state (set from initialRelease in onMount to avoid capturing stale reference)
let latestRelease = $state(null);
let refreshing = $state(false);
let downloadDropdownOpen = $state(false);
/** @type {HTMLDivElement | null} */
let downloadDropdownWrap = $state(null);

const showDownloadButton = $derived(!!onDownloadViaZapstore || !!directDownloadUrl);

onMount(async () => {
    if (!browser || !app)
        return;
    latestRelease = initialRelease ?? null;
    const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
    const cachedRelease = await queryEvent({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], ...PLATFORM_FILTER });
    if (cachedRelease) {
        latestRelease = parseRelease(cachedRelease);
    }
});

$effect(() => {
	if (!downloadDropdownOpen || !downloadDropdownWrap) return;
	function handleClick(/** @type {MouseEvent} */ e) {
		if (downloadDropdownWrap && !downloadDropdownWrap.contains(/** @type {Node} */ (e.target))) {
			downloadDropdownOpen = false;
		}
	}
	document.addEventListener('click', handleClick, true);
	return () => document.removeEventListener('click', handleClick, true);
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

			{#if showDownloadButton}
				<div class="download-wrap" bind:this={downloadDropdownWrap}>
					<div class="download-split-btn" role="group">
						<button
							type="button"
							class="download-main"
							onclick={() => {
								onDownloadViaZapstore?.();
								downloadDropdownOpen = false;
							}}
						>
							Download
						</button>
						<div class="download-divider" aria-hidden="true"></div>
						<button
							type="button"
							class="download-chevron"
							aria-label="More download options"
							aria-expanded={downloadDropdownOpen}
							onclick={(e) => {
								e.stopPropagation();
								downloadDropdownOpen = !downloadDropdownOpen;
							}}
						>
							<span class="download-chevron-icon">
								<ChevronDown variant="outline" size={13} strokeWidth={1.6} color="var(--whiteEnforced)" />
							</span>
						</button>
					</div>

					{#if downloadDropdownOpen}
						<DropdownMenu class="download-dropdown" itemChevron={true}>
							{#if onDownloadViaZapstore}
								<button
									type="button"
									class="dropdown-item dropdown-item--stacked"
									role="menuitem"
									onclick={() => {
										onDownloadViaZapstore?.();
										downloadDropdownOpen = false;
									}}
								>
									<span class="dropdown-item-body">
										<span class="dropdown-item-title">Via Zapstore</span>
										<span class="dropdown-item-desc">For reliable and secure updates</span>
									</span>
									<span class="item-chevron"><ChevronRight variant="outline" size={12} strokeWidth={1.4} color="var(--white33)" /></span>
								</button>
							{/if}
							{#if directDownloadUrl}
								<a
									href={directDownloadUrl}
									class="dropdown-item dropdown-item--stacked"
									role="menuitem"
									download
									onclick={() => { downloadDropdownOpen = false; }}
								>
									<span class="dropdown-item-body">
										<span class="dropdown-item-title">Direct Download</span>
										<span class="dropdown-item-desc">Get the {app.name} APK directly</span>
									</span>
									<span class="item-chevron"><ChevronRight variant="outline" size={12} strokeWidth={1.4} color="var(--white33)" /></span>
								</a>
							{/if}
						</DropdownMenu>
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<section class="app-description prose prose-invert max-w-none">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html renderMarkdown(app.description)}
	</section>

	{#if app.images.length > 0}
		<section class="app-screenshots">
			<h2>Screenshots</h2>
			<div class="screenshots-scroll">
				{#each app.images as image, i (i)}
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Download split button ─────────────────────────────────── */
	.download-wrap {
		position: relative;
		display: inline-flex;
	}

	.download-split-btn {
		display: inline-flex;
		align-items: stretch;
		height: 32px;
		background-image: var(--button-primary-bg);
		border-radius: 9999px;
		overflow: hidden;
		transition: transform 0.15s ease;
	}

	.download-split-btn:hover {
		transform: scale(1.025);
		box-shadow:
			0 0 20px color-mix(in srgb, var(--blurpleColor) 40%, transparent),
			0 10px 40px -20px color-mix(in srgb, var(--blurpleColor) 60%, transparent);
	}

	.download-split-btn:has(:active) {
		transform: scale(0.98);
	}

	.download-main {
		display: inline-flex;
		align-items: center;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: var(--whiteEnforced);
		background: none;
		border: none;
		cursor: pointer;
		line-height: 1;
	}

	.download-divider {
		width: 1px;
		background-color: color-mix(in srgb, var(--whiteEnforced) 25%, transparent);
		align-self: stretch;
		flex-shrink: 0;
	}

	.download-chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 8px;
	}

	.download-chevron-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 2px;
	}

	/* ── Dropdown panel ─────────────────────────────────────────── */
	:global(.download-dropdown) {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 240px;
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
		width: 140px;
		height: 20rem;
		border-radius: 0.75rem;
		flex-shrink: 0;
		object-fit: cover;
		object-position: center top;
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
