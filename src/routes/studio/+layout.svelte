<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { setContext } from 'svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import InboxIcon from '$lib/components/icons/Inbox.svelte';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
	import { parseApp } from '$lib/nostr/models.js';
	import { fetchAllAppsByAuthorFromRelays, fetchAppsByAuthorFromRelays } from '$lib/nostr/service.js';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config.js';
	import { resolveStudioCatalogPubkey } from '$lib/studio/resolve-studio-catalog-pubkey.js';
	import {
		TEST_PUBKEY,
		isStudioIndexerCatalogPubkey,
		sortStudioIndexerAppsZapstoreFirst
	} from '$lib/components/studio/studio-config.js';
	import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { npubToHex } from '$lib/studio/analytics-http.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

	let { children } = $props();

	const signedIn = $derived(getIsSignedIn());

	/** Reactive studio state shared across all child routes via context. */
	let userApps = $state([]);
	let studioPubkey = $state(/** @type {string | null} */ (null));
	let appsLoading = $state(true);

	const showIndexerAppCount = $derived(
		studioPubkey != null && isStudioIndexerCatalogPubkey(studioPubkey)
	);

	/** Provide shared state to all child pages. */
	setContext('studio', {
		get userApps() { return userApps; },
		get studioPubkey() { return studioPubkey; },
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

	// ── Apps loading (triggers only on auth changes, not analytics timeframes) ──
	let appsLoadGen = 0;

	async function resolveStudioPubkeyHex() {
		const raw = TEST_PUBKEY == null || TEST_PUBKEY === '' ? '' : String(TEST_PUBKEY).trim();
		if (raw) {
			try { return npubToHex(raw); } catch { return null; }
		}
		const fromAuth = getCurrentPubkey();
		if (fromAuth) {
			try { return npubToHex(fromAuth); }
			catch { return String(fromAuth).toLowerCase(); }
		}
		return null;
	}

	async function loadUserApps() {
		appsLoadGen += 1;
		const gen = appsLoadGen;

		appsLoading = true;
		try {
			const signerPubkey = await resolveStudioPubkeyHex();
			if (gen !== appsLoadGen) return;
			if (!signerPubkey) {
				studioPubkey = null;
				userApps = [];
				return;
			}

			const catalogPubkey = await resolveStudioCatalogPubkey(signerPubkey);
			if (gen !== appsLoadGen) return;
			studioPubkey = catalogPubkey;

			let events = await queryEvents({ kinds: [32267], authors: [catalogPubkey] });
			if (gen !== appsLoadGen) return;

			const indexerCatalog = isStudioIndexerCatalogPubkey(catalogPubkey);
			if (indexerCatalog) {
				const thinLocalIndex = events.length === 0 || events.length < 500;
				const sessionKey = `zs.studio.indexerRelayBackfill:${catalogPubkey}`;
				let sessionBackfillDone = false;
				try { sessionBackfillDone = sessionStorage.getItem(sessionKey) === '1'; } catch { /* private */ }
				if (thinLocalIndex || !sessionBackfillDone) {
					await fetchAllAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, catalogPubkey, {
						pageLimit: 500, maxPages: 40, timeout: 15000, skipPlatformFilter: true
					});
					if (gen !== appsLoadGen) return;
					try { sessionStorage.setItem(sessionKey, '1'); } catch { /* ignore */ }
					events = await queryEvents({ kinds: [32267], authors: [catalogPubkey] });
				}
			} else if (events.length === 0) {
				events = await fetchAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, catalogPubkey);
				if (events.length > 0) await putEvents(events);
			}
			if (gen !== appsLoadGen) return;

			const parsedApps = events.map(parseApp);
			let next = parsedApps.map((a) => ({
				id: a.dTag,
				naddr: a.naddr,
				name: a.name,
				icon: a.icon ?? '',
				description: a.description ?? '',
				url: a.url ?? '',
				images: a.images ?? [],
				eventId: a.id,
				event: a.event
			}));
			if (isStudioIndexerCatalogPubkey(catalogPubkey)) {
				next = sortStudioIndexerAppsZapstoreFirst(next);
			}
			if (gen !== appsLoadGen) return;
			userApps = next;
		} catch (err) {
			console.error('[StudioLayout] app load failed:', err);
		} finally {
			if (gen === appsLoadGen) appsLoading = false;
		}
	}

	$effect(() => {
		signedIn; // re-run when auth changes
		if (signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			loadUserApps().catch((err) => console.error('[StudioLayout] loadUserApps:', err));
		}
	});

	// ── Mobile nav ───────────────────────────────────────────────────────────
	let mobileMenuOpen = $state(false);

	/** Active section derived from current route pathname. */
	const activeSection = $derived.by(() => {
		const p = $page.url.pathname;
		if (p.startsWith('/studio/inbox')) return 'inbox';
		if (p === '/studio/apps') return 'apps';
		if (p.startsWith('/studio/apps/')) return 'app';
		if (p.startsWith('/studio/assets')) return 'assets';
		return 'insights'; // /studio and /studio/insights both map here
	});

	/** Active app from URL for sidebar highlight. */
	const activeAppNaddr = $derived(
		activeSection === 'app' ? $page.url.pathname.replace('/studio/apps/', '') : null
	);

	const activeNavLabel = $derived.by(() => {
		if (activeSection === 'inbox') return 'Inbox';
		if (activeSection === 'assets') return 'Assets';
		if (activeSection === 'app') {
			const app = userApps.find((a) => a.naddr === activeAppNaddr);
			return app?.name ?? 'App';
		}
		return 'Insights';
	});

	function closeMobile() { mobileMenuOpen = false; }
	function navTo(href) { goto(href); closeMobile(); }
