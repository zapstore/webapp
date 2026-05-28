<script lang="js">
	/** @type {{ id: string, question: string, answer: string }} */
	let { id, question, answer } = $props();

	let detailsEl = $state(/** @type {HTMLDetailsElement | null} */ (null));

	function onToggle() {
		if (!detailsEl) return;
		const summary = detailsEl.querySelector('summary');
		if (summary) {
			summary.setAttribute('aria-expanded', detailsEl.open ? 'true' : 'false');
		}
	}
</script>

<details id={id} class="faq-item panel panel-gray33" bind:this={detailsEl} ontoggle={onToggle}>
	<summary class="faq-q">
		<h3 class="faq-q-heading">{question}</h3>
		<span class="faq-chevron" aria-hidden="true">
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</span>
	</summary>
	<div class="faq-body" role="region">
		<div class="faq-a">{@html answer}</div>
	</div>
</details>

<style>
	.faq-item {
		border-radius: 12px;
		overflow: hidden;
		scroll-margin-top: 5rem;
	}

	.faq-q {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		cursor: pointer;
		list-style: none;
		font-weight: 600;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: var(--white);
	}

	.faq-q::-webkit-details-marker {
		display: none;
	}

	.faq-q-heading {
		flex: 1;
		min-width: 0;
		margin: 0;
		font: inherit;
		font-weight: 600;
		text-align: left;
	}

	.faq-chevron {
		flex-shrink: 0;
		color: var(--white66);
		transition: transform 0.2s ease;
	}

	.faq-item[open] .faq-chevron {
		transform: rotate(180deg);
	}

	.faq-body {
		padding: 0 1.25rem 1.25rem;
	}

	.faq-a {
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--white99);
	}

	.faq-a :global(p) {
		margin: 0 0 0.75rem;
	}

	.faq-a :global(p:last-child) {
		margin-bottom: 0;
	}

	.faq-a :global(a) {
		color: var(--blurple, #7c6cff);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.faq-a :global(code) {
		font-size: 0.875em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--white11);
	}
</style>
