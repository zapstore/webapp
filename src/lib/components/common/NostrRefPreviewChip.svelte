<script lang="js">
/**
 * NostrRefPreviewChip - Inline preview chip for nostr refs in ShortTextPreview.
 * Resolves app/stack from Dexie + relays; other addressable kinds show a generic Nostr label.
 */
import { decodeNaddr, parseApp, parseAppStack } from '$lib/nostr/models';
import { resolveAppEventForNaddr, resolveStackEventForNaddr } from '$lib/nostr/service';
import { EVENT_KINDS } from '$lib/config';
import Nostr from '$lib/components/icons/Nostr.svelte';

let {
	/** Bech32 naddr or full "nostr:naddr1..." */
	naddrRaw = '',
	class: className = ''
} = $props();

const naddr = $derived(naddrRaw.startsWith('nostr:') ? naddrRaw.slice(6) : naddrRaw);

const embedKind = $derived.by(() => {
	if (!naddr) return null;
	const p = decodeNaddr(naddr);
	if (!p) return 'generic';
	if (p.kind === EVENT_KINDS.APP) return 'app';
	if (p.kind === EVENT_KINDS.APP_STACK) return 'stack';
	return 'generic';
});

let app = $state(null);
let stack = $state(null);

$effect(() => {
	if (!naddr || typeof window === 'undefined') return;
	const p = decodeNaddr(naddr);
	app = null;
	stack = null;
	if (!p) return;
	if (p.kind !== EVENT_KINDS.APP && p.kind !== EVENT_KINDS.APP_STACK) return;

	let cancelled = false;
	if (p.kind === EVENT_KINDS.APP) {
		resolveAppEventForNaddr(naddr).then((event) => {
			if (!cancelled && event) app = parseApp(event);
		});
	} else {
		resolveStackEventForNaddr(naddr).then((event) => {
			if (!cancelled && event) stack = parseAppStack(event);
		});
	}
	return () => {
		cancelled = true;
	};
});
</script>

<span class="preview-nostr-ref-inline {className}">
	{#if embedKind === 'app'}
		<span class="preview-nostr-ref-icon-wrap">
			{#if app?.icon}
				<img src={app.icon} alt="" loading="lazy" class="preview-nostr-ref-img" />
			{:else if app?.name || app?.dTag}
				<span class="preview-nostr-ref-initial"
					>{(app?.name || app?.dTag || '?').trim()[0]?.toUpperCase() ?? '?'}</span
				>
			{:else}
				<span class="preview-nostr-ref-initial">?</span>
			{/if}
		</span>
		<span class="preview-nostr-ref-label">{app?.name || app?.dTag || 'App'}</span>
	{:else if embedKind === 'stack'}
		<span class="preview-nostr-ref-icon-wrap">
			<img src="/images/emoji/stack.png" alt="" loading="lazy" class="preview-nostr-ref-img" />
		</span>
		<span class="preview-nostr-ref-label">{stack?.title || stack?.dTag || 'Stack'}</span>
	{:else}
		<span class="preview-nostr-ref-icon-wrap preview-nostr-ref-icon-wrap--svg">
			<Nostr variant="fill" color="var(--white33)" size={12} />
		</span>
		<span class="preview-nostr-ref-label">Nostr Publication</span>
	{/if}
</span>

<style>
	.preview-nostr-ref-inline {
		display: inline;
		margin: 0 0.35em;
		color: var(--white33);
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
		background: var(--white8);
		text-align: center;
		line-height: 1.2em;
	}
	.preview-nostr-ref-icon-wrap--svg {
		overflow: visible;
		background: transparent;
		vertical-align: -0.25em;
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
		color: var(--white33);
	}
</style>
