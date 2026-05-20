<script lang="js">
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { ChevronRight } from '$lib/components/icons';
	import { appSearchHitSkeletonPreset } from './app-search-hit-skeleton-presets.js';

	let { variant = 0, showChevron = true, showDescription = false, iconSize = 'lg' } = $props();

	const preset = $derived(appSearchHitSkeletonPreset(variant));
	const titleWidth = $derived(`${preset.titleWidthPx}px`);
	const profileNameWidth = $derived(`${preset.profileNameWidthPx}px`);
	const descriptionWidth = $derived(`${preset.descriptionWidthPx}px`);
	/** Match AppPic sizeMap (sm/md/lg). */
	const iconPx = $derived(
		({ sm: 38, md: 48, lg: 56, xl: 72 })[iconSize] ?? 56
	);
	const iconRadius = $derived(iconPx >= 48 ? 16 : iconPx === 28 ? 6 : 8);
</script>

<!--
  Search hit placeholder — shimmer on app icon + title only.
  Publisher + one description line: static --white8 blocks.
  Four fixed presets (app-search-hit-skeleton-presets.js).
-->
{#if showDescription}
	<div class="app-search-hit-skeleton app-search-hit-skeleton--expanded" aria-hidden="true">
		<div class="app-search-hit-skeleton-expanded-row">
			<div
				class="app-search-hit-skeleton-icon"
				style="width: {iconPx}px; height: {iconPx}px; border-radius: {iconRadius}px;"
			>
				<SkeletonLoader />
			</div>
			<div class="app-search-hit-skeleton-text">
				<div class="app-search-hit-skeleton-title" style="width: {titleWidth};">
					<SkeletonLoader />
				</div>
				<div class="app-search-hit-skeleton-author">
					<div class="app-search-hit-skeleton-avatar"></div>
					<div
						class="app-search-hit-skeleton-byline"
						style="width: {profileNameWidth};"
					></div>
				</div>
			</div>
		</div>
		<div
			class="app-search-hit-skeleton-desc-line"
			style="width: {descriptionWidth};"
		></div>
	</div>
{:else}
	<div
		class="app-search-hit-skeleton"
		class:app-search-hit-skeleton--compact={iconSize !== 'lg'}
		aria-hidden="true"
	>
		<div class="app-search-hit-skeleton-main">
			<div
				class="app-search-hit-skeleton-icon"
				style="width: {iconPx}px; height: {iconPx}px; border-radius: {iconRadius}px;"
			>
				<SkeletonLoader />
			</div>
			<div class="app-search-hit-skeleton-text">
				<div class="app-search-hit-skeleton-title" style="width: {titleWidth};">
					<SkeletonLoader />
				</div>
				<div class="app-search-hit-skeleton-author">
					<div class="app-search-hit-skeleton-avatar"></div>
					<div
						class="app-search-hit-skeleton-byline"
						style="width: {profileNameWidth};"
					></div>
				</div>
			</div>
		</div>
		{#if showChevron}
			<ChevronRight
				variant="outline"
				color="var(--white33)"
				size={14}
				strokeWidth={1.4}
				className="app-search-hit-skeleton-chevron flex-shrink-0"
			/>
		{/if}
	</div>
{/if}

<style>
	.app-search-hit-skeleton {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 14px;
		margin: 0;
		min-width: 0;
		pointer-events: none;
		box-sizing: border-box;
	}

	.app-search-hit-skeleton--expanded {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 0;
		width: 100%;
	}

	.app-search-hit-skeleton-expanded-row {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
		width: 100%;
	}

	.app-search-hit-skeleton-main {
		display: flex;
		align-items: stretch;
		flex: 1;
		min-width: 0;
		gap: 16px;
	}

	.app-search-hit-skeleton-icon {
		flex-shrink: 0;
		overflow: hidden;
		display: flex;
		align-items: center;
	}

	.app-search-hit-skeleton--compact {
		gap: 12px;
		padding: 0;
	}

	.app-search-hit-skeleton-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
		align-items: flex-start;
	}

	.app-search-hit-skeleton-title {
		height: 20px;
		border-radius: 12px;
		overflow: hidden;
		max-width: 100%;
	}

	.app-search-hit-skeleton-author {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 20px;
		min-width: 0;
		max-width: 100%;
	}

	.app-search-hit-skeleton-avatar {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		border-radius: 50%;
		background-color: var(--white8);
	}

	.app-search-hit-skeleton-byline {
		height: 14px;
		flex-shrink: 0;
		border-radius: 6px;
		background-color: var(--white8);
		max-width: 100%;
	}

	.app-search-hit-skeleton-desc-line {
		width: 100%;
		height: 12px;
		border-radius: 6px;
		background-color: var(--white8);
		max-width: 100%;
	}

	.app-search-hit-skeleton-chevron :global(svg) {
		display: block;
	}
</style>
