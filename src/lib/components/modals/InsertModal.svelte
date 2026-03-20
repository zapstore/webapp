<script lang="js">
/**
 * InsertModal - Insert a Nostr reference (e.g. app) into forum post content.
 * Title param. Search bar; default state = EmptyState "No apps found". Search results in black33 list with full-width dividers.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Search } from 'lucide-svelte';
import AppPic from '$lib/components/common/AppPic.svelte';
import { searchApps } from '$lib/nostr/service';
import { parseApp } from '$lib/nostr/models';
import { ZAPSTORE_RELAY } from '$lib/config';

let {
	title = 'Insert',
	isOpen = $bindable(false),
	getCurrentPubkey = () => null,
	onInsert = () => {},
	onclose = () => {}
} = $props();

let query = $state('');
let searchLoading = $state(false);
/** @type {import('nostr-tools').Event[]} */
let searchResults = $state([]);
/** @type {HTMLInputElement | null} */
let searchInputEl = $state(null);

const catalogRelays = [ZAPSTORE_RELAY, 'wss://relay.vertexlab.io'];

$effect(() => {
	if (!isOpen) {
		query = '';
		searchResults = [];
		return;
	}
	const t = setTimeout(() => searchInputEl?.focus(), 80);
	return () => clearTimeout(t);
});

$effect(() => {
	const q = query.trim();
	if (!isOpen || !q) {
		searchResults = [];
		return;
	}
	searchLoading = true;
	const controller = new AbortController();
	searchApps(catalogRelays, q, { signal: controller.signal, limit: 20 })
		.then((events) => {
			if (!controller.signal.aborted) {
				searchResults = events;
				searchLoading = false;
			}
		})
		.catch(() => {
			if (!controller.signal.aborted) {
				searchResults = [];
				searchLoading = false;
			}
		});
	return () => controller.abort();
});

const hasQuery = $derived(query.trim().length > 0);
const displayResults = $derived(hasQuery ? searchResults : []);

function handleInsert(parsed) {
	const naddr = parsed?.naddr;
	if (naddr) {
		onInsert({
			naddr,
			name: parsed?.name ?? null,
			iconUrl: parsed?.icon ?? null
		});
		isOpen = false;
		onclose?.();
	}
}

function handleOverlayClick() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') {
		isOpen = false;
		onclose?.();
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="insert-overlay" onclick={handleOverlayClick} role="presentation"></div>

	<div class="insert-wrapper" role="dialog" aria-modal="true" aria-label={title}>
		<div class="insert-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<div class="insert-title-block">
				<h2 class="insert-title">{title}</h2>
			</div>

			<div class="insert-search-row">
				<div class="insert-search-inner">
					<span class="insert-search-icon" aria-hidden="true"><Search /></span>
					<input
						type="search"
						class="insert-search-input"
						placeholder="Search apps"
						bind:value={query}
						bind:this={searchInputEl}
						aria-label="Search apps"
					/>
				</div>
			</div>

			<div class="insert-body-wrap">
				<div class="insert-body-inner" class:insert-body-inner-scroll={displayResults.length > 0}>
					{#if hasQuery}
						{#if searchLoading}
							<div class="insert-empty-state">
								<div class="insert-spinner" aria-hidden="true">
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="12" cy="12" r="10" stroke-dasharray="47 15" stroke-linecap="round"/>
									</svg>
								</div>
							</div>
						{:else if displayResults.length === 0}
							<div class="insert-empty-state">
								<p class="insert-empty-text">No apps found</p>
							</div>
						{:else}
							<ul class="insert-list">
								{#each displayResults as event (event.id)}
									{@const parsed = parseApp(event)}
									<li class="insert-row">
										<div class="insert-app-info">
											<AppPic iconUrl={parsed.icon} name={parsed.name} identifier={parsed.dTag} size="sm" />
											<span class="insert-name">{parsed.name || parsed.dTag}</span>
										</div>
										<button type="button" class="btn-secondary btn-secondary-small btn-secondary-light" onclick={() => handleInsert(parsed)}>
											Insert
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<div class="insert-empty-state">
							<p class="insert-empty-text">No apps found</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.insert-overlay {
		position: fixed;
		inset: 0;
		z-index: 61;
		background: transparent;
	}

	.insert-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 62;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.insert-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		max-height: 50vh;
	}

	@media (min-width: 768px) {
		.insert-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	.insert-title-block {
		flex-shrink: 0;
		padding: 0 0 8px;
	}
	.insert-title {
		margin: 0;
		font-size: 1.875rem;
		font-weight: 600;
		color: hsl(var(--white));
		text-align: center;
	}

	.insert-search-row {
		flex-shrink: 0;
		padding-bottom: 0;
	}
	.insert-search-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 12px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: 16px;
	}

	.insert-search-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.insert-search-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 16px;
	}

	.insert-search-input::placeholder {
		color: hsl(var(--white33));
	}

	.insert-body-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 12px;
	}

	.insert-body-inner {
		background: hsl(var(--black33));
		border-radius: var(--radius-12);
		min-height: 160px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.insert-body-inner-scroll {
		max-height: 280px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--white33)) transparent;
	}
	.insert-body-inner-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.insert-body-inner-scroll::-webkit-scrollbar-thumb {
		background: hsl(var(--white33));
		border-radius: 2px;
	}

	.insert-empty-state {
		width: 100%;
		min-height: 160px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.insert-empty-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--white16));
		text-align: center;
		margin: 0;
		padding: 24px 16px;
	}
	.insert-spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--white33));
	}
	.insert-spinner svg {
		animation: insert-spin 0.8s linear infinite;
	}
	@keyframes insert-spin {
		to { transform: rotate(360deg); }
	}

	.insert-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.insert-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-bottom: 1px solid hsl(var(--white8));
	}
	.insert-row:last-child {
		border-bottom: none;
	}

	.insert-app-info {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1;
	}

	.insert-name {
		font-size: 15px;
		font-weight: 500;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
