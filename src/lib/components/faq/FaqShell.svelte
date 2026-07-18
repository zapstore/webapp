<script lang="js">
	import FaqPage from './FaqPage.svelte';
	import { ArrowUp } from '$lib/components/icons';

	/** @type {{
		title: string,
		crosslinkHref: string,
		crosslinkLabel: string,
		crosslinkIconRotate?: string,
		sections: Array<{ id: string, label: string, items: Array<{ id: string, question: string, answer: string }> }>,
		onZapstoreDownload?: () => void
	}} */
	let {
		title,
		crosslinkHref,
		crosslinkLabel,
		crosslinkIconRotate = '45deg',
		sections,
		onZapstoreDownload
	} = $props();
</script>

<div class="faq-scroll" data-main-scroll>
	<div class="faq-root docs-content">
		<header class="faq-header">
			<h1 class="faq-title docs-page-title">{title}</h1>
			<a href={crosslinkHref} class="faq-crosslink btn-secondary-small">
				<span>{crosslinkLabel}</span>
				<span
					class="faq-crosslink-icon-wrap"
					style="transform: rotate({crosslinkIconRotate});"
					aria-hidden="true"
				>
					<ArrowUp variant="outline" size={14} strokeWidth={1.4} color="var(--white33)" />
				</span>
			</a>
		</header>
		<FaqPage {sections} {onZapstoreDownload} />
	</div>
</div>

<style>
	.faq-scroll {
		flex: 1;
		overflow-x: hidden;
	}

	.faq-root {
		--faq-pad-x: 14px;
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 0;
	}

	@media (min-width: 768px) {
		.faq-root {
			--faq-pad-x: 20px;
		}
	}

	.faq-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1rem;
		flex-wrap: wrap;
		padding: var(--docs-content-pad-top, var(--faq-pad-x)) var(--faq-pad-x) 0;
		min-height: 32px;
	}

	.faq-title {
		font-size: var(--docs-page-title-size);
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.2;
		color: var(--white);
		margin: 0;
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}

	@media (min-width: 768px) {
		.faq-title {
			font-size: var(--docs-page-title-size-md);
		}
	}

	.faq-crosslink {
		flex-shrink: 0;
		align-items: center;
		gap: 0.4rem;
		font-weight: 400;
		color: var(--white66);
		text-decoration: none;
		white-space: nowrap;
	}

	.faq-crosslink:hover {
		color: var(--white);
	}

	.faq-crosslink-icon-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
</style>
