<script>
	import { ChevronRight } from '$lib/components/icons';
</script>

<section class="publish-cta border-b border-border/50">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<a
			href="/docs/publish"
			class="btn-glass-large btn-glass-with-chevron group inline-flex items-center justify-center gap-3"
		>
			Start Publishing
			<ChevronRight
				variant="outline"
				color="var(--white33)"
				size={18}
				className="transition-transform group-hover:translate-x-0.5"
			/>
		</a>
	</div>
</section>

<style>
	.publish-cta {
		padding: 3rem 0 3.5rem;
	}

	@media (min-width: 768px) {
		.publish-cta {
			padding: 4rem 0 4.5rem;
		}
	}

	@media (min-width: 1024px) {
		.publish-cta {
			padding: 5rem 0 5.5rem;
		}
	}
</style>
