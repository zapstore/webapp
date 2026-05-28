<script lang="js">
	import FaqItem from './FaqItem.svelte';

	/** @type {{ sections: Array<{ id: string, label: string, items: Array<{ id: string, question: string, answer: string }> }> }} */
	let { sections } = $props();
</script>

<div class="faq-page">
	{#each sections as section (section.id)}
		<section class="faq-section" aria-labelledby="faq-section-{section.id}">
			<h2 id="faq-section-{section.id}" class="faq-section-label">{section.label}</h2>
			<div class="faq-list">
				{#each section.items as item (item.id)}
					<FaqItem question={item.question} answer={item.answer} />
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.faq-page {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.faq-section-label {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--white66);
		margin: 0 0 0.75rem;
	}

	.faq-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
