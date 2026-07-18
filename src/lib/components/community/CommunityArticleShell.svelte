<script lang="js">
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import Timestamp from '$lib/components/common/Timestamp.svelte';

	let {
		publisherPic = null,
		publisherName = '',
		publisherNameForPic = undefined,
		publisherPubkey = null,
		publisherUrl = '#',
		timestamp = null,
		actions,
		/** Rendered between publisher row and main content (e.g. blog hero image). */
		leading,
		content
	} = $props();

	const nameForPic = $derived(
		publisherNameForPic !== undefined ? publisherNameForPic : publisherName
	);
</script>

<div class="community-article-detail">
	<div class="floating-actions-fixed">
		{@render actions()}
	</div>

	<div class="content-scroll" data-main-scroll>
		<div class="content-inner">
			<div class="publisher-row">
				<a href={publisherUrl} class="publisher-link">
					<ProfilePic
						pictureUrl={publisherPic}
						name={nameForPic}
						pubkey={publisherPubkey}
						size="bubble"
					/>
					<span class="publisher-name">{publisherName}</span>
				</a>
				{#if timestamp}
					<Timestamp {timestamp} size="xs" className="publisher-timestamp" />
				{/if}
				<div class="actions-placeholder" aria-hidden="true"></div>
			</div>

			{#if leading}
				<div class="article-leading">
					{@render leading()}
				</div>
			{/if}

			{@render content()}
		</div>
	</div>
</div>

<style>
	.community-article-detail {
		--page-content-pad-x: 12px;
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	@media (min-width: 768px) {
		.community-article-detail {
			--page-content-pad-x: 20px;
		}
	}

	.floating-actions-fixed {
		position: absolute;
		top: 12px;
		right: var(--page-content-pad-x);
		width: 32px;
		height: 32px;
		z-index: 10;
		pointer-events: auto;
	}

	.floating-actions-fixed :global(.detail-content-actions-btn) {
		background: color-mix(in srgb, var(--gray33) 72%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
	}

	.content-scroll {
		flex: 1;
		overflow-x: hidden;
		padding-bottom: 32px;
	}

	.content-inner {
		padding: 0 0 16px;
		max-width: 100%;
	}

	.publisher-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px var(--page-content-pad-x) 10px;
		min-height: 48px;
	}

	.publisher-link {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
		color: inherit;
		text-decoration: none;
	}

	.publisher-link:hover {
		opacity: 0.85;
	}

	.publisher-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.publisher-row :global(.publisher-timestamp) {
		flex-shrink: 0;
		color: var(--white33);
	}

	.actions-placeholder {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	.article-leading {
		padding: 0 var(--page-content-pad-x) 12px;
	}
</style>
