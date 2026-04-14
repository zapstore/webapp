<script>
	import { Download } from '$lib/components/icons';
	import { assets } from '$app/paths';

	export let showDownloadModal = () => {};
</script>

<!-- Get The App Section -->
<section class="relative h-[700px] lg:h-[660px] border-t border-border/50 overflow-hidden">
	<div class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8 h-full relative z-10">
		<div
			class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start h-full pt-12 sm:pt-16 lg:pt-20"
		>
			<!-- Left: Content -->
			<div
				class="space-y-4 sm:space-y-6 p-6 sm:p-8 rounded-2xl lg:order-2"
				style="background-color: hsl(var(--gray33)); border-radius: var(--radius-32);"
			>
				<h2
					class="section-title text-display-lg text-3xl sm:text-4xl lg:text-4xl xl:text-5xl leading-tight section-title-gradient mb-2 text-left"
				>
					Get Zapstore
				</h2>
				<p class="section-description max-w-xl text-left">
					No platform should decide what's allowed on your device. Your apps, your rules. With
					reliable updates, straight from the source.
				</p>
				<div class="flex flex-row gap-3">
					<a
						href="/apps/dev.zapstore.app"
						class="btn-secondary-large btn-secondary-light"
						style="color: hsl(var(--white66));"
					>
						More Info
					</a>
					<button
						type="button"
						on:click={showDownloadModal}
						class="btn-primary-large flex-1 flex items-center justify-center gap-3"
					>
						<Download variant="fill" color="hsl(var(--white66))" size={18} />
						Download
					</button>
				</div>
			</div>

			<!-- Right: App Image -->
			<div class="flex justify-center lg:justify-end h-full lg:order-1">
				<div class="relative w-full max-w-md lg:max-w-lg h-full px-6 lg:px-8">
					<img
						src={`${assets}/images/android-app-screenshot.png`}
						alt="Zapstore Android app screenshot"
						class="w-full h-full object-cover object-top"
						style="filter: drop-shadow(0 0 60px hsl(var(--blurpleColor) / 0.02)) drop-shadow(0 0 120px hsl(var(--blurpleColor) / 0.01));"
						loading="lazy"
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- Bottom gradient shader (section-relative, just enough for the preview text) -->
	<div
		class="absolute left-0 right-0 bottom-0 z-20 pointer-events-none"
		style="height: 72px; background: linear-gradient(to top, hsl(var(--black)) 0%, hsl(var(--black) / 0.85) 30%, hsl(var(--black) / 0.4) 65%, transparent 100%);"
	></div>

	<!-- Preview label: desktop only, right column (same as image) -->
	<div
		class="absolute left-0 right-0 bottom-0 z-30 pb-4 pointer-events-none container mx-auto px-4 sm:px-6 md:px-8 lg:px-8 hidden lg:block"
	>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
			<div class="hidden lg:block"></div>
			<div class="flex justify-start items-end">
				<p class="text-left" style="color: hsl(var(--white33)); font-size: 12px;">
					* This is a preview of the coming version
				</p>
			</div>
		</div>
	</div>
</section>
