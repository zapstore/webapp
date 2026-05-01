<script>
	import '$lib/styles/landing-display.css';
</script>

<section
	class="business-hero relative flex flex-col items-center overflow-hidden pb-12 sm:pb-20 lg:pb-28 px-4"
>
	<div class="business-eyebrow-wrap">
		<span class="eyebrow-label" style="color: var(--white33); font-size: 0.875rem;"
			>For Organizations</span
		>
	</div>

	<div class="hero-body relative z-10 text-center max-w-4xl pt-8">
		<h1 class="display-hero mb-4 sm:mb-6">
			<span
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Your own app store,<br /></span
			><span
				style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>for your people</span
			>
		</h1>

		<p class="display-lead mx-auto mb-4 max-w-2xl" style="color: var(--white66);">
			We help organizations stand up a curated, signed, verifiable app catalog for their users.
			Under their brand, on their infrastructure, with the engineering team behind Zapstore.
		</p>

		<div class="flex justify-center">
			<a href="#contact" class="btn-primary-large">Talk to us</a>
		</div>
	</div>
</section>

<style>
	.business-eyebrow-wrap {
		display: flex;
		justify-content: center;
		margin-top: 0;
	}

	.business-eyebrow-wrap :global(.eyebrow-label) {
		padding: 0.5rem 1.375rem 0.625rem 1.375rem;
		border-radius: 0 0 0.875rem 0.875rem;
		background-color: var(--white4);
	}
</style>
