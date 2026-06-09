<script lang="js">
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import { profileDisplayLabel } from '$lib/utils/npub-display.js';

	let {
		author = { name: null, displayName: null, picture: '', pubkey: '', npub: '' },
		title = '',
		summary = '',
		timestamp = '',
		/** Card / hero image URL (og-image, cover, etc.) */
		cardImage = null,
		onClick = () => {}
	} = $props();

	const displayName = $derived(
		profileDisplayLabel({ displayName: author.displayName, name: author.name }, author.pubkey)
	);

	function formatDateTime(ts) {
		if (ts == null || ts === '') return '';
		const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
		if (Number.isNaN(date.getTime())) return '';
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);
		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<div
	class="blog-post-card"
	role="button"
	tabindex="0"
	onclick={onClick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onClick())}
>
	<div class="card-layout">
		<div class="image-column">
			{#if cardImage}
				<div class="card-image-wrap">
					<img class="card-image" src={cardImage} alt="" loading="lazy" />
				</div>
			{:else}
				<div class="card-image-wrap card-image-placeholder" aria-hidden="true"></div>
			{/if}
		</div>

		<div class="text-column">
			<div class="meta-row">
				<div class="author-inline">
					<ProfilePic
						pictureUrl={author.picture}
						name={author.name}
						pubkey={author.pubkey || author.npub}
						size="sm"
					/>
					<span class="author-name">{displayName}</span>
				</div>
				{#if timestamp}
					<span class="timestamp">{formatDateTime(timestamp)}</span>
				{/if}
			</div>

			{#if title}
				<h3 class="post-title">{title}</h3>
			{/if}

			{#if summary}
				<p class="post-summary">{summary}</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.blog-post-card {
		display: block;
		width: 100%;
		padding: 16px;
		border: none;
		border-bottom: 1px solid var(--shell-border);
		background: transparent;
		cursor: pointer;
		text-align: left;
	}

	.blog-post-card:hover,
	.blog-post-card:focus {
		background: transparent;
		outline: none;
	}

	.card-layout {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 640px) {
		.card-layout {
			flex-direction: row;
			align-items: flex-start;
			gap: 14px;
		}
	}

	.image-column {
		flex-shrink: 0;
		width: 100%;
	}

	@media (min-width: 640px) {
		.image-column {
			width: 38.2%;
			max-width: 200px;
		}
	}

	.card-image-wrap {
		width: 100%;
		aspect-ratio: 1.618 / 1;
		border-radius: 12px;
		border: 0.33px solid var(--white16);
		overflow: hidden;
		background: var(--gray33);
	}

	.card-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card-image-placeholder {
		background: var(--gray33);
	}

	.text-column {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
		justify-content: flex-start;
		align-self: flex-start;
	}

	.meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
		padding-top: 2px;
	}

	.author-inline {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		flex: 1;
	}

	.author-inline :global(.profile-pic) {
		--size: 26px;
		--font-size: 15px;
	}

	.author-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timestamp {
		font-size: 0.75rem;
		color: var(--white33);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.post-title {
		margin: 0;
		font-size: 1.1875rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--white);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.post-summary {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--white66);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
