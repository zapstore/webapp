<script>
	/**
	 * @typedef {{
	 *   id: string;
	 *   pubkey: string;
	 *   content: string;
	 *   created_at: number;
	 *   npub?: string;
	 *   nevent?: string;
	 *   profile?: { displayName?: string; name?: string; picture?: string | null; nip05?: string | null };
	 * }} TestimonialItem
	 */
	import { onMount } from 'svelte';
	import LandingSectionTitle from './LandingSectionTitle.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import { ChevronRight } from '$lib/components/icons';

	/** @type {TestimonialItem[]} */
	export let testimonials = [];

	/** @type {HTMLButtonElement | undefined} */
	let seeMoreButton;

	$: visibleTestimonials = testimonials;

	/** @type {HTMLDivElement | undefined} */
	let testimonialsContainer;
	const SCROLL_SPEED = 0.4;
	/** @type {number | undefined} */
	let animationFrameId;
	let isPaused = false;
	let isAnimating = false;
	let singleSetWidth = 0;

	// Organize testimonials into columns (3 per column)
	// Triple the columns for seamless infinite scroll in both directions
	$: baseColumns = (() => {
		if (!visibleTestimonials || visibleTestimonials.length === 0) {
			return [];
		}
		const cols = [];
		const itemsPerColumn = 3;
		for (let i = 0; i < visibleTestimonials.length; i += itemsPerColumn) {
			cols.push(visibleTestimonials.slice(i, i + itemsPerColumn));
		}
		return cols;
	})();

	// Triple the columns: [set1, set2, set3] - we scroll in set2, jump when entering set1 or set3
	$: columns = baseColumns.length > 0 ? [...baseColumns, ...baseColumns, ...baseColumns] : [];

	/** Display name: Nostr display_name → name → nip05 local part → truncated npub
	 * @param {TestimonialItem} testimonial
	 * @returns {string}
	 */
	function getDisplayName(testimonial) {
		const p = testimonial.profile;
		if (p?.displayName && p.displayName.trim()) return p.displayName.trim();
		if (p?.name && p.name.trim()) return p.name.trim();
		const nip05 = p?.nip05;
		if (nip05 && nip05.includes('@')) return (nip05.split('@')[0] ?? '').trim();
		const npub = testimonial.npub ?? '';
		return npub.length > 12 ? `${npub.slice(0, 12)}…` : npub || 'Anonymous';
	}

	/** @param {TestimonialItem} testimonial @returns {string | null} */
	function getPictureUrl(testimonial) {
		const url = testimonial.profile?.picture;
		return url && typeof url === 'string' && url.trim() ? url.trim() : null;
	}

	/** @param {number} timestamp @returns {string} - Matches Timestamp component (DESIGN_SYSTEM): Just Now, Today HH:MM, Yesterday, Jan 21 */
	function formatDateTime(timestamp) {
		if (!timestamp) return '';

		const now = new Date();
		const date = new Date(timestamp * 1000);

		if (isNaN(date.getTime())) return '';

		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);

		if (diffSec < 60) return 'Just Now';

		const isToday = date.toDateString() === now.toDateString();
		if (isToday) {
			const hours = date.getHours().toString().padStart(2, '0');
			const minutes = date.getMinutes().toString().padStart(2, '0');
			return `Today ${hours}:${minutes}`;
		}

		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday = date.toDateString() === yesterday.toDateString();
		if (isYesterday) return 'Yesterday';

		const monthNames = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const month = monthNames[date.getMonth()];
		const day = date.getDate();
		return `${month} ${day}`;
	}

	function handleMouseEnter() {
		isPaused = true;
	}

	function handleMouseLeave() {
		isPaused = false;
	}

	// Reposition scroll to middle set when entering first or last set
	function repositionIfNeeded() {
		if (!testimonialsContainer || singleSetWidth === 0) return;

		const scrollLeft = testimonialsContainer.scrollLeft;

		// If scrolled into the last third (set3), jump back to equivalent position in middle third (set2)
		if (scrollLeft >= singleSetWidth * 2) {
			testimonialsContainer.scrollLeft = scrollLeft - singleSetWidth;
		}
		// If scrolled into the first third (set1), jump forward to equivalent position in middle third (set2)
		else if (scrollLeft < singleSetWidth) {
			testimonialsContainer.scrollLeft = scrollLeft + singleSetWidth;
		}
	}

	// Handle manual scroll - reposition when needed
	function handleScroll() {
		const isLargeScreen = window.innerWidth >= 768;
		if (!isLargeScreen) return;
		repositionIfNeeded();
	}

	function animateScroll() {
		if (!isAnimating) return;

		if (!testimonialsContainer || columns.length === 0) {
			animationFrameId = requestAnimationFrame(animateScroll);
			return;
		}

		const isLargeScreen = window.innerWidth >= 768;
		if (!isLargeScreen) {
			animationFrameId = requestAnimationFrame(animateScroll);
			return;
		}

		if (!isPaused) {
			testimonialsContainer.scrollLeft += SCROLL_SPEED;
			repositionIfNeeded();
		}

		animationFrameId = requestAnimationFrame(animateScroll);
	}

	function updateSetWidth() {
		if (testimonialsContainer && columns.length > 0) {
			singleSetWidth = testimonialsContainer.scrollWidth / 3;
		}
	}

	let seeMoreDropdownOpen = false;
	/** @type {HTMLDivElement | undefined} */
	let seeMoreMobileWrap;

	function handleSeeMore() {
		seeMoreDropdownOpen = !seeMoreDropdownOpen;
	}

	/** @param {MouseEvent} event */
	function handleSeeMoreClickOutside(event) {
		const target = /** @type {Node | null} */ (event.target);
		if (seeMoreMobileWrap && target && !seeMoreMobileWrap.contains(target)) {
			seeMoreDropdownOpen = false;
		}
	}

	/** @param {MouseEvent} event */
	function handleSeeMoreMouseMove(event) {
		if (!seeMoreButton) return;
		const rect = seeMoreButton.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		seeMoreButton.style.setProperty('--mouse-x', `${mouseX}px`);
		seeMoreButton.style.setProperty('--mouse-y', `${mouseY}px`);
	}

	onMount(() => {
		const init = () => {
			const isLargeScreen = window.innerWidth >= 768;
			if (
				testimonialsContainer &&
				testimonialsContainer.scrollWidth > testimonialsContainer.clientWidth &&
				isLargeScreen
			) {
				updateSetWidth();
				// Start in the middle of the middle set (set2)
				testimonialsContainer.scrollLeft = singleSetWidth;
				isAnimating = true;
				animationFrameId = requestAnimationFrame(animateScroll);
			} else if (isLargeScreen && visibleTestimonials && visibleTestimonials.length > 0) {
				setTimeout(init, 100);
			}
		};

		setTimeout(init, 200);

		// Handle window resize
		const handleResize = () => {
			updateSetWidth();
			const isLargeScreen = window.innerWidth >= 768;
			if (isLargeScreen && !isAnimating && visibleTestimonials && visibleTestimonials.length > 0) {
				init();
			} else if (!isLargeScreen) {
				isAnimating = false;
			}
		};

		window.addEventListener('resize', handleResize);
		document.addEventListener('click', handleSeeMoreClickOutside);

		return () => {
			isAnimating = false;
			if (animationFrameId != null) {
				cancelAnimationFrame(animationFrameId);
				animationFrameId = undefined;
			}
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('click', handleSeeMoreClickOutside);
		};
	});
