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
	import CodeBlock from '$lib/components/common/CodeBlock.svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import ActivityStackMiniBadge from '$lib/components/community/ActivityStackMiniBadge.svelte';

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
		<div class="nothing-state">
			<div class="empty-state">
				<div class="empty-icon">
					<Check variant="outline" size={22} strokeWidth={2.4} color="var(--blurpleColor)" />
				</div>
				<p class="empty-title">No Migration Needed</p>
				<p class="empty-text">All your apps and stacks are up to date.</p>
			</div>
			<div class="panel panel-gray33 panel-p-20 zsp-section nothing-zsp">
				<h3 class="zsp-title">For Ongoing Publishing</h3>
				<p class="zsp-text">
					Use <strong>zsp</strong> — the Zapstore CLI — to publish future releases.
				</p>
				<CodeBlock code="go install github.com/zapstore/zsp@latest" background="black33" />
				<a href="/docs/publish" class="btn-secondary-small">Read the publishing docs</a>
			</div>
		</div>
	{:else if allMigrated}
		<div class="success-state">
			<div class="success-icon">
				<Check variant="outline" size={22} strokeWidth={2.4} color="var(--blurpleColor)" />
			</div>
			<p class="success-title">Migration Complete</p>
			<p class="success-text">All your apps and stacks have been migrated.</p>

			<div class="panel panel-gray33 panel-p-20 zsp-section">
				<h3 class="zsp-title">For Ongoing Publishing</h3>
				<p class="zsp-text">
					Use <strong>zsp</strong> — the Zapstore CLI — to publish future releases.
				</p>
				<CodeBlock code="go install github.com/zapstore/zsp@latest" background="black33" />
				<a href="/docs/publish" class="btn-secondary-small">Read the publishing docs</a>
			</div>
		</div>
	{:else}
		<div class="migration-content">
			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<!-- APP MIGRATION SECTION -->
			<!-- ═══════════════════════════════════════════════════════════════════ -->
			{#if hasLegacyApps}
				<section class="migration-section">
					<div class="migration-header">
						<div class="header-text">
							<h2 class="header-title">
								<img src="/images/emoji/app.png" class="section-emoji" alt="" />
								App Migration
							</h2>
							{#if allAppsMigrated}
								<p class="header-description success-description">
									<Check variant="outline" size={13} strokeWidth={2.6} color="hsl(142 71% 45%)" />
									All {legacyApps.length} app{legacyApps.length === 1 ? '' : 's'} migrated
								</p>
							{:else}
								<p class="header-description">
									{pendingApps.length} app{pendingApps.length === 1 ? '' : 's'} use the legacy event
									format (kind 1063). Migrate to the modern format (kind 3063).
								</p>
							{/if}
						</div>
						{#if pendingApps.length > 1}
							<button type="button" class="btn-secondary-small" onclick={handleMigrateAllApps}>
								Migrate All
							</button>
						{/if}
					</div>

					<div class="item-list">
						{#each legacyApps as data (data.app.id)}
							{@const isMigrating = appMigratingIds.has(data.app.id)}
							{@const isMigrated = appMigratedIds.has(data.app.id)}
							{@const migrationError = appMigrationErrors.get(data.app.id)}

							<div class="item-card" class:migrated={isMigrated}>
								<div class="item-icon">
									<AppPic icon={data.parsed.icon} name={data.parsed.name} size={44} />
								</div>
								<div class="item-info">
									<span class="item-name">{data.parsed.name}</span>
									<span class="item-meta"
										>v{data.release.tags.find((t) => t[0] === 'version')?.[1] ||
											data.release.tags.find((t) => t[0] === 'd')?.[1]?.split('@')[1] ||
											'?'} • {data.artifacts.length} artifact{data.artifacts.length === 1
											? ''
											: 's'}</span
									>
								</div>
								<div class="item-status">
									{#if isMigrated}
										<span class="status-badge status-migrated">
											<Check variant="outline" size={12} strokeWidth={2.6} color="var(--blurpleColor)" />
											Migrated
										</span>
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
								<div class="item-actions">
									{#if !isMigrated}
										<button
											type="button"
											class="btn-primary-small"
											disabled={isMigrating}
											onclick={() => handleMigrateApp(data)}
										>
											{isMigrating ? 'Migrating…' : 'Migrate'}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<!-- STACK MIGRATION SECTION -->
			<!-- ═══════════════════════════════════════════════════════════════════ -->
			{#if hasLegacyStacks}
				<section class="migration-section">
					<div class="migration-header">
						<div class="header-text">
							<h2 class="header-title">
								<img src="/images/emoji/stack.png" class="section-emoji" alt="" />
								Stack Migration
							</h2>
							{#if allStacksMigrated}
								<p class="header-description success-description">
									<Check variant="outline" size={13} strokeWidth={2.6} color="hsl(142 71% 45%)" />
									All {legacyStacks.length} stack{legacyStacks.length === 1 ? '' : 's'} migrated
								</p>
							{:else}
								<p class="header-description">
									{pendingStacks.length} stack{pendingStacks.length === 1 ? '' : 's'} need community
									and platform tags to be discoverable.
								</p>
							{/if}
						</div>
						{#if pendingStacks.length > 1}
							<button type="button" class="btn-secondary-small" onclick={handleMigrateAllStacks}>
								Migrate All
							</button>
						{/if}
					</div>

					<div class="item-list">
						{#each legacyStacks as data (data.event.id)}
							{@const isMigrating = stackMigratingIds.has(data.event.id)}
							{@const isMigrated = stackMigratedIds.has(data.event.id)}
							{@const migrationError = stackMigrationErrors.get(data.event.id)}

							<div class="item-card" class:migrated={isMigrated}>
								<div class="item-icon">
									<ActivityStackMiniBadge />
								</div>
								<div class="item-info">
									<span class="item-name">{data.parsed.title || data.parsed.dTag}</span>
									<span class="item-meta"
										>{data.parsed.appRefs?.length || 0} app{(data.parsed.appRefs?.length || 0) === 1
											? ''
											: 's'}</span
									>
								</div>
								<div class="item-status">
									{#if isMigrated}
										<span class="status-badge status-migrated">
											<Check variant="outline" size={12} strokeWidth={2.6} color="var(--blurpleColor)" />
											Migrated
										</span>
									{:else if isMigrating}
										<span class="status-badge status-migrating">Migrating…</span>
									{:else if migrationError}
										<div class="status-error">
											<span class="status-badge status-failed">Failed</span>
											<span class="error-message">{migrationError}</span>
										</div>
									{:else}
										<span class="status-badge status-legacy">{getMissingTagsLabel(data)}</span>
									{/if}
								</div>
								<div class="item-actions">
									{#if !isMigrated}
										<button
											type="button"
											class="btn-primary-small"
											disabled={isMigrating}
											onclick={() => handleMigrateStack(data)}
										>
											{isMigrating ? 'Migrating…' : 'Migrate'}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<!-- INFO + ZSP SECTION -->
			<!-- ═══════════════════════════════════════════════════════════════════ -->
			<div class="panel info-section">
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

			<div class="panel panel-gray33 panel-p-20 zsp-section">
				<h3 class="zsp-title">For Ongoing Publishing</h3>
				<p class="zsp-text">
					Use <strong>zsp</strong> — the Zapstore CLI — to publish future releases.
				</p>
				<CodeBlock code="go install github.com/zapstore/zsp@latest" background="black33" />
				<a href="/docs/publish" class="btn-secondary-small">Read the publishing docs</a>
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

	.nothing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
	}

	.nothing-zsp {
		width: 100%;
		max-width: 560px;
		margin-top: 8px;
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
		background: var(--white8);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		color: var(--blurpleColor);
	}

	.empty-title,
	.success-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--white);
		margin: 0;
	}

	.empty-text,
	.success-text {
		font-size: 14px;
		color: var(--white66);
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
		border-top: 1px solid var(--white16);
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
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 20px;
		font-weight: 650;
		color: var(--white);
		margin: 0 0 6px;
	}

	.section-emoji {
		width: 24px;
		height: 24px;
		object-fit: contain;
		flex-shrink: 0;
	}

	.header-description {
		font-size: 13px;
		color: var(--white66);
		margin: 0;
		line-height: 1.5;
	}

	.success-description {
		display: flex;
		align-items: center;
		gap: 5px;
		color: hsl(142 71% 45%);
	}

	/* Disabled state for global btn classes */
	:global(.btn-primary-small:disabled),
	:global(.btn-secondary-small:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
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
		background: var(--white8);
		border-radius: 12px;
	}

	.item-card.migrated {
		opacity: 0.6;
	}

	.item-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		font-size: 12px;
		color: var(--white50);
	}

	.item-status {
		flex-shrink: 0;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
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
		background: color-mix(in srgb, var(--blurpleColor) 15%, transparent);
		color: var(--blurpleColor);
	}

	.status-migrated {
		background: color-mix(in srgb, var(--blurpleColor) 15%, transparent);
		color: var(--blurpleColor);
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
		margin-bottom: 24px;
	}

	.info-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--white);
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
		color: var(--white66);
		line-height: 1.4;
	}

	.info-list strong {
		color: var(--white);
	}

	.zsp-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-align: center;
	}

	/* CodeBlock must fill panel width, not shrink to content */
	.zsp-section :global(.code-block) {
		align-self: stretch;
	}

	.success-state .zsp-section {
		margin-top: 32px;
		max-width: 560px;
		width: 100%;
	}

	.zsp-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--white);
		margin: 0;
	}

	.zsp-text {
		font-size: 13px;
		color: var(--white66);
		margin: 0;
		line-height: 1.5;
	}

	@media (max-width: 640px) {
		.migration-header {
			flex-direction: column;
			gap: 12px;
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
