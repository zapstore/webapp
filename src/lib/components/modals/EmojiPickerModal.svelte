<script lang="js">
/**
 * EmojiPickerModal - Full emoji picker rendered as a stacked bottom sheet.
 * Opens on top of ForumPostModal (z-index 60) without its own dark backdrop.
 * Unicode grid shows immediately; while custom emoji load (signed-in), a slim
 * black33 row shows "Loading custom emoji…" and custom rows prepend when ready.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Search } from 'lucide-svelte';
import EmojiItem from '$lib/components/common/EmojiItem.svelte';
import Spinner from '$lib/components/common/Spinner.svelte';
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
		loading = false;
		return;
	}
	const pubkey = getCurrentPubkey();
	loading = !!pubkey;
	let cancelled = false;
	const service = getEmojiSearch(pubkey ?? null);
	service
		.getCustom()
		.then((/** @type {{ shortcode: string; url: string; source: string }[]} */ results) => {
			if (cancelled) return;
			customEmojis = results;
			loading = false;
		})
		.catch(() => {
			if (cancelled) return;
			loading = false;
		});
	const t = setTimeout(() => searchInputEl?.focus(), 80);
	return () => {
		cancelled = true;
		clearTimeout(t);
	};
});

/** Flat merged list: custom first, unicode after. Filtered by query when set. */
const displayEmojis = $derived.by(() => {
	const q = query.trim().toLowerCase();
	if (!q) return [...customEmojis, ...unicodeItems];
	return [...customEmojis, ...unicodeItems].filter((e) => e.shortcode.includes(q));
});

const showCustomEmojiLoadingRow = $derived(loading && !!getCurrentPubkey());

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
				<div class="picker-search-inner">
					<span class="picker-search-icon" aria-hidden="true"><Search /></span>
					<input
						type="search"
						class="picker-search-input"
						placeholder="Search emoji"
						bind:value={query}
						bind:this={searchInputEl}
						aria-label="Search emoji"
					/>
				</div>
			</div>

			<div class="picker-body">
				{#if showCustomEmojiLoadingRow}
					<div class="custom-emoji-loading-banner" role="status" aria-live="polite">
						<Spinner size={14} color="hsl(var(--white33))" />
						<span class="custom-emoji-loading-text">Loading custom emoji...</span>
					</div>
				{/if}
				{#if displayEmojis.length === 0}
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

	.picker-search-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 12px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: 16px;
	}

	.picker-search-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.picker-search-input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		background: none;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		box-sizing: border-box;
	}

	.picker-search-input::placeholder {
		color: hsl(var(--white33));
		font-size: 16px;
	}

	.custom-emoji-loading-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 32px;
		padding: 6px 12px;
		margin-bottom: 6px;
		box-sizing: border-box;
		background: hsl(var(--black33));
		border: none;
		border-radius: 16px;
		flex-shrink: 0;
	}

	.custom-emoji-loading-text {
		font-size: 13px;
		font-weight: 500;
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

	.picker-empty {
		padding: 24px 0;
		text-align: center;
		font-size: 14px;
		color: hsl(var(--white33));
	}
</style>
