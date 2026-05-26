<script>
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { setContext } from 'svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import InboxIcon from '$lib/components/icons/Inbox.svelte';
	import { Plus } from '$lib/components/icons';
	import { queryEvents, liveQuery } from '$lib/purpleweb';
	import { parseAppStack } from '$lib/nostr';
	import { encodeStackNaddr, stackDisplayTitle, parseApp } from '$lib/nostr/models.js';
	import { getIsSignedIn, getIsConnecting, isAuthInitialized } from '$lib/stores/auth.svelte.js';
	import { fetchAppsByAuthorFromRelays, fetchStacksByAuthorFromRelays } from '$lib/purpleweb';
	import { resolveStudioCatalogPubkey } from '$lib/studio/resolve-studio-catalog-pubkey.js';
	import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { npubToHex } from '$lib/studio/analytics-http.js';
	import { loadIfNeeded as loadStudioAnalytics, resetStudioAnalytics } from '$lib/stores/studio-analytics.svelte.js';
	import { isOnline } from '$lib/stores/online.svelte.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';
	import { SITE_URL, ZAPSTORE_RELAY } from '$lib/config';
	import { wheelScrollPassthrough } from '$lib/actions/wheelScrollPassthrough.js';

	let { children } = $props();

	const signedIn = $derived(getIsSignedIn());
	const authReady = $derived(isAuthInitialized());
	const authConnecting = $derived(getIsConnecting());
	/**
	 * Single source of truth for "should the dashboard render?" — used by both
	 * the route guard and the template so they cannot disagree.
	 */
	const showDashboard = $derived(signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD);

	/**
	 * Route guard: /studio/* is auth-only. Redirect signed-out users to
	 * /developers (the public marketing page).
	 *
	 * Wait for `initAuth()` (parent layout `onMount`) and any in-flight Nostr
	 * Connect session restore so we don't bounce a signed-in user during the
	 * brief gap between mount and auth hydration.
	 */
	$effect(() => {
		if (!browser) return;
		if (!authReady || authConnecting) return;
		const path = $page.url.pathname;
		// This layout only serves /studio/* — never redirect when we're not actually on a studio URL.
		if (!path.startsWith('/studio')) return;
		if (!showDashboard) {
			goto('/developers', { replaceState: true });
		}
	});

	/** Reactive studio state shared across all child routes via context. */
	let userApps = $state([]);
	let studioPubkey = $state(/** @type {string | null} */ (null));
	/** True when the signed-in pubkey may URL-access any app on the relay. */
	let adminAccess = $state(false);
	let appsLoading = $state(true);

	/** Provide shared state to all child pages. */
	setContext('studio', {
		get userApps() { return userApps; },
		get studioPubkey() { return studioPubkey; },
		get adminAccess() { return adminAccess; },
		get appsLoading() { return appsLoading; },
		/** Update an app in the list after edit (called from app detail route). */
		updateApp(/** @type {object} */ updated) {
			const d = updated.dTag?.toLowerCase() ?? updated.id?.toLowerCase();
			userApps = userApps.map((a) =>
				a.id.toLowerCase() === d
					? {
							...a,
							name: updated.name ?? a.name,
							icon: updated.icon ?? a.icon,
							description: updated.description ?? a.description,
							url: updated.url ?? a.url,
							images: updated.images ?? a.images,
							eventId: updated.id ?? a.eventId,
							event: updated.event ?? a.event
					  }
					: a
			);
		}
	});

	// ── Apps: local-first (liveQuery) + relay refresh on each studio session ───
	/** Catalog author whose kind 32267 events power the sidebar. */
	let appsCatalogPubkey = $state(/** @type {string | null} */ (null));

	function resolveStudioPubkeyHex() {
		const fromAuth = getCurrentPubkey();
		if (!fromAuth) return null;
		try {
			return npubToHex(fromAuth);
		} catch {
			return String(fromAuth).toLowerCase();
		}
	}

	/** @param {import('nostr-tools').NostrEvent[]} events */
	function mapEventsToStudioApps(events, catalogPubkey) {
		return events.map(parseApp).map((a) => ({
			id: a.dTag,
			name: a.name,
			icon: a.icon ?? '',
			description: a.description ?? '',
			url: a.url ?? '',
			images: a.images ?? [],
			eventId: a.id,
			event: a.event,
			pubkey: catalogPubkey
		}));
	}

	$effect(() => {
		if (!browser || !showDashboard) {
			appsCatalogPubkey = null;
			studioPubkey = null;
			adminAccess = false;
			userApps = [];
			appsLoading = false;
			return;
		}

		const authPubkey = getCurrentPubkey();
		if (!authPubkey) {
			appsCatalogPubkey = null;
			userApps = [];
			appsLoading = true;
			return;
		}

		let cancelled = false;
		appsLoading = true;

		void (async () => {
			try {
				const signerHex = resolveStudioPubkeyHex();
				if (cancelled || !signerHex) return;

				const policy = await resolveStudioCatalogPubkey(signerHex);
				if (cancelled) return;

				studioPubkey = policy.catalogPubkey;
				adminAccess = policy.adminAccess;
				appsCatalogPubkey = policy.catalogPubkey;

				if (isOnline()) {
					void fetchAppsByAuthorFromRelays([ZAPSTORE_RELAY], policy.catalogPubkey, {
						limit: 50,
						timeout: 5000
					}).catch((err) => console.error('[StudioLayout] app relay refresh failed:', err));
				}
			} catch (err) {
				console.error('[StudioLayout] app catalog resolve failed:', err);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!browser || !showDashboard || !appsCatalogPubkey) return;

		const catalogPk = appsCatalogPubkey;
		const sub = liveQuery(() => queryEvents({ kinds: [32267], authors: [catalogPk] })).subscribe({
			next: (events) => {
				userApps = mapEventsToStudioApps(events ?? [], catalogPk);
				appsLoading = false;
			},
			error: (err) => {
				console.error('[StudioLayout] apps liveQuery failed:', err);
				appsLoading = false;
			}
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!showDashboard) resetStudioAnalytics();
	});

	// ── Stacks loading ─────────────────────────────────────────────────────────
	let userStacks = $state([]);
	let stacksLoading = $state(true);

	$effect(() => {
		if (!browser || !showDashboard) {
			userStacks = [];
			stacksLoading = false;
			return;
		}
		// Inbox feed liveQuery + relay seed write heavily to Dexie — a second layout
		// liveQuery here re-runs on every write and freezes the tab.
		if ($page.url.pathname.startsWith('/studio/inbox')) {
			return;
		}
		if (!authReady || authConnecting) {
			stacksLoading = true;
			return;
		}
		const pubkey = getCurrentPubkey();
		if (!pubkey) {
			userStacks = [];
			stacksLoading = true;
			return;
		}

		stacksLoading = true;

		if (isOnline()) {
			void fetchStacksByAuthorFromRelays([ZAPSTORE_RELAY], pubkey, {
				limit: 50,
				timeout: 5000
			}).catch((err) => console.error('[StudioLayout] stack relay refresh failed:', err));
		}

		const sub = liveQuery(() =>
			queryEvents({ kinds: [30267], authors: [pubkey] })
		).subscribe({
			next: (events) => {
				userStacks = (events ?? []).map(parseAppStack).sort((a, b) => b.createdAt - a.createdAt);
				stacksLoading = false;
			},
			error: (err) => {
				console.error('[StudioLayout] stacks query failed:', err);
				stacksLoading = false;
			}
		});
		return () => sub.unsubscribe();
	});

	// Kick off the per-publisher analytics fetch as soon as we know who the user is
	// and which apps to chart. Idempotent — slicing the cache for shorter timeframes
	// happens entirely inside the consuming components.
	$effect(() => {
		if (!studioPubkey || userApps.length === 0) return;
		loadStudioAnalytics(studioPubkey, userApps);
	});

	// ── Mobile nav ───────────────────────────────────────────────────────────
	let mobileMenuOpen = $state(false);

	/** Active section derived from current route pathname. */
	const activeSection = $derived.by(() => {
		const p = $page.url.pathname;
		if (p.startsWith('/studio/inbox')) return 'inbox';
		if (p === '/studio/apps') return 'apps';
		if (p.startsWith('/studio/apps/')) return 'app';
		if (p === '/studio/stacks/new') return 'stack-new';
		if (p.startsWith('/studio/stacks/')) return 'stack';
		if (p.startsWith('/studio/migration')) return 'migration';
		return 'insights'; // /studio and /studio/insights both map here
	});

	/** Active app id (d-tag) from URL for sidebar highlight. URL-decoded. */
	const activeAppId = $derived.by(() => {
		if (activeSection !== 'app') return null;
		const raw = $page.url.pathname.replace('/studio/apps/', '').split('/')[0];
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	});

	/** Active stack naddr from URL for sidebar highlight. */
	const activeStackNaddr = $derived.by(() => {
		if (activeSection !== 'stack') return null;
		return $page.url.pathname.replace('/studio/stacks/', '').split('/')[0];
	});

	const activeNavLabel = $derived.by(() => {
		if (activeSection === 'inbox') return 'Inbox';
		if (activeSection === 'stack-new') return 'New Stack';
		if (activeSection === 'stack') return 'Edit Stack';
		if (activeSection === 'migration') return 'Migration';
		if (activeSection === 'app') {
			const app = userApps.find((a) => a.id === activeAppId);
			return app?.name ?? 'App';
		}
		return 'Insights';
	});

	function closeMobile() { mobileMenuOpen = false; }
	function navTo(href) { goto(href); closeMobile(); }
</script>

<svelte:head>
	<meta property="og:image" content="{SITE_URL}/images/og-studio.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Zapstore Studio" />
	<meta name="twitter:image" content="{SITE_URL}/images/og-studio.png" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{#if showDashboard}
	<div class="dashboard-page-shell" use:wheelScrollPassthrough>
	<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="dashboard">

			<!-- Mobile nav -->
			<div class="mobile-nav">
				<button
					type="button"
					class="mobile-nav-zone"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-expanded={mobileMenuOpen}
					aria-haspopup="true"
				>
					<span class="mobile-nav-label">{activeNavLabel}</span>
					<span class="mobile-chevron" class:open={mobileMenuOpen}>
						<ChevronDownIcon variant="outline" color="var(--white33)" size={14} strokeWidth={1.4} />
					</span>
				</button>
				{#if mobileMenuOpen}
					<div class="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Studio navigation">
						<div class="mobile-nav-content">
							<nav class="sidebar-nav">
						<button
								class="nav-item"
								class:active={activeSection === 'insights'}
								onclick={() => navTo('/studio/insights')}
							>
									<span class="icon-wrap">
										<InsightsIcon
											color={activeSection === 'insights' ? 'var(--white66)' : 'var(--white33)'}
											strokeWidth={1.4}
											size={18}
										/>
									</span>
									<span class="nav-label">Insights</span>
								</button>
								<button
									class="nav-item"
									class:active={activeSection === 'inbox'}
									onclick={() => navTo('/studio/inbox')}
								>
									<span class="icon-wrap">
										<InboxIcon
											color={activeSection === 'inbox' ? 'var(--white66)' : 'var(--white33)'}
											strokeWidth={1.4}
											size={18}
										/>
									</span>
									<span class="nav-label">Inbox</span>
								</button>
							</nav>
						<div class="apps-section">
							<div class="apps-section-head">
								<span class="eyebrow-label apps-eyebrow">Apps</span>
								<a
									href="/docs/publish"
									class="sidebar-section-plus"
									aria-label="Publish an app"
									onclick={closeMobile}
								>
									<Plus variant="outline" color="var(--white16)" size={12} strokeWidth={2.4} />
								</a>
							</div>
							{#if !appsLoading && userApps.length === 0}
								<button
									class="nav-item no-apps-item"
									class:active={activeSection === 'apps'}
									onclick={() => navTo('/studio/apps')}
								>
									<span class="nav-label no-apps-label">No apps yet</span>
								</button>
							{/if}
							{#each userApps as app (app.id)}
								<button
									class="nav-item"
									class:active={activeAppId === app.id}
									onclick={() => navTo(`/studio/apps/${encodeURIComponent(app.id)}`)}
								>
									<span class="icon-wrap">
										<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
									</span>
									<span class="nav-label">{app.name}</span>
								</button>
							{/each}
						</div>
						<div class="stacks-section">
							<div class="apps-section-head">
								<span class="eyebrow-label apps-eyebrow">Stacks</span>
								<button
									type="button"
									class="sidebar-section-plus"
									aria-label="New stack"
									onclick={() => navTo('/studio/stacks/new')}
								>
									<Plus variant="outline" color="var(--white16)" size={12} strokeWidth={2.4} />
								</button>
							</div>
							{#if !stacksLoading && userStacks.length === 0}
								<button
									class="nav-item no-apps-item"
									onclick={() => navTo('/studio/stacks/new')}
								>
									<span class="nav-label no-apps-label">No stacks yet</span>
								</button>
							{/if}
							{#each userStacks as stack (stack.id)}
								{@const stackNaddr = encodeStackNaddr(stack.pubkey, stack.dTag)}
								{@const label = stackDisplayTitle({ title: stack.title, description: stack.description })}
								<button
									class="nav-item"
									class:active={activeStackNaddr === stackNaddr}
									onclick={() => navTo(`/studio/stacks/${stackNaddr}/edit`)}
								>
									<span class="icon-wrap">
										<img src="/images/emoji/stack.png" alt="Stack" class="app-img" loading="lazy" />
									</span>
									<span class="nav-label">{label}</span>
								</button>
							{/each}
						</div>
						<div class="sidebar-section">
							<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
							<a href="/docs" class="nav-item" onclick={closeMobile}>
								<span class="nav-label">Documentation</span>
							</a>
							<button
								class="nav-item"
								class:active={activeSection === 'migration'}
								onclick={() => navTo('/studio/migration')}
							>
								<span class="nav-label">Migration</span>
							</button>
							<a
								href="https://github.com/zapstore/zsp"
								class="nav-item"
								target="_blank"
								rel="noopener noreferrer"
								onclick={closeMobile}
							>
								<span class="nav-label">ZSP</span>
							</a>
						</div>
						</div>
						<button
							type="button"
							class="mobile-nav-rest"
							onclick={closeMobile}
							aria-label="Close menu"
						></button>
					</div>
				{/if}
			</div>

			<!-- Sidebar (desktop only) -->
			<aside class="sidebar">
				<nav class="sidebar-nav">
				<button
					class="nav-item"
					class:active={activeSection === 'insights'}
					onclick={() => goto('/studio/insights')}
				>
						<span class="icon-wrap">
							<InsightsIcon
								color={activeSection === 'insights' ? 'var(--white66)' : 'var(--white33)'}
								strokeWidth={1.4}
								size={18}
							/>
						</span>
						<span class="nav-label">Insights</span>
					</button>
					<button
						class="nav-item"
						class:active={activeSection === 'inbox'}
						onclick={() => goto('/studio/inbox')}
					>
						<span class="icon-wrap">
							<InboxIcon
								color={activeSection === 'inbox' ? 'var(--white66)' : 'var(--white33)'}
								strokeWidth={1.4}
								size={18}
							/>
						</span>
						<span class="nav-label">Inbox</span>
					</button>
			</nav>

			<div class="sidebar-mid" data-sidebar-scroll>
				<div class="apps-section">
					<div class="apps-section-head">
						<span class="eyebrow-label apps-eyebrow">Apps</span>
						<a href="/docs/publish" class="sidebar-section-plus" aria-label="Publish an app">
							<Plus variant="outline" color="var(--white16)" size={12} strokeWidth={2.4} />
						</a>
					</div>
					{#if !appsLoading && userApps.length === 0}
						<button
							class="nav-item no-apps-item"
							class:active={activeSection === 'apps'}
							onclick={() => goto('/studio/apps')}
						>
							<span class="nav-label no-apps-label">No apps yet</span>
						</button>
					{/if}
					{#each userApps as app (app.id)}
						<button
							class="nav-item"
							class:active={activeAppId === app.id}
							onclick={() => goto(`/studio/apps/${encodeURIComponent(app.id)}`)}
						>
							<span class="icon-wrap">
								<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
							</span>
							<span class="nav-label">{app.name}</span>
						</button>
					{/each}
				</div>

				<div class="stacks-section">
					<div class="apps-section-head">
						<span class="eyebrow-label apps-eyebrow">Stacks</span>
						<button
							type="button"
							class="sidebar-section-plus"
							aria-label="New stack"
							onclick={() => goto('/studio/stacks/new')}
						>
							<Plus variant="outline" color="var(--white16)" size={12} strokeWidth={2.4} />
						</button>
					</div>
					{#if !stacksLoading && userStacks.length === 0}
						<button
							class="nav-item no-apps-item"
							onclick={() => goto('/studio/stacks/new')}
						>
							<span class="nav-label no-apps-label">No stacks yet</span>
						</button>
					{/if}
					{#each userStacks as stack (stack.id)}
						{@const stackNaddr = encodeStackNaddr(stack.pubkey, stack.dTag)}
						{@const label = stackDisplayTitle({ title: stack.title, description: stack.description })}
						<button
							class="nav-item"
							class:active={activeStackNaddr === stackNaddr}
							onclick={() => goto(`/studio/stacks/${stackNaddr}/edit`)}
						>
							<span class="icon-wrap">
								<img src="/images/emoji/stack.png" alt="Stack" class="app-img" loading="lazy" />
							</span>
							<span class="nav-label">{label}</span>
						</button>
					{/each}
				</div>
			</div>

				<div class="sidebar-section">
					<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
					<a href="/docs" class="nav-item">
						<span class="nav-label">Documentation</span>
					</a>
					<button
						class="nav-item"
						class:active={activeSection === 'migration'}
						onclick={() => goto('/studio/migration')}
					>
						<span class="nav-label">Migration</span>
					</button>
					<a
						href="https://github.com/zapstore/zsp"
						class="nav-item"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span class="nav-label">ZSP</span>
					</a>
				</div>
			</aside>

			<!-- Content area — child pages render here -->
			<div class="content">
				{@render children()}
			</div>
		</div>
	</div>
</div>
{/if}
<!--
	When showDashboard is false, render nothing. The route guard above redirects
	to /developers; rendering child pages without their dashboard chrome would
	break them (StudioInsights, StudioInbox, etc. assume the layout context).
-->


<style>
	:global(main.main-content:has(.dashboard-page-shell)) {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.dashboard-page-shell {
		flex: 1;
		min-height: 0;
		width: 100%;
		min-height: calc(100dvh - 64px);
		display: flex;
		flex-direction: column;
	}

	.dashboard {
		display: flex;
		height: calc(100dvh - 64px);
		min-height: 0;
		overflow: hidden;
		border-left: 1px solid var(--shell-border);
		border-right: 1px solid var(--shell-border);
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

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--white66);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
	}

	.nav-item:hover:not(.active) { background: var(--white4); }

	.nav-item.active {
		color: var(--white);
		background: var(--white8);
	}

	.icon-wrap {
		width: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.nav-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.apps-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 16px;
	}

	.sidebar-mid {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		overscroll-behavior: contain;
	}

	.apps-section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 0 10px;
		margin-bottom: 4px;
		min-width: 0;
	}

	.apps-eyebrow {
		color: var(--white33);
		display: block;
		min-width: 0;
	}

	.sidebar-section-plus {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		padding: 0;
		border: none;
		background: transparent;
		border-radius: 6px;
		cursor: pointer;
		text-decoration: none;
		color: inherit;
		transition: background-color 0.15s ease;
	}

	.sidebar-section-plus:hover {
		background: var(--white4);
	}

	.app-img {
		width: 18px;
		height: 18px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

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
		border-top: 1px solid var(--shell-border);
	}

	.stacks-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 16px;
		flex-shrink: 0;
	}

	.section-eyebrow {
		padding: 0 10px;
		margin-bottom: 4px;
		color: var(--white33);
		display: block;
	}

	a.nav-item { text-decoration: none; }

	.no-apps-label { color: var(--white33); }

	/* ── Content area ─────────────────────────────────────────────────────── */
	.content {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--shell-border);
		position: relative;
		transform: translateZ(0);
	}

	/* ── Mobile nav ───────────────────────────────────────────────────────── */
	.mobile-nav { display: none; }

	@media (max-width: 767px) {
		.dashboard-outer {
			overflow-x: hidden;
			max-width: 100%;
		}

		.sidebar { display: none; }

		.mobile-nav {
			display: block;
			position: relative;
			overflow-x: hidden;
			max-width: 100%;
		}

		.mobile-nav-zone {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 10px 16px;
			background: transparent;
			border: none;
			border-bottom: 1px solid var(--shell-border);
			cursor: pointer;
			color: var(--white);
		}

		.mobile-nav-label { font-size: 14px; font-weight: 500; }

		.mobile-chevron { display: flex; align-items: center; transition: transform 0.2s; }
		.mobile-chevron.open { transform: rotate(180deg); }

		.mobile-nav-panel {
			position: fixed;
			z-index: 89;
			left: 0;
			right: 0;
			top: calc(64px + 2.625rem);
			bottom: 0;
			display: flex;
			flex-direction: column;
			background: var(--black);
			border-top: 1px solid var(--shell-border);
			box-shadow: 0 12px 40px color-mix(in srgb, var(--black) 35%, transparent);
			overflow: hidden;
			overflow-x: hidden;
			max-width: 100%;
		}

		.mobile-nav-content {
			flex-shrink: 0;
			max-height: 55dvh;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 8px 4px 8px;
			display: flex;
			flex-direction: column;
			max-width: 100%;
		}

		.mobile-nav-rest {
			flex: 1;
			min-height: 0;
			width: 100%;
			margin: 0;
			padding: 0;
			border: none;
			background: color-mix(in srgb, var(--black) 35%, transparent);
			cursor: default;
		}

		.mobile-nav-content .sidebar-section {
			margin-top: 16px;
			margin-left: 0;
			margin-right: 0;
			padding-left: 12px;
			padding-right: 12px;
		}

		.dashboard {
			overflow-x: hidden;
			max-width: 100%;
		}

		.content {
			border-left: none;
			transform: none;
		}
	}
</style>
