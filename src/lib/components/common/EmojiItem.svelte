<script lang="js">
/**
 * EmojiItem - Reusable emoji display tile for pickers and menus.
 * Unicode emojis render immediately; custom image emojis show a skeleton
 * while loading, then reveal the image. Shows shortcode as tooltip.
 */

let {
	shortcode = '',
	url = '',
	source = 'unicode',
	size = 28,
	onclick
} = $props();

const isUnicode = $derived(source === 'unicode');
let imgLoaded = $state(false);
let imgError = $state(false);
</script>

<button
	type="button"
	class="emoji-item"
	title=":{shortcode}:"
	style="--emoji-size: {size}px;"
	{onclick}
	aria-label={shortcode}
>
	{#if isUnicode}
		<span class="emoji-char">{url}</span>
	{:else if imgError}
		<span class="emoji-fallback">?</span>
	{:else}
		{#if !imgLoaded}
			<span class="emoji-skeleton" aria-hidden="true"></span>
		{/if}
		<!-- svelte-ignore svelte_component_deprecated -->
		<img
			src={url}
			alt={shortcode}
			class="emoji-img"
			class:hidden={!imgLoaded}
			onload={() => { imgLoaded = true; }}
			onerror={() => { imgError = true; }}
			draggable="false"
		/>
	{/if}
</button>

<style>
	.emoji-item {
		width: var(--emoji-size);
		height: var(--emoji-size);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		padding: 0;
		position: relative;
		transition: background-color 0.1s ease, transform 0.1s ease;
		flex-shrink: 0;
	}

	.emoji-item:hover {
		background: hsl(var(--white11));
		transform: scale(1.15);
	}

	.emoji-item:active {
		transform: scale(0.95);
	}

	.emoji-char {
		font-size: calc(var(--emoji-size) * 0.72);
		line-height: 1;
		user-select: none;
	}

	.emoji-img {
		width: calc(var(--emoji-size) * 0.78);
		height: calc(var(--emoji-size) * 0.78);
		object-fit: contain;
		display: block;
	}

	.emoji-img.hidden {
		display: none;
	}

	.emoji-skeleton {
		width: calc(var(--emoji-size) * 0.78);
		height: calc(var(--emoji-size) * 0.78);
		border-radius: 4px;
		background: linear-gradient(
			90deg,
			hsl(var(--white8)) 25%,
			hsl(var(--white16)) 50%,
			hsl(var(--white8)) 75%
		);
		background-size: 200% 100%;
		animation: emoji-shimmer 1.4s ease infinite;
		display: block;
	}

	@keyframes emoji-shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.emoji-fallback {
		font-size: 12px;
		color: hsl(var(--white33));
		line-height: 1;
	}
</style>
