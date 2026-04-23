<script lang="js">
	/**
	 * DetailsTab - Shows identifiers and raw JSON data
	 */
	import { Copy, Check, ChevronDown } from '$lib/components/icons';
	import NpubDisplay from '$lib/components/common/NpubDisplay.svelte';
	import CodeBlock from '$lib/components/common/CodeBlock.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { highlightJson } from '$lib/utils/highlight.js';
	import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
	import { fetchFromRelays } from '$lib/nostr/service.js';
	import { ZAPSTORE_RELAY, EVENT_KINDS } from '$lib/config.js';
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
	/** Tracks which modal row copy was last triggered: { idx, type: 'id' | 'json' } */
	let modalCopied = $state(null);
	/** Index of the release row currently showing metadata (-1 = none) */
	let metaExpandedIdx = $state(-1);
	/**
	 * @type {Record<number, { loading: boolean, artifacts: Array<{ eventId: string|null, nevent: string|null, hash: string|null, url: string|null, relayHint: string|null }> }>}
	 */
	let releaseMeta = $state({});
	/** @type {{ idx: number, field: string } | null} */
	let metaCopied = $state(null);
	function formatShareableId(id) {
		if (!id || id.length < 30) return id || '';
		return `${id.slice(0, 16)}...${id.slice(-8)}`;
	}
	/** Display only: strip https:// for any URL (share link, repo, etc.); copy still gets full URL. */
	function urlDisplayWithoutProtocol(url) {
		if (!url || typeof url !== 'string') return '';
		return url.replace(/^https?:\/\//, '');
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
		// Use only the Zapstore relay + any relay hints from the #e tags (NOT the profile relay)
		const extraRelays = [
			...new Set(
				eTagData
					.map((t) => t.relay)
					.filter(/** @type {(r: string|null) => r is string} */ (r) => !!r)
			)
		];
		const relaysToSearch = [...new Set([ZAPSTORE_RELAY, ...extraRelays])];
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
		// Both modern (3063) and legacy (1063) asset kinds
		const assetKinds = [EVENT_KINDS.ASSET, EVENT_KINDS.FILE_METADATA];
		try {
			// 1. Check Dexie first
			let fileEvents = await queryEvents({ kinds: assetKinds, ids: artifactIds });
			console.log(`[DetailsTab] Dexie hit: ${fileEvents.length} / ${artifactIds.length}`);
			const have = new Set(fileEvents.map((e) => e.id));
			const missing = artifactIds.filter((id) => !have.has(id));
			// 2. Fetch missing from Zapstore relay only — asset events don't live on the profile relay
			if (missing.length > 0) {
				console.log(`[DetailsTab] Fetching ${missing.length} from relay:`, relaysToSearch);
				const fetched = await fetchFromRelays(
					relaysToSearch,
					{ kinds: assetKinds, ids: missing, limit: missing.length },
					{ timeout: 10000, feature: 'details-tab-files' }
				);
				console.log(`[DetailsTab] Relay returned ${fetched.length} event(s)`);
				if (fetched.length > 0) {
					await putEvents(fetched);
					fileEvents = [...fileEvents, ...fetched];
				}
			}
			// 3. Extract hash — same logic as collect-blob-hashes
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
	async function toggleMeta(idx) {
		if (metaExpandedIdx === idx) {
			metaExpandedIdx = -1;
			return;
		}
		metaExpandedIdx = idx;
		if (releaseMeta[idx]?.artifacts?.length > 0) return;
		await fetchMeta(idx);
	}
	async function retryMeta(idx) {
		const next = { ...releaseMeta };
		delete next[idx];
		releaseMeta = next;
		await fetchMeta(idx);
	}
	async function copyMetaValue(idx, field, value) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			metaCopied = { idx, field };
			setTimeout(() => (metaCopied = null), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	async function copyModalReleaseId(idx) {
		const val = releaseNaddr(releases[idx]);
		if (!val) return;
		try {
			await navigator.clipboard.writeText(val);
			modalCopied = { idx, type: 'id' };
			setTimeout(() => (modalCopied = null), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	async function copyModalReleaseJson(idx) {
		const raw = releases[idx]?.rawEvent;
		if (!raw) return;
		try {
			const { _tags: _, ...nostrEvent } = raw;
			await navigator.clipboard.writeText(JSON.stringify(nostrEvent, null, 2));
			modalCopied = { idx, type: 'json' };
			setTimeout(() => (modalCopied = null), 1500);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
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
							<ChevronDown variant="outline" strokeWidth={2} size={11} color="var(--white33)" />
						</span>
					{:else}
						<span class="release-version-tag release-version-tag-empty">
							<ChevronDown variant="outline" strokeWidth={2} size={11} color="var(--white33)" />
						</span>
					{/if}
				</button>
				<span class="identifier-value">{formatShareableId(releaseNaddr(releases[0]))}</span>
				<button
					type="button"
					class="copy-btn"
					onclick={() => copyModalReleaseId(0)}
					aria-label="Copy release ID"
				>
					{#if modalCopied?.idx === 0 && modalCopied?.type === 'id'}
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
		maxHeight={72}
		closeButtonMobile={true}
	>
		<div class="releases-modal-list">
			{#each releases as release, idx (release.id ?? idx)}
			<div class="releases-modal-row">
				{#if release.version}
					<span class="releases-modal-version">{release.version}</span>
				{/if}
				<button
					type="button"
					class="release-row-btn release-naddr-btn"
					onclick={() => copyModalReleaseId(idx)}
					aria-label="Copy naddr"
					title={releaseNaddr(release)}
				>
					<span class="releases-modal-naddr">{formatShareableId(releaseNaddr(release))}</span>
					<span class="release-row-icon">
						{#if modalCopied?.idx === idx && modalCopied?.type === 'id'}
							<Check
								variant="outline"
								size={14}
								strokeWidth={2.8}
								color="var(--blurpleLightColor)"
							/>
						{:else}
							<Copy variant="outline" size={16} color="var(--white33)" />
						{/if}
					</span>
				</button>
				{#if release.rawEvent}
					<button
						type="button"
						class="release-row-btn"
						onclick={() => copyModalReleaseJson(idx)}
						aria-label="Copy JSON"
					>
						{#if modalCopied?.idx === idx && modalCopied?.type === 'json'}
							<Check
								variant="outline"
								size={14}
								strokeWidth={2.8}
								color="var(--blurpleLightColor)"
							/>
						{:else}
							<span class="release-btn-label">JSON</span>
							<span class="release-row-icon">
								<Copy variant="outline" size={16} color="var(--white33)" />
							</span>
						{/if}
					</button>
					<button
						type="button"
						class="release-row-btn {metaExpandedIdx === idx ? 'release-meta-active' : ''}"
						onclick={() => toggleMeta(idx)}
						aria-label="Show metadata"
					>
						<span class="release-btn-label">Metadata</span>
						<span
							class="release-row-icon {metaExpandedIdx === idx ? 'release-chevron-open' : ''}"
						>
						<ChevronDown
							variant="outline"
							size={13}
							color={metaExpandedIdx === idx ? 'var(--white)' : 'var(--white33)'}
						/>
						</span>
					</button>
				{/if}
			</div>
				{#if metaExpandedIdx === idx}
					<div class="releases-meta-panel">
						{#if releaseMeta[idx]?.loading}
							<span class="meta-loading">Fetching from relay…</span>
						{:else if !releaseMeta[idx] || releaseMeta[idx].artifacts.length === 0}
							<button type="button" class="meta-retry-btn" onclick={() => retryMeta(idx)}>
								No artifact metadata found — click to retry
							</button>
						{:else}
							{#each releaseMeta[idx].artifacts as artifact, ai (artifact.eventId ?? artifact.hash ?? ai)}
								{#if ai > 0}
									<div class="meta-artifact-divider"></div>
								{/if}
								<div class="meta-artifact">
									<div class="meta-row">
										<span class="meta-label">Hash</span>
										{#if artifact.hash}
											<button
												type="button"
												class="meta-value-btn"
												onclick={() => copyMetaValue(idx, `hash-${ai}`, artifact.hash)}
												title={artifact.hash}
												aria-label="Copy hash"
											>
												<span class="meta-mono">{truncateHex(artifact.hash)}</span>
												{#if metaCopied?.idx === idx && metaCopied?.field === `hash-${ai}`}
													<Check
														variant="outline"
														size={11}
														strokeWidth={2.8}
														color="var(--blurpleLightColor)"
													/>
												{:else}
													<Copy variant="outline" size={12} color="var(--white33)" />
												{/if}
											</button>
										{:else}
											<button type="button" class="meta-retry-btn" onclick={() => retryMeta(idx)}
												>not found — retry</button
											>
										{/if}
									</div>
									{#if artifact.nevent}
										<div class="meta-row">
											<span class="meta-label">nevent</span>
											<button
												type="button"
												class="meta-value-btn"
												onclick={() => copyMetaValue(idx, `nevent-${ai}`, artifact.nevent)}
												title={artifact.nevent}
												aria-label="Copy nevent"
											>
												<span class="meta-mono">{truncateStr(artifact.nevent, 14, 6)}</span>
												{#if metaCopied?.idx === idx && metaCopied?.field === `nevent-${ai}`}
													<Check
														variant="outline"
														size={11}
														strokeWidth={2.8}
														color="var(--blurpleLightColor)"
													/>
												{:else}
													<Copy variant="outline" size={12} color="var(--white33)" />
												{/if}
											</button>
										</div>
									{:else if artifact.eventId}
										<div class="meta-row">
											<span class="meta-label">event</span>
											<button
												type="button"
												class="meta-value-btn"
												onclick={() => copyMetaValue(idx, `eid-${ai}`, artifact.eventId)}
												title={artifact.eventId}
												aria-label="Copy event ID"
											>
												<span class="meta-mono">{truncateHex(artifact.eventId)}</span>
												{#if metaCopied?.idx === idx && metaCopied?.field === `eid-${ai}`}
													<Check
														variant="outline"
														size={11}
														strokeWidth={2.8}
														color="var(--blurpleLightColor)"
													/>
												{:else}
													<Copy variant="outline" size={12} color="var(--white33)" />
												{/if}
											</button>
										</div>
									{/if}
									{#if artifact.url}
										<div class="meta-row">
											<span class="meta-label">URL</span>
											<button
												type="button"
												class="meta-value-btn meta-url-btn"
												onclick={() => copyMetaValue(idx, `url-${ai}`, artifact.url)}
												title={artifact.url}
												aria-label="Copy URL"
											>
												<span class="meta-url-text">{artifact.url.replace(/^https?:\/\//, '')}</span
												>
												{#if metaCopied?.idx === idx && metaCopied?.field === `url-${ai}`}
													<Check
														variant="outline"
														size={11}
														strokeWidth={2.8}
														color="var(--blurpleLightColor)"
													/>
												{:else}
													<Copy variant="outline" size={12} color="var(--white33)" />
												{/if}
											</button>
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/if}
				{#if idx < releases.length - 1}
					<div class="releases-modal-divider"></div>
				{/if}
			{/each}
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
		height: 1.4px;
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
		height: 1.4px;
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
		gap: 8px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white66);
		background: var(--white8);
		border-radius: 20px;
		padding: 4px 12px;
		white-space: nowrap;
	}

	.release-version-tag-empty {
		padding: 3px 6px;
	}

	/* Releases modal */
	.releases-modal-list {
		padding: 8px 16px 8px;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 768px) {
		.releases-modal-list {
			padding: 8px 20px 8px;
		}
	}

	.releases-modal-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
	}

	.releases-modal-version {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--white);
		white-space: nowrap;
		flex-shrink: 0;
		min-width: 5.5rem;
	}

	.releases-modal-naddr {
		font-size: 0.8125rem;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
		text-align: left;
	}

	/* Rounded-square row buttons — naddr, JSON, Metadata */
  .release-row-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 10px 0 14px;
		background: var(--white8);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.release-row-btn:hover {
		transform: scale(1.01);
	}

	.release-row-btn:active {
		transform: scale(0.97);
	}

	/* naddr button fills remaining space */
	.release-naddr-btn {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.release-row-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.release-chevron-open {
		transform: rotate(180deg);
	}

	.release-btn-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white66);
	}

	.release-meta-active {
		background: var(--white16) !important;
	}

	.release-meta-active .release-btn-label {
		color: var(--white) !important;
	}

	/* Metadata panel */
	.releases-meta-panel {
		background: var(--white4);
		border-radius: 10px;
		padding: 10px 12px;
		margin: 2px 0 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.meta-loading,
	.meta-empty {
		font-size: 0.8125rem;
		color: var(--white33);
		font-style: italic;
	}

	.meta-artifact {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.meta-artifact-divider {
		height: 1.4px;
		background: var(--white11);
		margin: 4px 0;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.meta-label {
		font-size: 0.75rem;
		color: var(--white33);
		min-width: 2.5rem;
		flex-shrink: 0;
		font-weight: 500;
	}

	.meta-value-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: none;
		border: none;
		padding: 2px 4px;
		border-radius: 4px;
		cursor: pointer;
		color: var(--white66);
		transition:
			background 0.12s ease,
			color 0.12s ease;
		min-width: 0;
		flex: 1;
	}

	.meta-value-btn:hover {
		background: var(--white8);
		color: var(--white);
	}

	.meta-mono {
		font-size: 0.8125rem;
		font-family: var(--font-mono);
		color: inherit;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-value-dim {
		font-size: 0.8125rem;
		color: var(--white33);
		font-style: italic;
	}

	.meta-retry-btn {
		background: none;
		border: none;
		padding: 0;
		font-size: 0.8125rem;
		color: var(--white33);
		font-style: italic;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color 0.15s ease;
	}

	.meta-retry-btn:hover {
		color: var(--white66);
	}

	.meta-url-btn {
		overflow: hidden;
	}

	.meta-url-text {
		font-size: 0.75rem;
		color: inherit;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.releases-modal-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.release-action-btn {
		min-width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.releases-modal-divider {
		height: 1.4px;
		background-color: var(--white11);
		margin: 0;
	}
</style>
