<script>
	/**
	 * Migration tab — helps developers migrate:
	 * - Legacy apps (1063 → 3063)
	 * - Stacks missing h/f tags
	 */
	import { browser } from '$app/environment';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { fetchFromRelays, putEvents, publishToRelays } from '$lib/nostr';
	import { parseApp, parseAppStack } from '$lib/nostr/models.js';
	import {
		isLegacyRelease,
		migrateApp,
		stackNeedsMigration,
		getStackMissingTags,
		migrateStack
	} from '$lib/nostr/migration';
	import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS, PLATFORM_FILTER } from '$lib/config.js';
	import AppPic from '$lib/components/common/AppPic.svelte';

	/** @typedef {{ app: any, release: any, artifacts: any[], parsed: any }} LegacyAppData */
	/** @typedef {{ event: any, parsed: any, missingH: boolean, missingF: boolean }} LegacyStackData */

	// ─── App Migration State ───────────────────────────────────────────────────
	let appLoading = $state(true);
	let appError = $state(/** @type {string | null} */ (null));
	/** @type {LegacyAppData[]} */
	let legacyApps = $state([]);
	/** @type {Set<string>} */
	let appMigratingIds = $state(new Set());
	/** @type {Set<string>} */
	let appMigratedIds = $state(new Set());
	/** @type {Map<string, string>} */
	let appMigrationErrors = $state(new Map());

	// ─── Stack Migration State ─────────────────────────────────────────────────
	let stackLoading = $state(true);
	let stackError = $state(/** @type {string | null} */ (null));
	/** @type {LegacyStackData[]} */
	let legacyStacks = $state([]);
	/** @type {Set<string>} */
	let stackMigratingIds = $state(new Set());
	/** @type {Set<string>} */
	let stackMigratedIds = $state(new Set());
	/** @type {Map<string, string>} */
	let stackMigrationErrors = $state(new Map());

	const pubkey = $derived(getCurrentPubkey());
	const isSignedIn = $derived(getIsSignedIn());

	// ─── App Detection Effect ──────────────────────────────────────────────────
	$effect(() => {
		if (!browser || !isSignedIn || !pubkey) {
			appLoading = false;
			return;
		}

		let cancelled = false;

		(async () => {
			appLoading = true;
			appError = null;

			try {
				const apps = await fetchFromRelays(
					DEFAULT_CATALOG_RELAYS,
					{ kinds: [EVENT_KINDS.APP], authors: [pubkey], ...PLATFORM_FILTER, limit: 100 },
					{ timeout: 10000, feature: 'migration-detect-apps' }
				);

				if (cancelled) return;

				const legacy = [];

				for (const app of apps) {
					const aTag = app.tags.find((t) => t[0] === 'a')?.[1];
					if (!aTag?.startsWith('30063:')) continue;

					const parts = aTag.split(':');
					if (parts.length < 3) continue;
					const relPubkey = parts[1];
					const dTag = parts.slice(2).join(':');

					const releases = await fetchFromRelays(
						DEFAULT_CATALOG_RELAYS,
						{ kinds: [EVENT_KINDS.RELEASE], authors: [relPubkey], '#d': [dTag], limit: 1 },
						{ timeout: 5000, feature: 'migration-release' }
					);

					if (cancelled) return;
					if (!releases.length) continue;

					const release = releases[0];
					const artifactIds = release.tags
						.filter((t) => t[0] === 'e' || t[0] === 'E')
						.map((t) => t[1]);
					if (!artifactIds.length) continue;

					const artifacts = await fetchFromRelays(
						DEFAULT_CATALOG_RELAYS,
						{ ids: artifactIds, limit: artifactIds.length },
						{ timeout: 5000, feature: 'migration-artifacts' }
					);

					if (cancelled) return;
					if (!artifacts.length) continue;

					if (isLegacyRelease(release, artifacts)) {
						legacy.push({
							app,
							release,
							artifacts,
							parsed: parseApp(app)
						});
					}
				}

				if (!cancelled) {
					legacyApps = legacy;
				}
			} catch (e) {
				if (!cancelled) {
					appError = e instanceof Error ? e.message : String(e);
				}
			} finally {
				if (!cancelled) {
					appLoading = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// ─── Stack Detection Effect ────────────────────────────────────────────────
	$effect(() => {
		if (!browser || !isSignedIn || !pubkey) {
			stackLoading = false;
			return;
		}

		let cancelled = false;

		(async () => {
			stackLoading = true;
			stackError = null;

			try {
				const stacks = await fetchFromRelays(
					DEFAULT_CATALOG_RELAYS,
					{ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey], limit: 100 },
					{ timeout: 10000, feature: 'migration-detect-stacks' }
				);

				if (cancelled) return;

				const legacy = [];

				for (const stack of stacks) {
					if (stackNeedsMigration(stack)) {
						const { missingH, missingF } = getStackMissingTags(stack);
						legacy.push({
							event: stack,
							parsed: parseAppStack(stack),
							missingH,
							missingF
						});
					}
				}

				if (!cancelled) {
					legacyStacks = legacy;
				}
			} catch (e) {
				if (!cancelled) {
					stackError = e instanceof Error ? e.message : String(e);
				}
			} finally {
				if (!cancelled) {
					stackLoading = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// ─── App Migration Handlers ────────────────────────────────────────────────
	async function handleMigrateApp(data) {
		const appId = data.app.id;
		appMigratingIds = new Set([...appMigratingIds, appId]);
		appMigrationErrors = new Map([...appMigrationErrors].filter(([k]) => k !== appId));

		try {
			const result = await migrateApp(
				{ app: data.app, release: data.release, artifacts: data.artifacts },
				signEvent,
				async (event) => {
					await publishToRelays(DEFAULT_CATALOG_RELAYS, event);
					await putEvents([event]);
				}
			);

			if (result.success) {
				appMigratedIds = new Set([...appMigratedIds, appId]);
			} else {
				appMigrationErrors = new Map([
					...appMigrationErrors,
					[appId, result.error || 'Unknown error']
				]);
			}
		} catch (e) {
			appMigrationErrors = new Map([
				...appMigrationErrors,
				[appId, e instanceof Error ? e.message : String(e)]
			]);
		} finally {
			appMigratingIds = new Set([...appMigratingIds].filter((id) => id !== appId));
		}
	}

	async function handleMigrateAllApps() {
		for (const data of legacyApps) {
			if (!appMigratedIds.has(data.app.id)) {
				await handleMigrateApp(data);
			}
		}
	}

	// ─── Stack Migration Handlers ──────────────────────────────────────────────
	async function handleMigrateStack(data) {
		const stackId = data.event.id;
		stackMigratingIds = new Set([...stackMigratingIds, stackId]);
		stackMigrationErrors = new Map([...stackMigrationErrors].filter(([k]) => k !== stackId));

		try {
			const result = await migrateStack(data.event, signEvent, async (event) => {
				await publishToRelays(DEFAULT_CATALOG_RELAYS, event);
				await putEvents([event]);
			});

			if (result.success) {
				stackMigratedIds = new Set([...stackMigratedIds, stackId]);
			} else {
				stackMigrationErrors = new Map([
					...stackMigrationErrors,
					[stackId, result.error || 'Unknown error']
				]);
			}
		} catch (e) {
			stackMigrationErrors = new Map([
				...stackMigrationErrors,
				[stackId, e instanceof Error ? e.message : String(e)]
			]);
		} finally {
			stackMigratingIds = new Set([...stackMigratingIds].filter((id) => id !== stackId));
		}
	}

	async function handleMigrateAllStacks() {
		for (const data of legacyStacks) {
			if (!stackMigratedIds.has(data.event.id)) {
				await handleMigrateStack(data);
			}
		}
	}

	// ─── Derived State ─────────────────────────────────────────────────────────
	const loading = $derived(appLoading || stackLoading);
	const pendingApps = $derived(legacyApps.filter((d) => !appMigratedIds.has(d.app.id)));
	const pendingStacks = $derived(legacyStacks.filter((d) => !stackMigratedIds.has(d.event.id)));
	const hasLegacyApps = $derived(legacyApps.length > 0);
	const hasLegacyStacks = $derived(legacyStacks.length > 0);
	const allAppsMigrated = $derived(hasLegacyApps && pendingApps.length === 0);
	const allStacksMigrated = $derived(hasLegacyStacks && pendingStacks.length === 0);
	const allMigrated = $derived(
		(!hasLegacyApps || allAppsMigrated) && (!hasLegacyStacks || allStacksMigrated)
	);
	const nothingToMigrate = $derived(!hasLegacyApps && !hasLegacyStacks);

	function getMissingTagsLabel(data) {
		if (data.missingH && data.missingF) return 'Missing h, f tags';
		if (data.missingH) return 'Missing h tag';
		if (data.missingF) return 'Missing f tag';
		return '';
	}
</script>

<div class="migration-shell">
	{#if !isSignedIn}
		<div class="empty-state">
			<p class="empty-text">Sign in to check for apps and stacks that need migration.</p>
		</div>
	{:else if loading}
		<div class="empty-state">
			<p class="empty-text">Checking for items that need migration…</p>
		</div>
	{:else if appError || stackError}
		<div class="empty-state">
			<p class="error-text">Error: {appError || stackError}</p>
		</div>
	{:else if nothingToMigrate}
		<div class="empty-state">
			<div class="empty-icon">✓</div>
			<p class="empty-title">No Migration Needed</p>
			<p class="empty-text">All your apps and stacks are up to date.</p>
		</div>
	{:else if allMigrated}
		<div class="success-state">
			<div class="success-icon">✓</div>
			<p class="success-title">Migration Complete</p>
			<p class="success-text">All your apps and stacks have been migrated.</p>

			<div class="zsp-section">
				<h3 class="zsp-title">For Ongoing Publishing</h3>
				<p class="zsp-text">
					Use <strong>zsp</strong> — the Zapstore CLI — to publish future releases.
				</p>
				<div class="zsp-install">
					<code>go install github.com/zapstore/zsp@latest</code>
				</div>
				<a href="/docs/publish" class="zsp-link">Read the publishing docs →</a>
			</div>
		</div>
	{:else}
		<div class="migration-content">
			<div class="migration-header">
				<div class="header-text">
					<h2 class="header-title">App Migration</h2>
					<p class="header-description">
						{pendingApps.length} app{pendingApps.length === 1 ? '' : 's'} use the legacy event format
						(kind 1063). The relay now requires the modern format (kind 3063). Migrate to ensure your
						apps remain visible.
					</p>
				</div>
				{#if pendingApps.length > 1}
					<button type="button" class="migrate-all-btn" onclick={handleMigrateAll}>
						Migrate All
					</button>
				{/if}
			</div>

			<div class="item-list">
				{#each legacyApps as data (data.app.id)}
					{@const isMigrating = appMigratingIds.has(data.app.id)}
					{@const isMigrated = appMigratedIds.has(data.app.id)}
					{@const migrationError = appMigrationErrors.get(data.app.id)}

					<div class="app-card" class:migrated={isMigrated}>
						<div class="app-icon">
							<AppPic icon={data.parsed.icon} name={data.parsed.name} size={48} />
						</div>
						<div class="app-info">
							<span class="app-name">{data.parsed.name}</span>
							<span class="app-version"
								>v{data.release.tags.find((t) => t[0] === 'version')?.[1] ||
									data.release.tags.find((t) => t[0] === 'd')?.[1]?.split('@')[1] ||
									'?'}</span
							>
							<span class="app-artifacts"
								>{data.artifacts.length} artifact{data.artifacts.length === 1 ? '' : 's'}</span
							>
						</div>
						<div class="app-status">
							{#if isMigrated}
								<span class="status-badge status-migrated">✓ Migrated</span>
							{:else if isMigrating}
								<span class="status-badge status-migrating">Migrating…</span>
							{:else if migrationError}
								<div class="status-error">
									<span class="status-badge status-failed">Failed</span>
									<span class="error-message">{migrationError}</span>
								</div>
							{:else}
								<span class="status-badge status-legacy">Legacy</span>
							{/if}
						</div>
						<div class="app-actions">
							{#if !isMigrated}
								<button
									type="button"
									class="migrate-btn"
									disabled={isMigrating}
									onclick={() => handleMigrate(data)}
								>
									{isMigrating ? 'Migrating…' : 'Migrate'}
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<!-- INFO + ZSP SECTION -->
			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<div class="info-section">
				<h3 class="info-title">What happens during migration?</h3>
				<ul class="info-list">
					{#if hasLegacyApps && !allAppsMigrated}
						<li>
							<strong>Apps:</strong> New asset events (kind 3063) replace legacy file events (kind 1063)
						</li>
					{/if}
					{#if hasLegacyStacks && !allStacksMigrated}
						<li>
							<strong>Stacks:</strong> Community (h) and platform (f) tags are added for discoverability
						</li>
					{/if}
					<li>All events are signed with your browser extension</li>
					<li>Original timestamps are preserved</li>
				</ul>
			</div>

			<div class="zsp-section">
				<h3 class="zsp-title">For Ongoing Publishing</h3>
				<p class="zsp-text">
					Use <strong>zsp</strong> — the Zapstore CLI — to publish future releases.
				</p>
				<div class="zsp-install">
					<code>go install github.com/zapstore/zsp@latest</code>
				</div>
				<a href="/docs/publish" class="zsp-link">Read the publishing docs →</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.migration-shell {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 20px;
	}

	.empty-state,
	.success-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 48px 24px;
		gap: 12px;
	}

	.empty-icon,
	.success-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		color: hsl(var(--primary));
	}

	.empty-title,
	.success-title {
		font-size: 18px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.empty-text,
	.success-text {
		font-size: 14px;
		color: hsl(var(--white66));
		margin: 0;
		max-width: 320px;
	}

	.error-text {
		font-size: 14px;
		color: hsl(0 84% 60%);
		margin: 0;
	}

	.migration-content {
		max-width: 640px;
		margin: 0 auto;
	}

	.migration-section {
		margin-bottom: 32px;
	}

	.migration-section + .migration-section {
		padding-top: 24px;
		border-top: 1px solid hsl(var(--border));
	}

	.migration-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}

	.header-text {
		flex: 1;
	}

	.header-title {
		font-size: 16px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 6px;
	}

	.header-description {
		font-size: 13px;
		color: hsl(var(--white66));
		margin: 0;
		line-height: 1.5;
	}

	/* Align the global btn class to the flex row */
	.success-description {
		color: hsl(142 71% 45%);
	}

	/* Align the global btn class to the flex row */
	.migrate-all-btn {
		flex-shrink: 0;
	}

	/* Disabled state override for the global btn class */
	.migrate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.item-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: hsl(var(--white4));
		border-radius: 12px;
	}

	.item-card.migrated {
		opacity: 0.6;
	}

	.item-icon {
		flex-shrink: 0;
	}

	.stack-icon {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		background: hsl(var(--white8));
		border-radius: 10px;
	}

	.item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-name {
		font-size: 14px;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		font-size: 12px;
		color: hsl(var(--white50));
	}

	.item-status {
		flex-shrink: 0;
	}

	.status-badge {
		display: inline-block;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
	}

	.status-legacy {
		background: hsl(45 93% 47% / 0.15);
		color: hsl(45 93% 47%);
	}

	.status-migrating {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.status-migrated {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.status-failed {
		background: hsl(0 84% 60% / 0.15);
		color: hsl(0 84% 60%);
	}

	.status-error {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-end;
	}

	.error-message {
		font-size: 11px;
		color: hsl(0 84% 60%);
		max-width: 150px;
		text-align: right;
	}

	.item-actions {
		flex-shrink: 0;
	}

	.info-section {
		padding: 16px;
		background: hsl(var(--white4));
		border-radius: 12px;
		margin-bottom: 24px;
	}

	.info-title {
		font-size: 14px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 12px;
	}

	.info-list {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.info-list li {
		font-size: 13px;
		color: hsl(var(--white66));
		line-height: 1.4;
	}

	.info-list strong {
		color: hsl(var(--foreground));
	}

	.zsp-section {
		padding: 20px;
		background: hsl(var(--primary) / 0.08);
		border-radius: 12px;
	}

	.success-state .zsp-section {
		margin-top: 32px;
		max-width: 400px;
	}

	.zsp-title {
		font-size: 14px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 8px;
	}

	.zsp-text {
		font-size: 13px;
		color: hsl(var(--white66));
		margin: 0 0 12px;
		line-height: 1.5;
	}

	.zsp-install {
		background: hsl(var(--black33));
		padding: 10px 14px;
		border-radius: 8px;
		margin-bottom: 12px;
	}

	.zsp-install code {
		font-size: 13px;
		color: hsl(var(--foreground));
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	.zsp-link {
		font-size: 13px;
		color: hsl(var(--primary));
		text-decoration: none;
		font-weight: 500;
	}

	.zsp-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.migration-header {
			flex-direction: column;
			gap: 12px;
		}

		.migrate-all-btn {
			width: 100%;
		}

		.item-card {
			flex-wrap: wrap;
		}

		.item-status {
			order: 4;
			width: 100%;
			margin-top: 8px;
		}

		.item-actions {
			order: 3;
			margin-left: auto;
		}
	}
</style>
