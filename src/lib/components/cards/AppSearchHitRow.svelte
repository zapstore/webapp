<script lang="js">
	import AppPic from '$lib/components/common/AppPic.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import { ChevronRight, Index } from '$lib/components/icons';
	import { ZAPSTORE_PUBKEY } from '$lib/services/profile-search';
	import { nip19 } from 'nostr-tools';
	import { htmlToPlainTextLine, markdownToPlainTextLine } from '$lib/utils/markdown';

	let {
		app,
		authorProfile = undefined,
		onNavigate = () => {},
		className = '',
		showDescription = false
	} = $props();

	function plainDescription(/** @type {typeof app} */ appData) {
		if (appData.description) return markdownToPlainTextLine(appData.description);
		if (appData.descriptionHtml) return htmlToPlainTextLine(appData.descriptionHtml);
		return '';
	}

	const descriptionText = $derived.by(() => {
		if (!showDescription) return '';
		return plainDescription(app);
	});

	const isZapstoreOfficialAppId = $derived(!!app?.dTag && app.dTag.startsWith('dev.zapstore.'));
	const isZapstorePublisher = $derived(
		!!app?.pubkey &&
			!!ZAPSTORE_PUBKEY &&
			app.pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase()
	);
	/** Zapstore catalog republish — show Indexed (same rule as app detail). */
	const isIndexerEntry = $derived(isZapstorePublisher && !isZapstoreOfficialAppId);

	const authorDisplay = $derived.by(() => {
		if (isIndexerEntry) return '';
		const n =
			(authorProfile?.displayName ?? '').trim() || (authorProfile?.name ?? '').trim() || '';
		if (n) return n;
		try {
			return nip19.npubEncode(app.pubkey);
		} catch {
			return 'Unknown';
		}
	});

	const profilePicName = $derived(
		authorProfile?.displayName || authorProfile?.name || null
	);
	const awaitingProfile = $derived(!isIndexerEntry && authorProfile === undefined);
</script>

{#snippet titleMeta()}
	<span class="app-search-hit-title">{app.name || app.dTag}</span>
	{#if isIndexerEntry}
		<div class="app-search-hit-indexed-tile">
			<Index size={14} className="flex-shrink-0" useWhite33={true} />
			<span class="indexed-label">Indexed</span>
		</div>
	{:else}
		<div class="app-search-hit-author-row">
			<span class="app-search-hit-pp">
				<ProfilePic
					pictureUrl={authorProfile?.picture}
					name={profilePicName}
					pubkey={app.pubkey}
					size="xs"
					loading={awaitingProfile}
					className="app-search-hit-profile-pic"
				/>
			</span>
			<span class="app-search-hit-byline">By {authorDisplay}</span>
		</div>
	{/if}
{/snippet}

{#snippet iconCell()}
	<div class="app-search-hit-icon">
		<AppPic iconUrl={app.icon} name={app.name} identifier={app.dTag} size="lg" />
	</div>
{/snippet}

{#if showDescription}
	<a
		class="app-search-hit app-search-hit--expanded {className}"
		href="/apps/{app.dTag}"
		onclick={onNavigate}
		data-sveltekit-preload-data="hover"
	>
		<div class="app-search-hit-expanded-row">
			{@render iconCell()}
			<div class="app-search-hit-text">
				{@render titleMeta()}
			</div>
		</div>
		<p
			class="app-search-hit-description-full"
			class:app-search-hit-description-empty={!descriptionText}
		>
			{descriptionText || 'No description'}
		</p>
	</a>
{:else}
	<a
		class="app-search-hit {className}"
		href="/apps/{app.dTag}"
		onclick={onNavigate}
		data-sveltekit-preload-data="hover"
	>
		<div class="app-search-hit-main">
			{@render iconCell()}
			<div class="app-search-hit-text">
				{@render titleMeta()}
			</div>
		</div>
		<ChevronRight
			variant="outline"
			color="var(--white33)"
			size={14}
			strokeWidth={1.4}
			className="app-search-hit-chevron flex-shrink-0"
		/>
	</a>
{/if}

<style>
	.app-search-hit {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px;
		margin: 0;
		border-radius: 0;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		min-width: 0;
		transition: background-color 0.15s ease;
	}

	.app-search-hit-main {
		display: flex;
		align-items: stretch;
		flex: 1;
		min-width: 0;
		gap: 16px;
	}

	.app-search-hit:hover {
		background-color: var(--white4);
	}

	.app-search-hit-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.app-search-hit :global(.app-pic:hover),
	.app-search-hit :global(.app-pic:active) {
		transform: none;
	}

	.app-search-hit :global(.app-search-hit-profile-pic.profile-pic:hover),
	.app-search-hit :global(.app-search-hit-profile-pic.profile-pic:active) {
		transform: none;
	}

	.app-search-hit-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
	}

	.app-search-hit-title {
		font-weight: 600;
		font-size: 1rem;
		line-height: 1.25;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.app-search-hit-indexed-tile {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 20px;
		height: 20px;
		min-width: 0;
	}

	.indexed-label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25;
		color: var(--white33);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.app-search-hit-byline {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25;
		color: var(--white66);
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.app-search-hit-author-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.app-search-hit-pp {
		flex-shrink: 0;
		display: flex;
	}

	.app-search-hit-pp :global(.app-search-hit-profile-pic) {
		cursor: default;
		pointer-events: none;
	}

	.app-search-hit-chevron :global(svg) {
		display: block;
	}

	/* ── Full-page search (/apps?q): plain rows, description as second horizontal band ── */
	.app-search-hit--expanded {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 0;
		align-self: stretch;
	}

	.app-search-hit--expanded:hover {
		background-color: transparent;
	}

	.app-search-hit-expanded-row {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
	}

	.app-search-hit-description-full {
		margin: 0;
		width: 100%;
		min-width: 0;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25;
		color: var(--white33);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (min-width: 768px) {
		.app-search-hit-description-full {
			-webkit-line-clamp: 1;
		}
	}

	.app-search-hit-description-empty {
		color: var(--white16);
	}
</style>
