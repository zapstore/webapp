<script lang="js">
	import FaqItem from './FaqItem.svelte';

	/** @type {{ sections: Array<{ id: string, label: string, items: Array<{ id: string, question: string, answer: string }> }>, onZapstoreDownload?: () => void }} */
	let { sections, onZapstoreDownload } = $props();

	/** @param {MouseEvent} event */
	function handleFaqClick(event) {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const trigger = target.closest('[data-faq-download="zapstore"]');
		if (!trigger) return;
		event.preventDefault();
		onZapstoreDownload?.();
	}
</script>

<div class="faq-page" onclick={handleFaqClick}>
	{#each sections as section, sectionIndex (section.id)}
		<section
			class="faq-section"
			class:faq-section--first={sectionIndex === 0}
			aria-labelledby="faq-section-{section.id}"
		>
			<h2 id="faq-section-{section.id}" class="faq-section-label eyebrow-label">
				{section.label}
			</h2>
			<div class="faq-list">
				{#each section.items as item (item.id)}
					<FaqItem id={item.id} question={item.question} answer={item.answer} />
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.faq-page {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.faq-section {
		width: 100%;
	}

	.faq-section-label {
		display: block;
		padding: 2.25rem var(--faq-pad-x, 14px) 0.625rem;
		margin: 0;
		color: var(--white33);
	}

	.faq-section--first .faq-section-label {
		padding-top: 1.25rem;
	}

	.faq-list {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.faq-list :global(.faq-item:last-child) {
		border-bottom: 1px solid var(--shell-border);
	}
</style>
