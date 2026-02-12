<script>
	import { ChevronRight } from '$lib/components/icons';

	/** @type {HTMLAnchorElement | null} */
	let ctaButton = null;

	/** @param {MouseEvent} event */
	function handleMouseMove(event) {
		if (!ctaButton) return;
		const rect = ctaButton.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		ctaButton.style.setProperty('--mouse-x', `${mouseX}px`);
		ctaButton.style.setProperty('--mouse-y', `${mouseY}px`);
	}
</script>

<section class="relative border-t border-border/50 overflow-hidden">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-12 lg:pt-16 pb-0">
		<!-- Center text -->
		<div class="relative z-20 text-center mb-6 sm:mb-12">
			<h2 class="section-title text-display-lg leading-tight">
				<span class="text-3xl sm:text-5xl lg:text-6xl xl:text-7xl section-title-gradient">
					Release with ease
				</span>
			</h2>
			<p class="section-description max-w-2xl mx-auto mt-3 sm:mt-5">
				A developer toolkit for publishing apps directly to users, high signal insights, honest
				monetisation and building community.
			</p>
		</div>

		<!-- Preview container -->
		<div class="relative h-[220px] sm:h-[360px] lg:h-[440px] overflow-hidden">
			<!-- Studio screenshot -->
			<img
				src="/images/studio-screenshot.png"
				alt="Zapstore Studio - Developer dashboard with insights and analytics"
				class="w-full h-auto"
			/>

			<!-- Bottom gradient shader -->
			<div
				class="absolute left-0 right-0 bottom-0 z-30 pointer-events-none"
				style="height: 160px; background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 20%, hsl(var(--background) / 0.4) 50%, hsl(var(--background) / 0.15) 75%, transparent 100%);"
			></div>

			<!-- CTA Button -->
			<div class="absolute left-1/2 transform -translate-x-1/2 z-40" style="bottom: 32px;">
				<a
					href="/studio"
					bind:this={ctaButton}
					on:mousemove={handleMouseMove}
					class="btn-glass-large btn-glass-with-chevron flex items-center gap-3 group btn-blur-lg pl-4"
				>
					<svg
						width="18"
						height="24"
						viewBox="64 64 15 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<defs>
							<linearGradient id="studio-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" style="stop-color: hsl(252, 100%, 72%);" />
								<stop offset="100%" style="stop-color: hsl(241, 100%, 68%);" />
							</linearGradient>
						</defs>
						<path
							d="M71.4271 64.0009C71.4756 63.9997 71.5243 63.9997 71.5728 64.0009C71.7346 64.0049 71.8944 64.0799 71.9931 64.2256L74.8616 68.4602C74.8676 68.4691 74.8732 68.4781 74.8785 68.4872C74.9007 68.5253 74.9208 68.5646 74.9462 68.6007L74.9542 68.612C75.1988 68.9609 74.9102 69.4216 74.4734 69.3795L73.3883 69.275C73.0394 69.2414 72.7583 69.5398 72.8303 69.8674L73.4327 73.1352C73.4589 73.2775 73.5317 73.4213 73.6767 73.4593C73.77 73.4838 73.872 73.4837 73.9725 73.4529L78.3235 71.9401C78.7191 71.8192 79.094 72.1663 78.9789 72.547L75.8194 83.6386C75.6627 84.1567 74.8757 84.1035 74.8039 83.57L74.0919 78.907C74.0625 78.7147 73.8297 78.6031 73.6396 78.5368L71.7235 77.8667C71.5791 77.8162 71.4207 77.8162 71.2763 77.8667L69.3604 78.5368C69.1703 78.6031 68.9373 78.7148 68.908 78.9071L68.1961 83.57C68.1243 84.1035 67.3373 84.1567 67.1806 83.6386L64.0211 72.547C63.906 72.1663 64.2808 71.8192 64.6765 71.9401L69.0275 73.4529C69.128 73.4837 69.2299 73.4838 69.3231 73.4593C69.4682 73.4213 69.5409 73.2775 69.5672 73.1352L70.1697 69.8674C70.2417 69.5398 69.9606 69.2414 69.6117 69.275L68.5264 69.3795C68.0897 69.4215 67.8012 68.9608 68.0458 68.612L68.0539 68.6005C68.079 68.5646 68.0989 68.5256 68.121 68.4879C68.1265 68.4786 68.1323 68.4694 68.1384 68.4602L71.0069 64.2256C71.1056 64.0799 71.2653 64.005 71.4271 64.0009Z"
							fill="url(#studio-icon-gradient)"
						/>
					</svg>
					<span class="whitespace-nowrap">Zapstore Studio</span>
					<ChevronRight
						variant="outline"
						color="hsl(var(--white33))"
						size={18}
						className="transition-transform group-hover:translate-x-0.5"
					/>
				</a>
			</div>
		</div>
	</div>
</section>

<style>
	.btn-blur-lg {
		backdrop-filter: blur(var(--blur-lg));
		-webkit-backdrop-filter: blur(var(--blur-lg));
	}
</style>
