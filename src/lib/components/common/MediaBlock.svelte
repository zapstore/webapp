<script lang="js">
/**
 * MediaBlock - Displays an image or video with consistent styling.
 * In "removable" mode (composer): round gray33 Cross button overlayed top-right with inset.
 * In view mode: click opens fullscreen lightbox; no Cross.
 * Style: white16 border 0.33px, 12px radius, fixed max height/width.
 */
import Cross from '$lib/components/icons/Cross.svelte';

function inferMediaType(u) {
	if (!u) return 'image';
	const lower = String(u).toLowerCase();
	if (/\.(mp4|webm|ogg|mov)(\?|$)/.test(lower)) return 'video';
	if (lower.includes('video')) return 'video';
	return 'image';
}

let {
	url = '',
	/** 'image' | 'video' - inferred from url if not set */
	type: typeProp = null,
	removable = false,
	onRemove = () => {},
	onClick = () => {}
} = $props();

const type = $derived(typeProp ?? inferMediaType(url));
const isVideo = $derived(type === 'video');

function handleMediaClick(e) {
	if (removable) return;
	e?.stopPropagation?.();
	onClick?.({ url, type });
}

function handleRemove(e) {
	e.stopPropagation();
	onRemove?.();
}
</script>

<div class="media-block-wrap">
	{#if removable}
		<button
			type="button"
			class="media-remove-btn"
			aria-label="Remove media"
			onclick={handleRemove}
		>
			<Cross variant="outline" color="var(--white66)" size={14} strokeWidth={2} />
		</button>
	{/if}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_tabindex -->
	<div
		class="media-block"
		class:removable
		class:clickable={!removable}
		role={removable ? null : 'button'}
		tabindex={removable ? null : 0}
		onclick={handleMediaClick}
		onkeydown={(e) => {
			if (!removable && (e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				handleMediaClick();
			}
		}}
	>
		{#if isVideo}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				class="media-element"
				src={url}
				controls
				preload="metadata"
				playsinline
				onclick={(e) => removable && e.stopPropagation()}
			>
				Your browser does not support the video tag.
			</video>
		{:else}
			<img
				class="media-element"
				src={url}
				alt=""
				loading="lazy"
			/>
		{/if}
	</div>
</div>

<style>
	.media-block-wrap {
		position: relative;
		display: block;
		max-width: 300px;
		width: 100%;
	}
	.media-block {
		display: block;
		min-width: 80px;
		min-height: 80px;
		max-width: 100%;
		max-height: 240px;
		border: 0.33px solid var(--white16);
		border-radius: 12px;
		overflow: hidden;
		background: var(--gray33);
	}
	.media-block.clickable {
		cursor: pointer;
	}
	.media-block.clickable:focus-visible {
		outline: 2px solid var(--white33);
		outline-offset: 2px;
	}
	.media-element {
		display: block;
		max-width: 100%;
		max-height: 240px;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.media-remove-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray33);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		z-index: 2;
		box-shadow: 0 1px 3px color-mix(in srgb, var(--black) 30%, transparent);
	}
	.media-remove-btn:hover {
		background: var(--gray50);
	}
	.media-remove-btn:active {
		transform: scale(0.96);
	}
</style>
