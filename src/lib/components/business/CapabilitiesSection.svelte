<script>
	import '$lib/styles/landing-display.css';

	const capabilities = [
		{
			title: 'A private, branded catalog',
			description:
				'Your name, your colors, your domain. Your users see your store — Zapstore is the engine underneath.'
		},
		{
			title: 'A white-label client',
			description:
				'A custom Android app (and, on the roadmap, more platforms) installed on devices you issue, pre-pointed at your catalog.'
		},
		{
			title: 'Self-hosted infrastructure',
			description:
				'Run the catalog relay inside your network or on infrastructure you own. Air-gapped deployments supported.'
		},
		{
			title: 'Curation & policy',
			description:
				"We help you define what belongs in your catalog, who's allowed to publish into it, and how releases are reviewed and approved."
		},
		{
			title: 'Signed-release assurance',
			description:
				'Cryptographic signatures, reproducible verification, and audit trails your security and compliance teams can actually use.'
		},
		{
			title: 'Hardware & device bundling',
			description:
				'Pre-load the client and your catalog onto phones, tablets, kiosks, POS terminals, or custom Android builds you ship to users.'
		},
		{
			title: 'Identity & access integration',
			description:
				'Hooks into your existing identity stack so the right people see the right catalog.'
		},
		{
			title: 'Advisory',
			description:
				"Strategy and architecture for deploying decentralized, censorship-resistant infrastructure inside an organization. If your situation isn't on this list, we want to hear about it."
		}
	];
</script>

<section class="border-t border-shell py-12 sm:py-16 lg:py-20">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="mb-8 sm:mb-12 text-center">
			<h2 class="display-section mb-4">
				<span
					style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
					>What a partnership<br class="sm:hidden" /> looks like</span
				>
			</h2>
			<p class="display-lead" style="color: var(--white66);">
				We engage on a small number of bespoke partnerships at a time. Common starting points:
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
			{#each capabilities as cap (cap.title)}
				<div class="panel panel-p-24 capability-card">
					<h3 class="capability-title">{cap.title}</h3>
					<p class="capability-desc">{cap.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.capability-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background-color: var(--gray33) !important;
		border-radius: 28px !important;
	}

	.capability-title {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--white);
		margin: 0;
	}

	@media (min-width: 768px) {
		.capability-title {
			font-size: 1.125rem;
		}
	}

	.capability-desc {
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--white66);
		margin: 0;
	}

	@media (min-width: 768px) {
		.capability-desc {
			font-size: 1rem;
		}
	}

	.capability-footnote {
		margin: 1.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--white33);
		text-align: center;
	}

	@media (min-width: 768px) {
		.capability-footnote {
			margin-top: 2rem;
			font-size: 0.875rem;
		}
	}
</style>
