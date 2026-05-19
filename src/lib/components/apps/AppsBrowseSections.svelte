<script lang="js">
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppsPageCarousel from '$lib/components/apps/AppsPageCarousel.svelte';
	import { DISCOVER_APPS_INITIAL, DISCOVER_STACKS_INITIAL } from '$lib/constants';

	const APPS_PER_PANEL = 2;
	const STACKS_PER_PANEL = 2;
	const RELEASES_SKELETON_PANELS = DISCOVER_APPS_INITIAL / APPS_PER_PANEL;
	const STACKS_SKELETON_PANELS = DISCOVER_STACKS_INITIAL / STACKS_PER_PANEL;

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {{
	 *   hidden?: boolean,
	 *   apps?: import('$lib/nostr/models').App[],
	 *   appColumns?: import('$lib/nostr/models').App[][],
	 *   stackColumns?: Record<string, unknown>[][],
	 *   stacksSettled?: boolean,
	 *   resolvedDisplayStacks?: Record<string, unknown>[],
	 *   appsLoadingMore?: boolean,
	 *   stacksLoadingMore?: boolean,
	 *   getAppUrl?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackUrl?: (stack: Record<string, unknown>) => string,
	 *   onLoadMoreApps?: () => void,
	 *   onLoadMoreStacks?: () => void,
	 *   releasesCarousel?: { scroll: (direction: number) => void } | null,
	 *   stacksCarousel?: { scroll: (direction: number) => void } | null,
	 *   onReleasesUiChange?: (ui: CarouselUi) => void,
	 *   onStacksUiChange?: (ui: CarouselUi) => void
	 * }} */
	let {
		hidden = false,
		apps = [],
		appColumns = [],
		stackColumns = [],
		stacksSettled = false,
		resolvedDisplayStacks = [],
		appsLoadingMore = false,
		stacksLoadingMore = false,
		getAppUrl = () => '#',
		getStackUrl = () => '#',
		onLoadMoreApps = () => {},
		onLoadMoreStacks = () => {},
		releasesCarousel = $bindable(/** @type {{ scroll: (direction: number) => void } | null} */ (null)),
		stacksCarousel = $bindable(/** @type {{ scroll: (direction: number) => void } | null} */ (null)),
		onReleasesUiChange = () => {},
		onStacksUiChange = () => {}
	} = $props();

	const browseActive = $derived(!hidden);
	const appsLoading = $derived(apps.length === 0);
	const stacksLoading = $derived(resolvedDisplayStacks.length === 0 && !stacksSettled);
</script>

<div class="apps-home-sections" class:hidden={hidden} aria-hidden={hidden}>
	<section class="apps-home-section">
		<SectionHeader title="Latest Releases" />
		<AppsPageCarousel
			bind:this={releasesCarousel}
			active={browseActive}
			variant="apps"
			panels={appColumns}
			loading={appsLoading}
			loadingMore={appsLoadingMore}
			skeletonPanels={RELEASES_SKELETON_PANELS}
			skeletonItemsPerPanel={APPS_PER_PANEL}
			getAppHref={getAppUrl}
			onNearEnd={onLoadMoreApps}
			onUiChange={onReleasesUiChange}
		/>
	</section>

	<section class="apps-home-section stacks-section">
		<SectionHeader title="Stacks" linkText="See more" href="/stacks" />
		<AppsPageCarousel
			bind:this={stacksCarousel}
			active={browseActive}
			variant="stacks"
			panels={stackColumns}
			loading={stacksLoading}
			loadingMore={stacksLoadingMore}
			skeletonPanels={STACKS_SKELETON_PANELS}
			skeletonItemsPerPanel={STACKS_PER_PANEL}
			getStackHref={getStackUrl}
			onNearEnd={onLoadMoreStacks}
			onUiChange={onStacksUiChange}
		/>
	</section>
</div>

<style>
	.apps-home-sections.hidden {
		display: none;
	}

	.apps-home-sections {
		padding-top: 32px;
		padding-bottom: 0;
	}

	.apps-home-section {
		margin-bottom: 24px;
	}

	.apps-home-section.stacks-section {
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.apps-home-section :global(.section-header) {
		padding-left: var(--apps-pad-x);
		padding-right: var(--apps-pad-x);
	}

	.stacks-section :global(.section-header) {
		margin-bottom: 12px;
	}

	.apps-home-section:not(.stacks-section) :global(.section-header) {
		margin-bottom: 20px;
	}

	@media (max-width: 767px) {
		.apps-home-section:not(.stacks-section) :global(.section-header) {
			margin-bottom: 18px;
		}
	}
</style>
