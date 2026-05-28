<script lang="js">
/**
 * ProfileDetailsTab — Identifiers + raw kind:0 profile event for a profile page.
 *
 * Lazy-fetches the kind:0 event from Dexie/relay when mounted.
 * Mirrors the structure of DetailsTab.svelte but tailored for profile metadata.
 */
import { Copy, Check } from '$lib/components/icons';
import NpubDisplay from '$lib/components/common/NpubDisplay.svelte';
import CodeBlock from '$lib/components/common/CodeBlock.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import { highlightJson } from '$lib/utils/highlight.js';
import { createProfileQuery } from '$lib/purpleweb';

let {
	npub = '',
	pubkey = '',
	about = '',
	panelBackground = 'black33',
	resolveMentionLabel = () => null
} = $props();

/** Raw kind:0 Nostr event, read from Dexie via purpleweb liveQuery. */
const profileQuery = createProfileQuery(() => pubkey);
const rawEvent = $derived(profileQuery.event);
const loading = $derived(profileQuery.loading);

let npubCopied = $state(false);
let websiteCopied = $state(false);
let nip05Copied = $state(false);
let lnCopied = $state(false);

let highlightedJson = $state('');

const profileMeta = $derived.by(() => {
	if (!rawEvent?.content) return {};
	try {
		return JSON.parse(rawEvent.content);
	} catch {
		return {};
	}
});

const description = $derived((about || profileMeta.about || '').trim());
const website = $derived((profileMeta.website ?? '').trim());
const nip05 = $derived((profileMeta.nip05 ?? '').trim());
const lnAddress = $derived((profileMeta.lud16 ?? profileMeta.lud06 ?? '').trim());

const panelBgClass = $derived(panelBackground === 'black33' ? 'panel-black33' : 'panel-gray66');
const codeBlockBackground = $derived(panelBackground === 'black33' ? 'black33' : 'gray33');

const cleanedEvent = $derived.by(() => {
	if (!rawEvent) return null;
	const { _tags: _, ...nostrEvent } = rawEvent;
	return nostrEvent;
});
const formattedJson = $derived(cleanedEvent ? JSON.stringify(cleanedEvent, null, 2) : '');

$effect(() => {
	if (formattedJson) {
		highlightJson(formattedJson).then((html) => { highlightedJson = html; });
	} else {
		highlightedJson = '';
	}
});

function urlDisplay(url) {
	if (!url) return '';
	return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function copy(text, setCopied) {
	if (!text) return;
	try {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	} catch {
		// ignore
	}
}
</script>

<div class="profile-details-tab">
	<h3 class="eyebrow-label section-title">DESCRIPTION</h3>
	<div class="panel {panelBgClass} panel-p-16 description-panel">
		{#if description}
			<div class="description-body">
				<ShortTextRenderer content={description} {resolveMentionLabel} />
			</div>
		{:else}
			<p class="description-empty">No description</p>
		{/if}
	</div>

	<h3 class="eyebrow-label section-title">IDENTIFIERS</h3>
	<div class="panel {panelBgClass} identifiers-panel">
		<div class="identifier-row">
			<span class="identifier-label">Profile</span>
			<div class="identifier-value-right">
				<NpubDisplay {npub} {pubkey} size="md" />
			</div>
			<button
				type="button"
				class="copy-btn"
				onclick={() => copy(npub, (v) => (npubCopied = v))}
				aria-label="Copy npub"
			>
				{#if npubCopied}
					<span class="check-icon">
						<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
					</span>
				{:else}
					<Copy variant="outline" size={16} color="var(--white66)" />
				{/if}
			</button>
		</div>

		{#if website}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<span class="identifier-label">Website</span>
				<a
					class="identifier-value identifier-link"
					href={website.startsWith('http') ? website : `https://${website}`}
					title={website}
					target="_blank"
					rel="noopener noreferrer"
				>{urlDisplay(website)}</a>
				<button
					type="button"
					class="copy-btn"
					onclick={() => copy(website, (v) => (websiteCopied = v))}
					aria-label="Copy website"
				>
					{#if websiteCopied}
						<span class="check-icon">
							<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
						</span>
					{:else}
						<Copy variant="outline" size={16} color="var(--white66)" />
					{/if}
				</button>
			</div>
		{/if}

		{#if nip05}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<span class="identifier-label">NIP-05</span>
				<span class="identifier-value" title={nip05}>{nip05}</span>
				<button
					type="button"
					class="copy-btn"
					onclick={() => copy(nip05, (v) => (nip05Copied = v))}
					aria-label="Copy NIP-05"
				>
					{#if nip05Copied}
						<span class="check-icon">
							<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
						</span>
					{:else}
						<Copy variant="outline" size={16} color="var(--white66)" />
					{/if}
				</button>
			</div>
		{/if}

		{#if lnAddress}
			<div class="row-divider"></div>
			<div class="identifier-row">
				<span class="identifier-label">Lightning Address</span>
				<span class="identifier-value" title={lnAddress}>{lnAddress}</span>
				<button
					type="button"
					class="copy-btn"
					onclick={() => copy(lnAddress, (v) => (lnCopied = v))}
					aria-label="Copy lightning address"
				>
					{#if lnCopied}
						<span class="check-icon">
							<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
						</span>
					{:else}
						<Copy variant="outline" size={16} color="var(--white66)" />
					{/if}
				</button>
			</div>
		{/if}
	</div>

	{#if rawEvent}
		<h3 class="eyebrow-label section-title raw-data-title">RAW DATA</h3>
		<CodeBlock
			html={highlightedJson}
			code={formattedJson}
			language="JSON"
			background={codeBlockBackground}
		/>
	{:else if loading}
		<p class="loading-hint">Loading profile event…</p>
	{/if}
</div>

<style>
	.profile-details-tab {
		display: flex;
		flex-direction: column;
	}

	.section-title {
		padding-left: 12px;
		margin-bottom: 8px;
	}

	.section-title:not(:first-child) {
		margin-top: 12px;
	}

	.description-body {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--white66);
		word-break: break-word;
	}

	.description-empty {
		margin: 0;
		font-size: 0.875rem;
		color: var(--white33);
	}

	.panel {
		border-radius: 16px;
		overflow: hidden;
	}

	.identifiers-panel {
		padding: 0;
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
	}

	.identifier-label {
		font-size: 0.875rem;
		color: var(--white);
		white-space: nowrap;
		flex-shrink: 0;
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
		height: 1.4px;
		background-color: var(--shell-border);
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

	.copy-btn:hover { transform: scale(1.01); }
	.copy-btn:active { transform: scale(0.97); }

	.copy-btn .check-icon {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0%   { transform: scale(0); }
		50%  { transform: scale(1.2); }
		100% { transform: scale(1); }
	}

	.loading-hint {
		font-size: 0.875rem;
		color: var(--white33);
		padding-top: 12px;
		padding-left: 12px;
	}
</style>
