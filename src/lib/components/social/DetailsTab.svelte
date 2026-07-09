<script lang="js">
	/**
	 * DetailsTab - Shows identifiers and raw JSON data
	 */
	import { Copy, Check, ChevronDown, ChevronRight } from '$lib/components/icons';
	import NpubDisplay from '$lib/components/common/NpubDisplay.svelte';
	import CodeBlock from '$lib/components/common/CodeBlock.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { highlightJson } from '$lib/utils/highlight.js';
	import { loadArtifactMetadataEvents } from '$lib/purpleweb';
	import { ZAPSTORE_RELAY } from '$lib/config.js';
	import { nip19 } from 'nostr-tools';
	import { parseFileMetadata } from '$lib/nostr/models.js';
	let {
		shareableId = '',
		publicationLabel = 'Publication',
		npub = '',
		pubkey = '',
		rawData = null,
		className = '',
		shareLink = '',
		repository = '',
		panelBackground = 'gray66',
		/** @type {Array<{id: string, naddr?: string, version: string, rawEvent?: object}>} */
		releases = []
	} = $props();
	let publicationCopied = $state(false);
	let profileCopied = $state(false);
	let shareLinkCopied = $state(false);
	let repositoryCopied = $state(false);
	let releasesModalOpen = $state(false);
	let releaseIdCopied = $state(false);
	/** JSON sub-modal state */
	let jsonModalOpen = $state(false);
	let jsonModalIdx = $state(-1);
	let jsonModalHighlighted = $state('');
	/**
	 * @type {Record<number, { loading: boolean, artifacts: Array<{ eventId: string|null, nevent: string|null, hash: string|null, url: string|null, relayHint: string|null }> }>}
	 */
	let releaseMeta = $state({});
	function formatShareableId(id) {
		if (!id || id.length < 30) return id || '';
		return `${id.slice(0, 16)}...${id.slice(-8)}`;
	}
	/** Display only: strip https:// for any URL (share link, repo, etc.); copy still gets full URL. */
	function urlDisplayWithoutProtocol(url) {
		if (!url || typeof url !== 'string') return '';
		return url.replace(/^https?:\/\//, '');
	}
	/** Format a Unix timestamp (seconds) as a readable date string. */
	function formatDate(ts) {
		if (!ts) return '';
		return new Date(ts * 1000).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
	// Strip internal Dexie fields (_tags) to show the actual Nostr event
	const cleanedRawData = $derived.by(() => {
		if (!rawData) return null;
		const { _tags: _tagsField, ...nostrEvent } = rawData;
		return nostrEvent;
	});
	const formattedJson = $derived(cleanedRawData ? JSON.stringify(cleanedRawData, null, 2) : '');
	const panelBgClass = $derived(panelBackground === 'black33' ? 'panel-black33' : 'panel-gray66');
	const codeBlockBackground = $derived(panelBackground === 'black33' ? 'black33' : 'gray33');

	let highlightedJson = $state('');
	$effect(() => {
		if (formattedJson) {
			highlightJson(formattedJson).then((html) => {
				highlightedJson = html;
			});
		} else {
			highlightedJson = '';
		}
	});

	/** Formatted JSON for the release JSON sub-modal. */
	const jsonModalFormatted = $derived.by(() => {
		if (jsonModalIdx < 0 || !releases[jsonModalIdx]?.rawEvent) return '';
		const { _tags: _, ...nostrEvent } = releases[jsonModalIdx].rawEvent;
		return JSON.stringify(nostrEvent, null, 2);
	});
	$effect(() => {
		if (jsonModalFormatted) {
			highlightJson(jsonModalFormatted).then((html) => {
				jsonModalHighlighted = html;
			});
		} else {
			jsonModalHighlighted = '';
		}
	});

	/** Auto-fetch artifact metadata for all releases when the modal opens. */
	$effect(() => {
		if (releasesModalOpen) {
			for (let i = 0; i < releases.length; i++) {
				if (!releaseMeta[i]) fetchMeta(i);
			}
		}
	});

	function openJsonModal(idx) {
		jsonModalIdx = idx;
		jsonModalOpen = true;
	}
	async function copyReleaseId() {
		const val = releaseNaddr(releases[0]);
		if (!val) return;
		try {
			await navigator.clipboard.writeText(val);
			releaseIdCopied = true;
			setTimeout(() => (releaseIdCopied = false), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	async function copyPublicationId() {
		if (!shareableId) return;
		try {
			await navigator.clipboard.writeText(shareableId);
			publicationCopied = true;
			setTimeout(() => (publicationCopied = false), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	async function copyProfileId() {
		if (!npub) return;
		try {
			await navigator.clipboard.writeText(npub);
			profileCopied = true;
			setTimeout(() => (profileCopied = false), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	async function copyShareLink() {
		if (!shareLink) return;
		try {
			await navigator.clipboard.writeText(shareLink);
			shareLinkCopied = true;
			setTimeout(() => (shareLinkCopied = false), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	async function copyRepository() {
		if (!repository) return;
		try {
			await navigator.clipboard.writeText(repository);
			repositoryCopied = true;
			setTimeout(() => (repositoryCopied = false), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	function releaseNaddr(release) {
		return release?.naddr || release?.id || '';
	}
	function releaseTitle(release) {
		return release?.version ? `v${release.version}` : formatShareableId(releaseNaddr(release));
	}
	/** Extract a 64-char lowercase hex hash from a URL path. */
	function extractHashFromUrl(url) {
		if (!url) return null;
		const m = url.match(/[a-f0-9]{64}/i);
		return m ? m[0].toLowerCase() : null;
	}
	function truncateHex(hex) {
		if (!hex || hex.length < 24) return hex || '';
		return `${hex.slice(0, 16)}...${hex.slice(-8)}`;
	}
	function truncateStr(s, head = 16, tail = 8) {
		if (!s || s.length < head + tail + 3) return s || '';
		return `${s.slice(0, head)}...${s.slice(-tail)}`;
	}
	/** Encode nevent — kind omitted until we fetch the event and know for sure */
	function encodeNevent(eventId, relayHint) {
		try {
			return nip19.neventEncode({
				id: eventId,
				relays: relayHint ? [relayHint] : [ZAPSTORE_RELAY]
			});
		} catch {
			return null;
		}
	}
	/** Extract inline hashes baked into release event tags/URL (no 1063 fetch needed). */
	function inlineHashesFromRaw(raw) {
		const HEX64 = /^[a-f0-9]{64}$/i;
		/** @type {string[]} */
		const out = [];
		for (const t of raw.tags ?? []) {
			if ((t[0] === 'x' || t[0] === 'X') && t[1] && HEX64.test(t[1])) {
				const v = t[1].toLowerCase();
				if (!out.includes(v)) out.push(v);
			}
			const urlFromTag = t[0] === 'url' ? t[1] : null;
			if (urlFromTag) {
				const h = extractHashFromUrl(urlFromTag);
				if (h && !out.includes(h)) out.push(h);
			}
		}
		return out;
	}
	/** Core fetch — always runs, caller manages cache invalidation. */
	async function fetchMeta(idx) {
		const raw = releases[idx]?.rawEvent;
		if (!raw) {
			releaseMeta = { ...releaseMeta, [idx]: { loading: false, artifacts: [] } };
			return;
		}
		releaseMeta = { ...releaseMeta, [idx]: { loading: true, artifacts: [] } };
		// Collect #e tag artifact IDs + relay hints
		const eTagData = (raw.tags || [])
			.filter((t) => (t[0] === 'e' || t[0] === 'E') && t[1])
			.map((t) => ({ id: /** @type {string} */ (t[1]), relay: t[2] ?? null }));
		// No #e tags → fall back to inline hashes baked into the release event
		if (eTagData.length === 0) {
			const urlTag = (raw.tags || []).find((t) => t[0] === 'url')?.[1] ?? null;
			const inlineHashes = inlineHashesFromRaw(raw);
			console.log(
				'[DetailsTab] No #e tags on release. Inline hashes found:',
				inlineHashes,
				'url:',
				urlTag
			);
			releaseMeta = {
				...releaseMeta,
				[idx]: {
					loading: false,
					artifacts:
						inlineHashes.length > 0
							? inlineHashes.map((h) => ({
									eventId: null,
									nevent: null,
									hash: h,
									url: urlTag,
									relayHint: null
								}))
							: []
				}
			};
			return;
		}
		const artifactIds = eTagData.map((t) => t.id);
		const extraRelays = [
			...new Set(
				eTagData
					.map((t) => t.relay)
					.filter(/** @type {(r: string|null) => r is string} */ (r) => !!r)
			)
		];
		console.log(
			`[DetailsTab] Fetching ${artifactIds.length} asset event(s) (kind 3063/1063):`,
			artifactIds
		);
		/**
		 * @type {Array<{ eventId: string, nevent: string|null, hash: string|null, url: string|null, relayHint: string|null }>}
		 */
		let artifacts = eTagData.map(({ id, relay }) => ({
			eventId: id,
			nevent: encodeNevent(id, relay),
			hash: null,
			url: null,
			relayHint: relay
		}));
		try {
			const fileEvents = await loadArtifactMetadataEvents(artifactIds, extraRelays);
			console.log(`[DetailsTab] Loaded asset metadata: ${fileEvents.length} / ${artifactIds.length}`);
			// Extract hash — same logic as collect-blob-hashes
			const HEX64 = /^[a-f0-9]{64}$/i;
			for (const fe of fileEvents) {
				const parsed = parseFileMetadata(fe);
				let hash = parsed.hash && HEX64.test(parsed.hash) ? parsed.hash.toLowerCase() : null;
				if (!hash) {
					const xTag = fe.tags?.find((t) => t[0]?.toLowerCase() === 'x')?.[1];
					if (xTag && HEX64.test(xTag)) hash = xTag.toLowerCase();
				}
				if (!hash && parsed.url) hash = extractHashFromUrl(parsed.url);
				const url = fe.tags?.find((t) => t[0] === 'url')?.[1] ?? null;
				const i = artifacts.findIndex((a) => a.eventId === fe.id);
				if (i >= 0) artifacts[i] = { ...artifacts[i], hash, url };
				console.log(`[DetailsTab] kind ${fe.kind} ${fe.id.slice(0, 12)}: hash=${hash}`);
			}
		} catch (e) {
			console.error('[DetailsTab] Failed to fetch asset metadata:', e);
		}
		// 4. Last resort: inline hashes baked directly into the release event tags
		const foundAny = artifacts.some((a) => a.hash);
		if (!foundAny) {
			const inlineHashes = inlineHashesFromRaw(raw);
			console.log('[DetailsTab] No hash from asset events. Inline fallback:', inlineHashes);
			for (const h of inlineHashes) {
				if (!artifacts.some((a) => a.hash === h)) {
					artifacts.push({ eventId: null, nevent: null, hash: h, url: null, relayHint: null });
				}
			}
		}
		releaseMeta = { ...releaseMeta, [idx]: { loading: false, artifacts } };
	}
	async function retryMeta(idx) {
		const next = { ...releaseMeta };
		delete next[idx];
		releaseMeta = next;
		await fetchMeta(idx);
	}

</script>

<div class="details-tab {className}">
	<h3 class="eyebrow-label section-title">IDENTIFIERS</h3>
	<div class="panel {panelBgClass}">
		<div class="identifier-row">
			<span class="identifier-label">{publicationLabel}</span>
			<span class="identifier-value">{formatShareableId(shareableId)}</span>
			<button type="button" class="copy-btn" onclick={copyPublicationId} aria-label="Copy">
				{#if publicationCopied}
					<span class="check-icon">
						<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
					</span>
				{:else}
					<Copy variant="outline" size={16} color="var(--white66)" />
				{/if}
			</button>
		</div>

		{#if releases.length > 0}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<button
					type="button"
					class="release-label-btn"
					onclick={() => (releasesModalOpen = true)}
					aria-label="View all releases"
				>
					<span class="identifier-label">Release</span>
				{#if releases[0]?.version}
					<span class="release-version-tag">
						{releases[0].version}
						<ChevronDown variant="outline" strokeWidth={2} size={13} color="var(--white33)" />
					</span>
				{:else}
					<span class="release-version-tag release-version-tag-empty">
						<ChevronDown variant="outline" strokeWidth={2} size={13} color="var(--white33)" />
					</span>
					{/if}
				</button>
			<span class="identifier-value">{formatShareableId(releaseNaddr(releases[0]))}</span>
			<button
				type="button"
				class="copy-btn"
				onclick={copyReleaseId}
				aria-label="Copy release ID"
			>
				{#if releaseIdCopied}
					<span class="check-icon">
						<Check
							variant="outline"
							size={14}
							strokeWidth={2.8}
							color="var(--blurpleLightColor)"
						/>
					</span>
				{:else}
					<Copy variant="outline" size={16} color="var(--white66)" />
				{/if}
			</button>
			</div>
		{/if}

		{#if shareLink}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<span class="identifier-label">Share link</span>
				<span class="identifier-value" title={shareLink}
					>{urlDisplayWithoutProtocol(shareLink)}</span
				>
				<button type="button" class="copy-btn" onclick={copyShareLink} aria-label="Copy share link">
					{#if shareLinkCopied}
						<span class="check-icon">
							<Check
								variant="outline"
								size={14}
								strokeWidth={2.8}
								color="var(--blurpleLightColor)"
							/>
						</span>
					{:else}
						<Copy variant="outline" size={16} color="var(--white66)" />
					{/if}
				</button>
			</div>
		{/if}

		<div class="row-divider"></div>

		<div class="identifier-row">
			<span class="identifier-label">Profile</span>
			<div class="identifier-value-right">
				<NpubDisplay {npub} {pubkey} size="md" />
			</div>
			<button type="button" class="copy-btn" onclick={copyProfileId} aria-label="Copy">
				{#if profileCopied}
					<span class="check-icon">
						<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
					</span>
				{:else}
					<Copy variant="outline" size={16} color="var(--white66)" />
				{/if}
			</button>
		</div>

		{#if repository}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<span class="identifier-label">Repository</span>
				<a
					class="identifier-value identifier-link"
					href={repository}
					title={repository}
					target="_blank"
					rel="noopener noreferrer">{urlDisplayWithoutProtocol(repository)}</a
				>
				<button
					type="button"
					class="copy-btn"
					onclick={copyRepository}
					aria-label="Copy repository"
				>
					{#if repositoryCopied}
						<span class="check-icon">
							<Check
								variant="outline"
								size={14}
								strokeWidth={2.8}
								color="var(--blurpleLightColor)"
							/>
						</span>
					{:else}
						<Copy variant="outline" size={16} color="var(--white66)" />
					{/if}
				</button>
			</div>
		{/if}
	</div>

	{#if rawData}
		<h3 class="eyebrow-label section-title raw-data-title">RAW DATA</h3>
		<CodeBlock
			html={highlightedJson}
			code={formattedJson}
			language="JSON"
			background={codeBlockBackground}
		/>
	{/if}
</div>

<!-- Releases modal -->
{#if releases.length > 0}
	<Modal
		bind:open={releasesModalOpen}
		title="Release Details"
		ariaLabel="Release Details"
		maxHeight={88}
		align="bottom"
		closeButtonMobile={true}
		class="releases-modal {jsonModalOpen ? 'releases-modal-shrunk' : ''}"
	>
		<div class="child-overlay" class:child-overlay-visible={jsonModalOpen} aria-hidden="true"></div>
		<div class="releases-list">
			{#each releases as release, idx (release.id ?? idx)}
				<div class="release-card">
					<!-- Header: version + JSON button -->
					<div class="release-card-header">
						<span class="release-card-version">{releaseTitle(release)}</span>
					{#if release.rawEvent}
						<button
							type="button"
							class="btn-secondary-small json-btn"
							onclick={() => openJsonModal(idx)}
						>
							<span class="json-btn-label">JSON</span>
							<ChevronRight variant="outline" size={12} color="var(--white33)" />
						</button>
					{/if}
					</div>

					<!-- Event section -->
					<p class="eyebrow-label release-section-eyebrow">Event</p>
					<div class="ri-rows">
						<div class="ri-row">
							<span class="ri-label">naddr</span>
							<span class="ri-value ri-mono">{formatShareableId(releaseNaddr(release))}</span>
						</div>
						{#if release.rawEvent}
							<div class="ri-divider"></div>
							<div class="ri-row">
								<span class="ri-label">id</span>
								<span class="ri-value ri-mono">{truncateHex(release.rawEvent.id)}</span>
							</div>
							<div class="ri-divider"></div>
							<div class="ri-row">
								<span class="ri-label">kind</span>
								<span class="ri-value">{release.rawEvent.kind}</span>
							</div>
							<div class="ri-divider"></div>
							<div class="ri-row">
								<span class="ri-label">pubkey</span>
								<span class="ri-value ri-mono">{truncateHex(release.rawEvent.pubkey)}</span>
							</div>
							<div class="ri-divider"></div>
							<div class="ri-row">
								<span class="ri-label">created</span>
								<span class="ri-value">{formatDate(release.rawEvent.created_at)}</span>
							</div>
						{/if}
					</div>

					<!-- Artifact section -->
					{#if release.rawEvent}
						<p class="eyebrow-label release-section-eyebrow">Artifact</p>
						{#if releaseMeta[idx]?.loading}
							<span class="ri-loading">Fetching from relay…</span>
						{:else if !releaseMeta[idx] || releaseMeta[idx].artifacts.length === 0}
							<button type="button" class="ri-retry-btn" onclick={() => retryMeta(idx)}>
								No artifact metadata found — tap to retry
							</button>
						{:else}
						{#each releaseMeta[idx].artifacts as artifact, ai (artifact.eventId ?? artifact.hash ?? ai)}
							{#if ai > 0}
								<div class="ri-artifact-divider"></div>
							{/if}
							<div class="ri-rows">
								{#if artifact.hash}
									<div class="ri-row">
										<span class="ri-label">hash</span>
										<span class="ri-value ri-mono" title={artifact.hash}>{truncateHex(artifact.hash)}</span>
									</div>
								{/if}
								{#if artifact.nevent}
									{#if artifact.hash}<div class="ri-divider"></div>{/if}
									<div class="ri-row">
										<span class="ri-label">nevent</span>
										<span class="ri-value ri-mono" title={artifact.nevent}>{truncateStr(artifact.nevent, 14, 6)}</span>
									</div>
								{:else if artifact.eventId}
									{#if artifact.hash}<div class="ri-divider"></div>{/if}
									<div class="ri-row">
										<span class="ri-label">event</span>
										<span class="ri-value ri-mono" title={artifact.eventId}>{truncateHex(artifact.eventId)}</span>
									</div>
								{/if}
								{#if artifact.url}
									{#if artifact.hash || artifact.nevent || artifact.eventId}<div class="ri-divider"></div>{/if}
									<div class="ri-row">
										<span class="ri-label">url</span>
										<span class="ri-value ri-url" title={artifact.url}>{artifact.url.replace(/^https?:\/\//, '')}</span>
									</div>
								{/if}
							</div>
						{/each}
						{/if}
					{/if}
				</div>

				{#if idx < releases.length - 1}
					<div class="releases-modal-divider"></div>
				{/if}
			{/each}
		</div>
	</Modal>
{/if}

<!-- JSON sub-modal -->

{#if jsonModalIdx >= 0}
	<Modal
		bind:open={jsonModalOpen}
		title="Event JSON"
		ariaLabel="Event JSON"
		maxHeight={70}
		align="bottom"
		noBackdrop={true}
		lockBodyScroll={false}
		closeButtonMobile={true}
		zIndex={110}
	>
		<div class="json-modal-inner">
			<CodeBlock
				html={jsonModalHighlighted}
				code={jsonModalFormatted}
				language="JSON"
				background="black33"
			/>
		</div>
	</Modal>
{/if}

<style>
	.details-tab {
		display: flex;
		flex-direction: column;
	}

	.section-title {
		padding-left: 12px;
		margin-bottom: 8px;
	}

	.section-title.raw-data-title {
		margin-top: 12px;
	}

	.section-divider {
		width: 100%;
		height: 1px;
		background-color: var(--white11);
		margin: 12px 0;
	}

	.panel {
		border-radius: 16px;
		overflow: hidden;
		padding: 0;
		margin: 0;
	}

	.panel-gray66 {
		background-color: var(--gray66);
	}

	.panel-black33 {
		background-color: var(--black33);
	}

	.identifier-row {
		display: flex;
		align-items: center;
		padding: 8px 8px 8px 14px;
		margin: 0;
	}

	.identifier-label {
		font-size: 0.875rem;
		color: var(--white);
		white-space: nowrap;
	}

	.identifier-value {
		font-size: 0.875rem;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		text-align: right;
		margin-left: 40px;
		margin-right: 14px;
	}

	.identifier-link {
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.identifier-link:hover {
		color: var(--white);
	}

	.identifier-value-right {
		display: flex;
		justify-content: flex-end;
		flex: 1;
		margin-left: 40px;
		margin-right: 16px;
	}

	.row-divider {
		width: 100%;
		margin: 0;
		padding: 0;
		height: 1px;
		background-color: var(--white11);
	}

	.copy-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--white8);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.copy-btn:hover {
		transform: scale(1.01);
	}

	.copy-btn:active {
		transform: scale(0.97);
	}

	.copy-btn .check-icon {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Release label button */
	.release-label-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}

	.release-version-tag {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white66);
		background: var(--white8);
		border-radius: 20px;
		padding: 4px 12px 4px 14px;
		white-space: nowrap;
	}

	.release-version-tag :global(svg) {
		padding-top: 2px;
	}

	.release-version-tag-empty {
		padding: 3px 6px;
	}

	/* Releases modal list */
	.releases-list {
		display: flex;
		flex-direction: column;
		padding: 12px 16px 16px;
		gap: 0;
	}

	@media (min-width: 768px) {
		.releases-list {
			padding: 12px 20px 20px;
		}
	}

	/* Per-release card */
	.release-card {
		background: var(--black33);
		border-radius: 14px;
		padding: 14px 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.release-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.release-card-version {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--white);
	}

	.release-section-eyebrow {
		color: var(--white66);
		margin: 10px 0 6px;
	}

	/* Info rows */
	.ri-rows {
		display: flex;
		flex-direction: column;
	}

	.ri-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 6px 0;
	}

	.ri-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white33);
		min-width: 3.5rem;
		flex-shrink: 0;
	}

	.ri-value {
		font-size: 0.8125rem;
		color: var(--white66);
		flex: 1;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.ri-mono {
		font-family: var(--font-mono);
	}

	.ri-url {
		font-size: 0.75rem;
	}

	.ri-divider {
		height: 1px;
		background: var(--white11);
		margin: 0;
	}

	.ri-artifact-divider {
		height: 1px;
		background: var(--white16);
		margin: 8px 0;
	}

	.ri-loading {
		font-size: 0.8125rem;
		color: var(--white33);
		font-style: italic;
		padding: 4px 0;
	}

	.ri-retry-btn {
		background: none;
		border: none;
		padding: 4px 0;
		font-size: 0.8125rem;
		color: var(--white33);
		font-style: italic;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color 0.15s ease;
		text-align: left;
	}

	.ri-retry-btn:hover {
		color: var(--white66);
	}

	/* Gap between release cards (no visible divider) */
	.releases-modal-divider {
		height: 12px;
	}

	/* JSON button */
	.json-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.json-btn-label {
		color: var(--white66);
		font-size: 0.75rem;
		font-weight: 500;
	}

	/* Child-modal scale-down effect on releases modal */
	:global(.releases-modal) {
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
	}

	:global(.releases-modal-shrunk) {
		transform: scale(0.96) translateY(8px);
	}

	/* Dim overlay inside releases modal when JSON modal is open */
	.child-overlay {
		position: absolute;
		inset: 0;
		background: var(--black33);
		z-index: 5;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}

	.child-overlay-visible {
		opacity: 1;
	}

	/* JSON sub-modal */
	.json-modal-inner {
		padding: 8px 16px 16px;
	}

	@media (min-width: 768px) {
		.json-modal-inner {
			padding: 8px 20px 20px;
		}
	}
</style>
