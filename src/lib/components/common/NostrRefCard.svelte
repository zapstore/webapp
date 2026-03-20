<script lang="js">
/**
 * NostrRefCard - Renders a Nostr reference (e.g. app naddr) in posts/comments.
 * Used in ShortTextContent / ShortTextRenderer. White4 rounded panel with AppPic + AppName.
 * Click navigates to the app page. Different kinds can be rendered via data-kind (for now only app).
 */
import { onMount } from 'svelte';
import { queryEvent } from '$lib/nostr/dexie';
import { decodeNaddr, parseApp } from '$lib/nostr/models';
import { EVENT_KINDS } from '$lib/config';

let {
	/** Bech32 naddr (e.g. naddr1...) or full "nostr:naddr1..." */
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

{#if naddr}
	<a
		href="/apps/{naddr}"
		class="nostr-ref-card {className}"
		data-kind="app"
	>
		<div class="nostr-ref-card-inner">
			{#if app}
				<div class="nostr-ref-card-pic">
					{#if app.icon}
						<img src={app.icon} alt="" loading="lazy" />
					{:else}
						<span class="nostr-ref-card-initial">{ (app.name || app.dTag || '?').trim()[0]?.toUpperCase() ?? '?' }</span>
					{/if}
				</div>
				<span class="nostr-ref-card-name">{app.name || app.dTag}</span>
			{:else}
				<span class="nostr-ref-card-placeholder">App</span>
			{/if}
		</div>
	</a>
{/if}

<style>
	.nostr-ref-card {
		display: inline-block;
		text-decoration: none;
		color: inherit;
		margin: 0.25rem 0;
		border-radius: 12px;
		overflow: hidden;
		transition: opacity 0.15s ease;
	}
	.nostr-ref-card:hover {
		opacity: 0.9;
	}
	.nostr-ref-card-inner {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px 8px 8px;
		background: hsl(var(--white8));
		border-radius: 12px;
	}
	.nostr-ref-card-name {
		font-size: 15px;
		font-weight: 500;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}
	.nostr-ref-card-placeholder {
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white33));
	}
	.nostr-ref-card-pic {
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		border-radius: 8px;
		border: 0.33px solid hsl(var(--white16));
		background: hsl(var(--gray66));
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.nostr-ref-card-pic img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.nostr-ref-card-initial {
		font-size: 18px;
		font-weight: 700;
		color: hsl(var(--white66));
	}
</style>
