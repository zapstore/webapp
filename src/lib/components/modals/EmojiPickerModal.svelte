<script lang="js">
/**
 * EmojiPickerModal - Full emoji picker rendered as a stacked bottom sheet.
 * Opens on top of ForumPostModal (z-index 60) without its own dark backdrop.
 * All custom emojis first (no per-category cap), then all unicode — flat grid,
 * no section headers. Filtering collapses both into one sorted list.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import EmojiItem from '$lib/components/common/EmojiItem.svelte';
import { UNICODE_EMOJIS, getEmojiSearch } from '$lib/services/emoji-search';

let {
	isOpen = $bindable(false),
	getCurrentPubkey = () => null,
	onSelectEmoji = /** @type {((e: { shortcode: string; url: string; source: string }) => void) | undefined} */ (undefined),
	onclose = () => {}
} = $props();

/** @type {{ shortcode: string; url: string; source: string }[]} */
let customEmojis = $state([]);
let loading = $state(false);
let query = $state('');
/** @type {HTMLInputElement | null} */
let searchInputEl = $state(null);

const unicodeItems = UNICODE_EMOJIS.map((e) => ({
	shortcode: e.shortcode,
	url: e.emoji,
	source: 'unicode'
}));

$effect(() => {
	if (!isOpen) {
		query = '';
		customEmojis = [];
		return;
	}
	loading = true;
	const pubkey = getCurrentPubkey();
	const service = getEmojiSearch(pubkey ?? null);
	service.getCustom().then((/** @type {{ shortcode: string; url: string; source: string }[]} */ results) => {
		customEmojis = results;
		loading = false;
	}).catch(() => {
		loading = false;
	});
	const t = setTimeout(() => searchInputEl?.focus(), 80);
	return () => clearTimeout(t);
});

/** Flat merged list: custom first, unicode after. Filtered by query when set. */
const displayEmojis = $derived.by(() => {
	const q = query.trim().toLowerCase();
	if (!q) return [...customEmojis, ...unicodeItems];
	return [...customEmojis, ...unicodeItems].filter((e) => e.shortcode.includes(q));
});

function selectEmoji(/** @type {{ shortcode: string; url: string; source: string }} */ emoji) {
	onSelectEmoji?.(emoji);
	isOpen = false;
	onclose?.();
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
	<div class="picker-overlay" onclick={handleOverlayClick} role="presentation"></div>

	<div class="picker-wrapper" role="dialog" aria-modal="true" aria-label="Pick an emoji">
		<div class="picker-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<div class="picker-search-row">
				<input
					type="search"
					class="picker-search-input"
					placeholder="Search emoji"
					bind:value={query}
					bind:this={searchInputEl}
					aria-label="Search emoji"
				/>
			</div>

			<div class="picker-body">
				{#if loading}
					<div class="emoji-grid">
						{#each { length: 30 } as _}
							<span class="picker-skeleton-item"></span>
						{/each}
					</div>
				{:else if displayEmojis.length === 0}
					<p class="picker-empty">No emoji found for "{query}"</p>
				{:else}
					<div class="emoji-grid">
						{#each displayEmojis as emoji (emoji.shortcode + emoji.source)}
							<EmojiItem
								shortcode={emoji.shortcode}
								url={emoji.url}
								source={emoji.source}
								size={36}
								onclick={() => selectEmoji(emoji)}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.picker-overlay {
		position: fixed;
		inset: 0;
		z-index: 59;
		background: transparent;
	}

	.picker-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 60;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.picker-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 12px 12px 0;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		height: 50vh;
	}

	@media (min-width: 768px) {
		.picker-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
		}
	}

	.picker-search-row {
		flex-shrink: 0;
		padding-bottom: 8px;
	}

	.picker-search-input {
		width: 100%;
		height: 36px;
		padding: 0 12px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 10px;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 14px;
		box-sizing: border-box;
	}

	.picker-search-input::placeholder {
		color: hsl(var(--white33));
	}

	.picker-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 16px;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--white16)) transparent;
	}

	.picker-body::-webkit-scrollbar {
		width: 4px;
	}

	.picker-body::-webkit-scrollbar-thumb {
		background: hsl(var(--white16));
		border-radius: 2px;
	}

	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
		gap: 2px;
		padding-top: 4px;
	}

	.picker-skeleton-item {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: linear-gradient(
			90deg,
			hsl(var(--white8)) 25%,
			hsl(var(--white16)) 50%,
			hsl(var(--white8)) 75%
		);
		background-size: 200% 100%;
		animation: picker-shimmer 1.4s ease infinite;
	}

	@keyframes picker-shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.picker-empty {
		padding: 24px 0;
		text-align: center;
		font-size: 14px;
		color: hsl(var(--white33));
	}
</style>
