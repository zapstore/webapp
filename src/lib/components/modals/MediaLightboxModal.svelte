<script lang="js">
/**
 * MediaLightboxModal - Fullscreen overlay to view image(s) or video(s).
 * Matches apps page carousel: fixed inset 0, dark backdrop, close top-right, prev/next + dots when multiple.
 */
import { fade } from 'svelte/transition';
import { X } from 'lucide-svelte';

function inferMediaType(u) {
	if (!u) return 'image';
	const lower = String(u).toLowerCase();
	if (/\.(mp4|webm|ogg|mov)(\?|$)/.test(lower)) return 'video';
	if (lower.includes('video')) return 'video';
	return 'image';
}

let {
	isOpen = $bindable(false),
	/** Single URL (legacy) or use urls + initialIndex */
	url = '',
	/** All media URLs; when set, use with initialIndex for carousel */
	urls = [],
	/** Index into urls to show first when opening */
	initialIndex = 0,
	type: typeProp = null,
	onclose = () => {}
} = $props();

const list = $derived(Array.isArray(urls) && urls.length > 0 ? urls : (url ? [url] : []));
let currentIndex = $state(0);

const currentUrl = $derived(list[currentIndex] ?? '');
const type = $derived(typeProp ?? inferMediaType(currentUrl));
const isVideo = $derived(type === 'video');
const hasMultiple = $derived(list.length > 1);

function close() {
	isOpen = false;
	onclose?.();
}

function prev() {
	currentIndex = (currentIndex - 1 + list.length) % list.length;
}

function next() {
	currentIndex = (currentIndex + 1) % list.length;
}

function goTo(i) {
	currentIndex = i;
}

function handleBackdropClick(e) {
	if (e.target === e.currentTarget) close();
}

function handleKeydown(e) {
	if (!isOpen) return;
	if (e.key === 'Escape') close();
	else if (hasMultiple && e.key === 'ArrowLeft') {
		e.preventDefault();
		prev();
	} else if (hasMultiple && e.key === 'ArrowRight') {
		e.preventDefault();
		next();
	}
}

$effect(() => {
	if (isOpen && list.length) {
		const i = Math.min(Math.max(0, initialIndex), list.length - 1);
		currentIndex = i;
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && list.length > 0}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="media-lightbox-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Media viewer"
		tabindex="-1"
		onclick={handleBackdropClick}
		transition:fade={{ duration: 150 }}
	>
		<button type="button" class="carousel-close-btn" aria-label="Close carousel" onclick={(e) => { e.stopPropagation(); close(); }}>
			<X class="h-5 w-5" />
		</button>

		{#if hasMultiple}
			<button type="button" class="media-lightbox-nav media-lightbox-prev" aria-label="Previous" onclick={(e) => { e.stopPropagation(); prev(); }}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
			</button>
			<button type="button" class="media-lightbox-nav media-lightbox-next" aria-label="Next" onclick={(e) => { e.stopPropagation(); next(); }}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
			</button>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="media-lightbox-content" onclick={(e) => { e.stopPropagation(); }}>
			<div class="media-lightbox-wrapper">
				{#if isVideo}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video class="media-lightbox-element" src={currentUrl} controls autoplay playsinline>
						Your browser does not support the video tag.
					</video>
				{:else}
					<img class="media-lightbox-element" src={currentUrl} alt="" />
				{/if}
			</div>
			{#if hasMultiple}
				<div class="media-lightbox-dots">
					{#each list as _, i}
						<button
							type="button"
							class="media-lightbox-dot"
							class:active={i === currentIndex}
							aria-label="Go to media {i + 1}"
							onclick={(e) => { e.stopPropagation(); goTo(i); }}
						></button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.media-lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--black) 92%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		overflow: hidden;
	}
	/* Same as apps page carousel close button */
	.carousel-close-btn {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 10;
		padding: 8px;
		border-radius: 50%;
		background-color: var(--white16);
		color: white;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	.carousel-close-btn:hover {
		background-color: var(--white33);
	}
	.media-lightbox-nav {
		position: absolute;
		z-index: 10;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--white16);
		color: white;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.media-lightbox-nav:hover {
		background: var(--white33);
	}
	.media-lightbox-prev {
		left: 16px;
	}
	.media-lightbox-next {
		right: 16px;
	}
	.media-lightbox-content {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		max-width: min(90vw, 100%);
		max-height: 90vh;
		min-width: 0;
		padding: 16px;
		box-sizing: border-box;
		pointer-events: none;
	}
	.media-lightbox-content > * {
		pointer-events: auto;
	}
	.media-lightbox-wrapper {
		position: relative;
		width: max-content;
		height: max-content;
		max-width: 100%;
		max-height: calc(100% - 48px);
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 0.33px solid var(--white16);
		overflow: hidden;
		background: var(--gray33);
		box-shadow: 0 0 80px 20px var(--black33);
	}
	@media (min-width: 768px) {
		.media-lightbox-wrapper {
			border-radius: 16px;
		}
	}
	.media-lightbox-element {
		display: block;
		max-width: 100%;
		max-height: calc(90vh - 48px - 24px);
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.media-lightbox-dots {
		display: flex;
		gap: 8px;
		padding: 16px 0 0;
		flex-shrink: 0;
	}
	.media-lightbox-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--white33);
		border: none;
		cursor: pointer;
		padding: 0;
		transition: background 0.15s ease;
	}
	.media-lightbox-dot:hover {
		background: var(--white50);
	}
	.media-lightbox-dot.active {
		background: var(--white);
	}
</style>
