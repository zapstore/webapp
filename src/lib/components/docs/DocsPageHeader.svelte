<script lang="js">
	/** Page chrome: padded title row + full-width rule + consistently padded body. */
	let { title = '', children } = $props();
</script>

<div class="docs-page docs-content">
	<header class="docs-page-header">
		<div class="docs-page-header-row">
			<h1 class="docs-page-title">{title}</h1>
		</div>
		<div class="docs-page-header-rule" aria-hidden="true"></div>
	</header>
	<div class="docs-page-body">
		{@render children()}
	</div>
</div>

<style>
	.docs-page {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 0;
	}

	.docs-page-header {
		flex-shrink: 0;
	}

	.docs-page-header-row {
		padding: var(--docs-content-pad-top, 14px) var(--docs-pad-x, 14px) 0.75rem;
	}

	.docs-page-header-row :global(.docs-page-title) {
		margin: 0;
	}

	.docs-page-header-rule {
		height: 1px;
		width: 100%;
		background: var(--shell-border);
		flex-shrink: 0;
	}

	.docs-page-body {
		padding: var(--docs-header-body-gap, 1rem) var(--docs-pad-x, 14px) 2rem;
		min-width: 0;
	}
</style>
