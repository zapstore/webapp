<script lang="js">
/**
 * NostrRefPreviewChip - Inline preview chip for nostr ref (e.g. app) in ShortTextPreview.
 * Same layout as media chip: app icon at 1.2em (same size as custom emoji) + AppName. Resolves naddr on mount.
 */
import { onMount } from 'svelte';
import { queryEvent } from '$lib/nostr/dexie';
import { decodeNaddr, parseApp } from '$lib/nostr/models';
import { EVENT_KINDS } from '$lib/config';

let {
	/** Bech32 naddr or full "nostr:naddr1..." */
	naddrRaw = '',
	class: className = ''
} = $props();

const naddr = $derived(naddrRaw.startsWith('nostr:') ? naddrRaw.slice(6) : naddrRaw);

let app = $state(null);

onMount(() => {
	if (!naddr || typeof window === 'undefined') return;
	const pointer = decodeNaddr(naddr);
	if (!pointer || pointer.kind !== EVENT_KINDS.APP) return;
	queryEvent({
		kinds: [EVENT_KINDS.APP],
		authors: [pointer.pubkey],
		'#d': [pointer.identifier]
	}).then((event) => {
		if (event) app = parseApp(event);
	});
});
</script>

<span class="preview-nostr-ref-inline {className}">
	<span class="preview-nostr-ref-icon-wrap">
		{#if app?.icon}
			<img src={app.icon} alt="" loading="lazy" class="preview-nostr-ref-img" />
		{:else if app?.name || app?.dTag}
			<span class="preview-nostr-ref-initial">{ (app?.name || app?.dTag || '?').trim()[0]?.toUpperCase() ?? '?' }</span>
		{:else}
			<span class="preview-nostr-ref-initial">?</span>
		{/if}
	</span>
	<span class="preview-nostr-ref-label">{app?.name || app?.dTag || 'App'}</span>
</span>

<style>
	.preview-nostr-ref-inline {
		display: inline;
		margin: 0 0.35em;
		color: hsl(var(--white33));
		font-size: inherit;
		font-weight: 500;
		white-space: nowrap;
	}
	.preview-nostr-ref-icon-wrap {
		display: inline-block;
		width: 1.2em;
		height: 1.2em;
		vertical-align: -0.2em;
		margin-right: 0.2em;
		border-radius: 4px;
		overflow: hidden;
		background: hsl(var(--white8));
		text-align: center;
		line-height: 1.2em;
	}
	.preview-nostr-ref-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		opacity: 0.66;
	}
	.preview-nostr-ref-initial {
		font-size: 0.65em;
		font-weight: 700;
		color: hsl(var(--white33));
	}
</style>
