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

<details id={id} class="faq-item" bind:this={detailsEl} ontoggle={onToggle}>
	<summary class="faq-q">
		<h3 class="faq-q-heading">{question}</h3>
		<span class="faq-chevron" aria-hidden="true">
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
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
		border-top: 1px solid var(--shell-border);
		scroll-margin-top: 5rem;
	}

	.faq-q {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem var(--faq-pad-x, 14px);
		cursor: pointer;
		list-style: none;
		font-weight: 600;
		font-size: var(--docs-body-size, 0.9375rem);
		line-height: var(--docs-body-leading, 1.4);
		color: var(--white);
	}

	@media (min-width: 768px) {
		.faq-q {
			padding-top: 1.125rem;
			padding-bottom: 1.125rem;
		}
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
		color: var(--white33);
		transition: transform 0.2s ease, color 0.15s ease;
	}

	.faq-item[open] .faq-chevron {
		transform: rotate(180deg);
		color: var(--white66);
	}

	.faq-body {
		padding: 0 var(--faq-pad-x, 14px) 1.125rem;
	}

	.faq-a {
		font-size: var(--docs-body-size, 0.9375rem);
		line-height: var(--docs-body-leading, 1.55);
		color: var(--white66);
	}

	.faq-a :global(p) {
		margin: 0 0 0.75rem;
	}

	.faq-a :global(p:last-child) {
		margin-bottom: 0;
	}

	.faq-a :global(ol) {
		margin: 0 0 0.75rem;
		padding-left: 1.25rem;
	}

	.faq-a :global(ol li) {
		margin-bottom: 0.35rem;
	}

	.faq-a :global(ol li:last-child) {
		margin-bottom: 0;
	}

	.faq-a :global(strong) {
		color: var(--white);
		font-weight: 600;
	}

	.faq-a :global(a) {
		color: var(--blurpleColor);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.faq-a :global(a:hover) {
		color: var(--blurpleLightColor);
	}

	.faq-a :global(a[data-faq-download]) {
		cursor: pointer;
	}

	.faq-a :global(code) {
		font-size: 0.875em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--white8);
	}
</style>
