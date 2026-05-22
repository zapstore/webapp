<script lang="js">
	import ProfileBrowseSection from '$lib/components/profile/ProfileBrowseSection.svelte';

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {{
	 *   apps?: import('$lib/nostr/models').App[],
	 *   appsLoading?: boolean,
	 *   stackCards?: Record<string, unknown>[],
	 *   stacksLoading?: boolean,
	 *   getAppUrl?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackUrl?: (stack: Record<string, unknown>) => string,
	 *   appsCarousel?: { scroll: (direction: number) => void } | null,
	 *   stacksCarousel?: { scroll: (direction: number) => void } | null,
	 *   onAppsUiChange?: (ui: CarouselUi) => void,
	 *   onStacksUiChange?: (ui: CarouselUi) => void
	 * }} */
	let {
		apps = [],
		appsLoading = false,
		stackCards = [],
		stacksLoading = false,
		getAppUrl = () => '#',
		getStackUrl = () => '#',
		appsCarousel = $bindable(/** @type {{ scroll: (direction: number) => void } | null} */ (null)),
		stacksCarousel = $bindable(/** @type {{ scroll: (direction: number) => void } | null} */ (null)),
		onAppsUiChange = () => {},
		onStacksUiChange = () => {}
	} = $props();
</script>

<div class="profile-apps-sections">
	<ProfileBrowseSection
		title="Published Apps"
		variant="apps"
		items={apps}
		loading={appsLoading}
		emptyMessage="No apps published"
		bind:carousel={appsCarousel}
		onUiChange={onAppsUiChange}
		{getAppUrl}
		{getStackUrl}
	/>

	<ProfileBrowseSection
		title="Stacks"
		variant="stacks"
		items={stackCards}
		loading={stacksLoading}
		emptyMessage="No stacks created"
		bind:carousel={stacksCarousel}
		onUiChange={onStacksUiChange}
		{getAppUrl}
		{getStackUrl}
	/>
</div>

<style>
	.profile-apps-sections {
		padding: 0;
		margin: 0;
	}

	.profile-apps-sections :global(.profile-browse-section:first-child .section-header) {
		padding-top: 24px;
	}

	.profile-apps-sections :global(.profile-browse-section + .profile-browse-section) {
		margin-top: 24px;
	}
</style>