</script>

{#if testimonials.length > 0}
	<section class="border-t border-border/50 pt-8 sm:pt-12 lg:pt-16 pb-0 md:pb-10 relative">
		<LandingSectionTitle
			title="What people are saying"
			description="Real posts from the Nostr community"
			showSeeMore={true}
			seeMoreText="See More"
			seeMoreDropdownText="More coming soon!"
			seeMoreAction={handleSeeMore}
			showButtonsOnMobile={false}
		/>

		<!-- Horizontal Scrolling Testimonials Grid -->
		<div class="relative w-screen overflow-hidden">
			<!-- Left gradient fade -->
			<div
				class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
				style="background: linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background) / 0.95) 20%, hsl(var(--background) / 0.7) 50%, transparent 100%);"
			></div>

			<!-- Right gradient fade -->
			<div
				class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
				style="background: linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background) / 0.95) 20%, hsl(var(--background) / 0.7) 50%, transparent 100%);"
			></div>

			<!-- Mobile: Bottom shadow mask over scrollable row (stronger fade) -->
			<div
				class="md:hidden absolute left-0 right-0 bottom-0 z-30 pointer-events-none testimonials-mobile-bottom-mask"
			></div>

			<!-- Scrolling container -->
			<div
				bind:this={testimonialsContainer}
				on:mouseenter={handleMouseEnter}
				on:mouseleave={handleMouseLeave}
				on:scroll={handleScroll}
				role="region"
				aria-label="Testimonials carousel"
				class="flex gap-6 px-4 md:px-32 py-2 pb-16 md:pb-2 overflow-x-auto scrollbar-hide relative z-10"
				style="scroll-behavior: auto;"
			>
				{#each columns as column, columnIndex (`col-${columnIndex}`)}
					<div class="flex flex-col gap-6 flex-shrink-0" style="width: 320px;">
						{#each column as testimonial, testimonialIndex (`${columnIndex}-${testimonial.id}-${testimonialIndex}`)}
							<a
								href={testimonial.nevent ? `https://primal.net/e/${testimonial.nevent}` : '#'}
								target="_blank"
								rel="noopener noreferrer"
								class="testimonial-card group block"
							>
								<!-- Top row: Profile pic, name, date/time -->
								<div class="flex items-center gap-2.5 mb-3">
									<ProfilePic
										pictureUrl={getPictureUrl(testimonial)}
										name={getDisplayName(testimonial)}
										pubkey={testimonial.pubkey}
										size="md"
									/>

									<div class="flex-1 min-w-0 flex items-center justify-between gap-2">
										<span class="font-semibold text-foreground truncate text-sm">
											{getDisplayName(testimonial)}
										</span>
										<span
											class="text-xs whitespace-nowrap flex-shrink-0"
											style="color: hsl(var(--white33));"
										>
											{formatDateTime(testimonial.created_at)}
										</span>
									</div>
								</div>

								<!-- Content -->
								<p class="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
									{testimonial.content}
								</p>
							</a>
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Mobile only: See More overlayed at bottom of section, centered -->
		<div
			class="md:hidden absolute inset-x-0 bottom-0 z-40 see-more-mobile-wrap"
			bind:this={seeMoreMobileWrap}
		>
			<button
				type="button"
				bind:this={seeMoreButton}
				on:click={handleSeeMore}
				on:mousemove={handleSeeMoreMouseMove}
				class="btn-glass-large btn-glass-with-chevron flex items-center group"
			>
				See More
				<ChevronRight
					variant="outline"
					color="hsl(var(--white33))"
					size={18}
					className="transition-transform group-hover:translate-x-0.5"
				/>
			</button>
			{#if seeMoreDropdownOpen}
				<div class="see-more-mobile-panel" role="dialog" aria-label="More info">
					<p class="see-more-mobile-panel-text">More coming soon!</p>
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.testimonial-card {
		display: block;
		padding: 1rem;
		background: hsl(var(--gray44));
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: 1.25rem;
		transition: transform 0.2s ease;
		text-decoration: none;
		height: fit-content;
	}

	.testimonial-card:hover {
		transform: scale(1.01);
	}

	.testimonial-card:active {
		transform: scale(0.99);
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	/* Mobile: full-width strip so button is truly centered; match Release with Ease spacing (32px) */
	.see-more-mobile-wrap {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		padding-bottom: 32px;
		pointer-events: none;
	}
	.see-more-mobile-wrap > button {
		pointer-events: auto;
	}
	@media (min-width: 768px) {
		.see-more-mobile-wrap {
			display: none !important;
		}
	}

	/* Mobile: strong bottom shadow mask over the scrollable testimonies row */
	.testimonials-mobile-bottom-mask {
		height: 120px;
		background: linear-gradient(
			to top,
			hsl(var(--background)) 0%,
			hsl(var(--background) / 0.99) 10%,
			hsl(var(--background) / 0.95) 25%,
			hsl(var(--background) / 0.8) 50%,
			hsl(var(--background) / 0.4) 75%,
			transparent 100%
		);
	}

	.see-more-mobile-panel {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 200px;
		max-width: 280px;
		padding: 12px 14px;
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
	}

	.see-more-mobile-panel-text {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
	}
</style>