</script>

{#if signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD}
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
									<span class="eyebrow-label apps-eyebrow">Your Apps</span>
									{#if showIndexerAppCount}
										<span class="apps-eyebrow-count" aria-label="{userApps.length} apps loaded"
											>{userApps.length.toLocaleString('en-US')}</span
										>
									{/if}
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
										class:active={activeAppNaddr === app.naddr}
										onclick={() => navTo(`/studio/apps/${app.naddr}`)}
									>
										<span class="icon-wrap">
											<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
										</span>
										<span class="nav-label">{app.name}</span>
									</button>
								{/each}
							</div>
							<div class="sidebar-section">
								<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
								<button
									class="nav-item"
									class:active={activeSection === 'assets'}
									onclick={() => navTo('/studio/assets')}
								>
									<span class="nav-label">Assets</span>
								</button>
								<a href="/docs" class="nav-item" onclick={closeMobile}>
									<span class="nav-label">Documentation</span>
								</a>
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

				<div class="apps-section">
					<div class="apps-section-head">
						<span class="eyebrow-label apps-eyebrow">Your Apps</span>
						{#if showIndexerAppCount}
							<span class="apps-eyebrow-count" aria-label="{userApps.length} apps loaded"
								>{userApps.length.toLocaleString('en-US')}</span
							>
						{/if}
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
							class:active={activeAppNaddr === app.naddr}
							onclick={() => goto(`/studio/apps/${app.naddr}`)}
						>
							<span class="icon-wrap">
								<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
							</span>
							<span class="nav-label">{app.name}</span>
						</button>
					{/each}
				</div>

				<div class="sidebar-section">
					<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
					<button
						class="nav-item"
						class:active={activeSection === 'assets'}
						onclick={() => goto('/studio/assets')}
					>
						<span class="nav-label">Assets</span>
					</button>
					<a href="/docs" class="nav-item">
						<span class="nav-label">Documentation</span>
					</a>
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
{:else}
	<!-- Not signed in or flag off: just pass child page through (it renders marketing) -->
	{@render children()}
{/if}

<style>
	.dashboard {
		display: flex;
		height: calc(100dvh - 64px);
		min-height: 0;
		overflow: hidden;
		border-left: 1px solid var(--white16);
		border-right: 1px solid var(--white16);
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

	.sidebar > .apps-section {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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

	.apps-eyebrow-count {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.06em;
		font-variant-numeric: tabular-nums;
		color: var(--blurpleColor66);
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
		border-top: 1px solid var(--white16);
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
		border-left: 1px solid var(--white16);
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
			z-index: 90;
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
			border-bottom: 1px solid var(--white16);
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
			border-top: 1px solid var(--white16);
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
