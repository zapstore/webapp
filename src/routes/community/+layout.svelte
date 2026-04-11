<script lang="js">
	/**
	 * Community layout — sidebar + content. Section derived from URL.
	 */
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { nip19 } from 'nostr-tools';
	import { ChevronDown } from '$lib/components/icons';
	import { COMMUNITY_FORUM_AND_ACTIVITY_ENABLED } from '$lib/constants.js';
	import {
		ZAPSTORE_COMMUNITY_PUBKEY,
		ZAPSTORE_COMMUNITY_NPUB,
		EVENT_KINDS,
		FORUM_RELAY,
		DEFAULT_CATALOG_RELAYS,
		PLATFORM_FILTER
	} from '$lib/config.js';
	import { fetchFromRelays, queryEvents, putEvents } from '$lib/nostr';
	import { getCurrentPubkey, getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { isLegacyRelease, stackNeedsMigration } from '$lib/nostr/migration';
	import CommunityForumShell from '$lib/components/community/CommunityForumShell.svelte';
	import CommunityActivityShell from '$lib/components/community/CommunityActivityShell.svelte';
	import CommunityMigrationShell from '$lib/components/community/CommunityMigrationShell.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import DetailsTab from '$lib/components/social/DetailsTab.svelte';

	let detailsModalOpen = $state(false);
	let termsModalOpen = $state(false);

	// ── Migration count (for sidebar badge) ──────────────────────────────────
	let migrationCount = $state(0);
	const pubkey = $derived(getCurrentPubkey());
	const isSignedIn = $derived(getIsSignedIn());

	// Check migration count whenever user accesses /community or any nested route
	$effect(() => {
		if (!browser || !isSignedIn || !pubkey) {
			migrationCount = 0;
			return;
		}

		// Trigger check when accessing any /community route
		const currentPath = $page.url.pathname;
		if (!currentPath.startsWith('/community')) {
			return;
		}

		let cancelled = false;

		(async () => {
			let count = 0;

			try {
				// Check for legacy apps
				const apps = await fetchFromRelays(
					DEFAULT_CATALOG_RELAYS,
					{ kinds: [EVENT_KINDS.APP], authors: [pubkey], ...PLATFORM_FILTER, limit: 50 },
					{ timeout: 8000, feature: 'migration-count-apps' }
				);

				for (const app of apps) {
					if (cancelled) return;
					const aTag = app.tags.find((t) => t[0] === 'a')?.[1];
					if (!aTag?.startsWith('30063:')) continue;

					const parts = aTag.split(':');
					if (parts.length < 3) continue;
					const relPubkey = parts[1];
					const dTag = parts.slice(2).join(':');

					const releases = await fetchFromRelays(
						DEFAULT_CATALOG_RELAYS,
						{ kinds: [EVENT_KINDS.RELEASE], authors: [relPubkey], '#d': [dTag], limit: 1 },
						{ timeout: 3000, feature: 'migration-count-release' }
					);
					if (!releases.length) continue;

					const release = releases[0];
					const artifactIds = release.tags
						.filter((t) => t[0] === 'e' || t[0] === 'E')
						.map((t) => t[1]);
					if (!artifactIds.length) continue;

					const artifacts = await fetchFromRelays(
						DEFAULT_CATALOG_RELAYS,
						{ ids: artifactIds, limit: artifactIds.length },
						{ timeout: 3000, feature: 'migration-count-artifacts' }
					);
					if (!artifacts.length) continue;

					if (isLegacyRelease(release, artifacts)) {
						count++;
					}
				}

				// Check for legacy stacks
				const stacks = await fetchFromRelays(
					DEFAULT_CATALOG_RELAYS,
					{ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey], limit: 50 },
					{ timeout: 5000, feature: 'migration-count-stacks' }
				);

				for (const stack of stacks) {
					if (stackNeedsMigration(stack)) {
						count++;
					}
				}

				if (!cancelled) {
					migrationCount = count;
				}
			} catch (e) {
				console.warn('[Community] Migration count check failed:', e);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// ── Community Details modal data ─────────────────────────────────────────
	let communityEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let communityDetailsLoading = $state(false);

	const communityNevent = $derived.by(() => {
		if (!communityEvent?.id) return '';
		try {
			return nip19.neventEncode({
				id: communityEvent.id,
				kind: EVENT_KINDS.COMMUNITY,
				author: communityEvent.pubkey,
				relays: [FORUM_RELAY]
			});
		} catch { return ''; }
	});

	$effect(() => {
		if (!browser || !detailsModalOpen) return;
		let cancelled = false;
		communityDetailsLoading = true;

		(async () => {
			try {
				let [ev] = await queryEvents({
					kinds: [EVENT_KINDS.COMMUNITY],
					authors: [ZAPSTORE_COMMUNITY_PUBKEY],
					limit: 1
				});
				if (!ev) {
					const evs = await fetchFromRelays(
						[FORUM_RELAY],
						{ kinds: [EVENT_KINDS.COMMUNITY], authors: [ZAPSTORE_COMMUNITY_PUBKEY], limit: 1 },
						{ timeout: 5000, feature: 'community-details' }
					);
					ev = evs[0] ?? null;
					if (ev) await putEvents([ev]);
				}
				if (!cancelled) communityEvent = ev ?? null;
			} catch (e) {
				console.warn('[Community] Details modal load failed:', e);
			} finally {
				if (!cancelled) communityDetailsLoading = false;
			}
		})();

		return () => { cancelled = true; };
	});

	let { children } = $props();

	const SECTIONS = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED
		? [
				{
					id: 'forum',
					label: 'Forum',
					icon: '/images/emoji/forum.png',
					href: '/community/forum'
				},
				{
					id: 'activity',
					label: 'Activity',
					icon: '/images/emoji/activity.png',
					href: '/community/activity'
				},
				{
					id: 'migration',
					label: 'Migration',
					icon: '/images/emoji/repo.png',
					href: '/community/migration'
				}
			]
		: [
				{
					id: 'support',
					label: 'Support',
					icon: '/images/emoji/activity.png',
					href: '/community/support'
				},
				{
					id: 'migration',
					label: 'Migration',
					icon: '/images/emoji/repo.png',
					href: '/community/migration'
				}
			];

	const defaultSectionId = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? 'forum' : 'support';

	const path = $derived($page.url.pathname);
	/** Forum list only — post detail uses `{@render children()}`. */
	const isCommunityForumFeed = $derived(path === '/community/forum' || path === '/community/forum/');
	const isCommunityActivity = $derived(
		path === '/community/activity' || path.startsWith('/community/activity/')
	);
	const isCommunityMigration = $derived(
		path === '/community/migration' || path.startsWith('/community/migration/')
	);
	let forumShellMounted = $state(false);
	let activityShellMounted = $state(false);
	let migrationShellMounted = $state(false);

	$effect(() => {
		if (!COMMUNITY_FORUM_AND_ACTIVITY_ENABLED) return;
		if (isCommunityForumFeed) forumShellMounted = true;
		if (isCommunityActivity) activityShellMounted = true;
	});

	$effect(() => {
		if (isCommunityMigration) migrationShellMounted = true;
	});

	const activeSection = $derived(
		path.startsWith('/community/forum')
			? 'forum'
			: path.startsWith('/community/support')
				? 'support'
				: path.startsWith('/community/activity')
					? 'activity'
					: path.startsWith('/community/migration')
						? 'migration'
						: defaultSectionId
	);
	const activeSectionLabel = $derived(
		SECTIONS.find((s) => s.id === activeSection)?.label ??
			(COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? 'Forum' : 'Support')
	);

	let sectionMenuOpen = $state(false);

	function toggleSectionMenu() {
		sectionMenuOpen = !sectionMenuOpen;
	}

	function closeSectionMenu() {
		sectionMenuOpen = false;
	}

	function onKeydown(e) {
		if (e.key === 'Escape') {
			sectionMenuOpen = false;
		}
	}

	const hideOutletForShell = $derived(
		(COMMUNITY_FORUM_AND_ACTIVITY_ENABLED && (isCommunityForumFeed || isCommunityActivity)) ||
			isCommunityMigration
	);
</script>

<svelte:head>
	{#if path.startsWith('/community/support')}
		<title>Support — Zapstore</title>
	{/if}
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Section switcher — mobile only: anchored dropdown below header, does not cover site nav -->
		<div class="section-switcher">
			<button
				type="button"
				class="section-switcher-zone"
				onclick={toggleSectionMenu}
				aria-expanded={sectionMenuOpen}
				aria-haspopup="true"
			>
				<span class="section-switcher-label">
					{activeSectionLabel}
					{#if activeSection === 'migration' && migrationCount > 0}
						<span class="migration-badge">{migrationCount}</span>
					{/if}
				</span>
				<span class="section-chevron" class:open={sectionMenuOpen}>
					<ChevronDown variant="outline" color="hsl(var(--white33))" size={14} strokeWidth={1.4} />
				</span>
			</button>
			{#if sectionMenuOpen}
				<div class="section-switcher-dropdown" role="dialog" aria-modal="true" aria-label="Community sections">
					<div class="section-switcher-content">
						{#each SECTIONS as section}
							<a
								href={section.href}
								class="section-item"
								class:active={activeSection === section.id}
								onclick={closeSectionMenu}
							>
								{#if section.icon}
									<img src={section.icon} alt="" class="section-item-icon" />
								{/if}
								{section.label}
								{#if section.id === 'migration' && migrationCount > 0}
									<span class="migration-badge">{migrationCount}</span>
								{/if}
							</a>
						{/each}
					</div>
					<button
						type="button"
						class="section-switcher-rest"
						onclick={closeSectionMenu}
						aria-label="Close menu"
					></button>
				</div>
			{/if}
		</div>

		<!-- Sidebar — desktop only -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each SECTIONS as section}
					<a
						href={section.href}
						class="nav-item"
						class:active={activeSection === section.id}
					>
						<span class="icon-wrap" class:icon-emoji={!!section.icon}>
							{#if section.icon}
								<img src={section.icon} alt="" class="section-icon" />
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
								</svg>
							{/if}
						</span>
						<span class="nav-label">{section.label}</span>
						{#if section.id === 'migration' && migrationCount > 0}
							<span class="migration-badge">{migrationCount}</span>
						{/if}
					</a>
				{/each}
			</nav>

			<!-- Community section — pinned to bottom of sidebar -->
			<div class="sidebar-section">
				<span class="eyebrow-label section-eyebrow">Community</span>
				<button type="button" class="nav-item" onclick={() => (detailsModalOpen = true)}>
					<span class="nav-label">Details</span>
				</button>
				<button type="button" class="nav-item" onclick={() => (termsModalOpen = true)}>
					<span class="nav-label">Terms of Service</span>
				</button>
			</div>
		</aside>

		<Modal bind:open={detailsModalOpen} title="Details" ariaLabel="Community details" align="bottom" wide>
			<div class="modal-sheet-body">
				{#if communityDetailsLoading && !communityEvent}
					<p class="modal-sheet-loading">Loading…</p>
				{:else}
					<DetailsTab
						shareableId={communityNevent}
						publicationLabel="Community"
						npub={ZAPSTORE_COMMUNITY_NPUB}
						pubkey={ZAPSTORE_COMMUNITY_PUBKEY}
						rawData={communityEvent}
						panelBackground="black33"
					/>
				{/if}
			</div>
		</Modal>

		<Modal bind:open={termsModalOpen} title="Terms of Service" ariaLabel="Terms of service" align="bottom" wide>
			<div class="modal-sheet-body">
				<ol class="tos-list">
					<li>
						<strong>Be respectful.</strong>
						<span>No harassment, hate speech, or personal attacks.</span>
					</li>
					<li>
						<strong>Stay on topic.</strong>
						<span>Posts should relate to apps, Nostr, or open-source software.</span>
					</li>
					<li>
						<strong>No spam.</strong>
						<span>No repeated posts, unsolicited promotions, or low-effort content.</span>
					</li>
					<li>
						<strong>No illegal content.</strong>
						<span>Do not share anything unlawful or harmful.</span>
					</li>
				</ol>
			</div>
		</Modal>

		<div class="content right-page-viewport">
			{#if COMMUNITY_FORUM_AND_ACTIVITY_ENABLED}
				{#if forumShellMounted}
					<div
						class="community-shell-panel"
						class:community-shell-panel--active={isCommunityForumFeed}
						aria-hidden={!isCommunityForumFeed}
					>
						<CommunityForumShell />
					</div>
				{/if}
				{#if activityShellMounted}
					<div
						class="community-shell-panel"
						class:community-shell-panel--active={isCommunityActivity}
						aria-hidden={!isCommunityActivity}
					>
						<CommunityActivityShell />
					</div>
				{/if}
			{/if}
			{#if migrationShellMounted}
				<div
					class="community-shell-panel"
					class:community-shell-panel--active={isCommunityMigration}
					aria-hidden={!isCommunityMigration}
				>
					<CommunityMigrationShell />
				</div>
			{/if}
			<div class="community-route-outlet" class:community-route-outlet--hidden={hideOutletForShell}>
				{@render children()}
			</div>
		</div>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		height: calc(100dvh - 64px);
		min-height: 0;
		overflow: hidden;
		border-left: 1px solid hsl(var(--border));
		border-right: 1px solid hsl(var(--border));
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (max-width: 639px) {
		.dashboard {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.dashboard {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
			flex-direction: column;
		}
	}

	.section-switcher {
		display: none;
	}

	@media (max-width: 767px) {
		.section-switcher {
			display: block;
			flex-shrink: 0;
			position: relative;
			z-index: 90;
		}
	}

	.section-switcher-zone {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		color: hsl(var(--foreground));
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}

	.section-switcher-label {
		font-size: 14px;
		font-weight: 500;
	}

	.section-chevron {
		display: flex;
		align-items: center;
		transition: transform 0.2s;
	}

	.section-chevron.open {
		transform: rotate(180deg);
	}

	/* Sheet from below switcher row to bottom; site header (64px) stays visible */
	.section-switcher-dropdown {
		position: fixed;
		z-index: 89;
		left: 0;
		right: 0;
		top: calc(64px + 2.625rem);
		bottom: 0;
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
		border-top: 1px solid hsl(var(--border));
		box-shadow: 0 12px 40px hsl(var(--black) / 0.35);
		overflow: hidden;
	}

	.section-switcher-content {
		flex-shrink: 0;
		padding: 8px 4px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Tap below links to close (dimmed) */
	.section-switcher-rest {
		flex: 1;
		min-height: 0;
		width: 100%;
		margin: 0;
		padding: 0;
		border: none;
		background: hsl(var(--black) / 0.35);
		cursor: default;
	}

	.section-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.section-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.section-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	@media (max-width: 767px) {
		.sidebar {
			display: none;
		}
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	/* About section — pushed to bottom with full-width divider */
	.sidebar-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
		margin-top: auto;
		margin-left: -12px;
		margin-right: -12px;
		padding-top: 16px;
		padding-left: 12px;
		padding-right: 12px;
		border-top: 1px solid hsl(var(--border));
	}

	.section-eyebrow {
		padding: 0 10px;
		margin-bottom: 4px;
		color: hsl(var(--white33));
		display: block;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.nav-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-wrap.icon-emoji {
		opacity: 0.66;
	}

	.nav-item.active .icon-wrap.icon-emoji {
		opacity: 1;
	}

	.section-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}

	.section-item-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
		opacity: 0.66;
		flex-shrink: 0;
	}

	.section-item.active .section-item-icon {
		opacity: 1;
	}

	.migration-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		margin-left: auto;
		border-radius: 9px;
		background: hsl(0 84% 60%);
		color: white;
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
	}

	.section-switcher-label .migration-badge {
		margin-left: 8px;
	}

	.right-page-viewport {
		position: relative;
		transform: translateZ(0);
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.community-shell-panel {
		display: none;
		flex: 1;
		min-height: 0;
		flex-direction: column;
		overflow: hidden;
	}

	.community-shell-panel--active {
		display: flex;
	}

	.community-route-outlet {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.community-route-outlet--hidden {
		display: none !important;
	}

	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		border-left: 1px solid hsl(var(--border));
		min-height: 0;
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
		}

		.right-page-viewport {
			/* Match studio: mobile thread modals must cover the full screen (section switcher is z-90). */
			transform: none;
		}
	}

	/* ── Shared bottom-sheet modal body (Details + Terms) ────────────────── */
	.modal-sheet-body {
		padding: 12px 12px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (max-width: 767px) {
		.modal-sheet-body {
			padding: 16px 16px max(20px, env(safe-area-inset-bottom, 0px));
		}
	}

	.modal-sheet-loading {
		margin: 8px 0;
		font-size: 14px;
		color: hsl(var(--white33));
		text-align: center;
	}

	.tos-list {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.tos-list li {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.tos-list strong {
		font-size: 1rem;
		font-weight: 650;
		color: hsl(var(--foreground));
		line-height: 1.3;
	}

	.tos-list span {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.55;
	}
</style>
