<script>
	import '$lib/styles/landing-display.css';

	const cards = [
		{
			title: 'Your users need apps you can stand behind',
			description:
				"Employees, members, students, customers — they're installing software in your name. You need to know exactly what they're getting, every release, every device."
		},
		{
			title: "Mainstream stores aren't built for your context",
			description:
				"Your users may be on managed devices, in regions with no Play Store, on de-Googled hardware, or in environments where Apple and Google's policies don't fit your compliance posture."
		},
		{
			title: "Generic MDM doesn't curate — it just blocks",
			description:
				"You don't want a deny-list. You want a positive catalog: a hand-picked, signed, branded set of apps your users can trust by default."
		}
	];
</script>

<section class="border-t border-border/50 py-12 sm:py-16 lg:py-20">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl mb-8 sm:mb-12">
			<h2 class="display-section mb-4">
				<span
					style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
					>The app store wasn't built<br class="hidden sm:block" /> for your situation</span
				>
			</h2>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
			{#each cards as card (card.title)}
				<div class="panel panel-p-24 pressure-card">
					<h3 class="pressure-title">{card.title}</h3>
					<p class="pressure-desc">{card.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.pressure-card {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.pressure-title {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--white);
		margin: 0;
	}

	@media (min-width: 768px) {
		.pressure-title {
			font-size: 1.1875rem;
		}
	}

	.pressure-desc {
		font-size: 1rem;
		line-height: 1.55;
		color: var(--white66);
		margin: 0;
	}
</style>
