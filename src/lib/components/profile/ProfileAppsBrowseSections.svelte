<script lang="js">
	import '$lib/styles/browse-grid.css';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	const SKELETON_COUNT = 2;

	/** @type {{
	 *   apps?: import('$lib/nostr/models').App[],
	 *   appsLoading?: boolean,
	 *   stackCards?: Record<string, unknown>[],
	 *   stacksLoading?: boolean,
	 *   getAppUrl?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackUrl?: (stack: Record<string, unknown>) => string
	 * }} */
	let {
		apps = [],
		appsLoading = false,
		stackCards = [],
		stacksLoading = false,
		getAppUrl = () => '#',
		getStackUrl = () => '#'
	} = $props();

	const appsTwoCol = $derived(appsLoading ? SKELETON_COUNT > 1 : apps.length > 1);
	const stacksTwoCol = $derived(stacksLoading ? SKELETON_COUNT > 1 : stackCards.length > 1);
</script>

<div class="profile-apps-sections">
	<section class="profile-apps-section">
		<SectionHeader title="Published Apps" />
		{#if appsLoading}
			<ul
				class="browse-grid"
				class:browse-grid--two-col={appsTwoCol}
				role="list"
				aria-hidden="true"
			>
				{#each Array(SKELETON_COUNT) as _, i (i)}
					<li class="browse-grid-item browse-grid-item--app">
						<AppSearchHitRowSkeleton variant={i} showDescription={true} showChevron={false} />
					</li>
				{/each}
			</ul>
		{:else if apps.length === 0}
			<p class="profile-apps-empty">No apps published</p>
		{:else}
			<ul class="browse-grid" class:browse-grid--two-col={appsTwoCol} role="list">
				{#each apps as app (app.id)}
					<li class="browse-grid-item browse-grid-item--app">
						<AppSmallCard {app} href={getAppUrl(app)} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="profile-apps-section profile-apps-section--stacks">
		<SectionHeader title="Stacks" />
		{#if stacksLoading}
			<ul
				class="browse-grid"
				class:browse-grid--two-col={stacksTwoCol}
				role="list"
				aria-hidden="true"
			>
				{#each Array(SKELETON_COUNT) as _, i (i)}
					<li class="browse-grid-item">
						<div class="profile-stacks-skeleton">
							<div class="profile-stacks-skeleton-grid"><SkeletonLoader /></div>
							<div class="profile-stacks-skeleton-info">
								<div class="profile-stacks-skeleton-name"><SkeletonLoader /></div>
								<div class="profile-stacks-skeleton-line"></div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else if stackCards.length === 0}
			<p class="profile-apps-empty">No stacks created</p>
		{:else}
			<ul class="browse-grid" class:browse-grid--two-col={stacksTwoCol} role="list">
				{#each stackCards as stack (`${stack.pubkey}:${stack.dTag}`)}
					<li class="browse-grid-item">
						<AppStackCard {stack} href={getStackUrl(stack)} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.profile-apps-sections {
		padding: 0;
		margin: 0;
	}

	.profile-apps-section--stacks {
		margin-top: 24px;
	}

	.profile-apps-section:first-child :global(.section-header) {
		padding-top: 24px;
	}

	.profile-apps-section :global(.section-header) {
		padding-left: var(--detail-pad-x, 12px);
		padding-right: var(--detail-pad-x, 12px);
		padding-top: 0;
		padding-bottom: 0;
		margin: 0 0 12px;
	}

	.profile-apps-empty {
		margin: 0;
		padding: 40px 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		width: 100%;
	}

	.profile-stacks-skeleton {
		display: flex;
		gap: 16px;
		align-items: stretch;
	}

	.profile-stacks-skeleton-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.profile-stacks-skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
	}

	.profile-stacks-skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.profile-stacks-skeleton-line {
		width: 140px;
		height: 10px;
		border-radius: 12px;
		background: var(--gray33);
	}

	@media (min-width: 768px) {
		.profile-stacks-skeleton-grid {
			width: 104px;
			height: 104px;
		}
	}
</style>
