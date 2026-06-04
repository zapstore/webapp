<script lang="js">
	import DocsPageHeader from '$lib/components/docs/DocsPageHeader.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { ArrowUp } from '$lib/components/icons';

	let showDownloadModal = $state(false);
</script>

<DocsPageHeader title="Get started">
	<section class="docs-get-started-section" aria-labelledby="get-started-user">
		<h2 id="get-started-user" class="docs-get-started-section-title">Users</h2>
		<p class="docs-get-started-text">
			Browse and install apps with secure installs and reliable updates. Back up your app list
			across devices, and optionally add a profile to enjoy our social features.
		</p>
		<div class="docs-get-started-actions">
			<button type="button" class="btn-primary-small" onclick={() => (showDownloadModal = true)}>
				Download Zapstore
			</button>
			<a href="/community/faq" class="docs-get-started-link btn-secondary-small">
				<span>User FAQ</span>
				<span class="docs-get-started-link-icon docs-get-started-link-icon--ne" aria-hidden="true">
					<ArrowUp variant="outline" size={14} strokeWidth={1.4} color="var(--white33)" />
				</span>
			</a>
		</div>
	</section>

	<div class="docs-get-started-divider divider" aria-hidden="true"></div>

	<section class="docs-get-started-section" aria-labelledby="get-started-developer">
		<h2 id="get-started-developer" class="docs-get-started-section-title">Developers</h2>
		<p class="docs-get-started-text">
			Publish apps directly to users with <code>zsp</code>. Get insights, monetize honestly, and build
			community around your releases without listing fees or a review queue.
		</p>
		<div class="docs-get-started-actions">
			<a href="/docs/publish" class="btn-primary-small docs-get-started-primary-link">
				Publishing guide
			</a>
			<a href="/docs/faq" class="docs-get-started-link btn-secondary-small">
				<span>Developer FAQ</span>
				<span class="docs-get-started-link-icon docs-get-started-link-icon--ne" aria-hidden="true">
					<ArrowUp variant="outline" size={14} strokeWidth={1.4} color="var(--white33)" />
				</span>
			</a>
		</div>
	</section>
</DocsPageHeader>

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />

<style>
	.docs-get-started-section-title {
		font-size: var(--docs-h2-size);
		font-weight: 650;
		line-height: 1.3;
		color: var(--white);
		margin: 0 0 0.5rem;
	}

	.docs-get-started-text {
		font-size: var(--docs-body-size);
		line-height: var(--docs-body-leading);
		color: var(--white66);
		margin: 0 0 0.875rem;
	}

	.docs-get-started-divider {
		margin: 1.75rem calc(-1 * var(--docs-pad-x, 14px)) var(--docs-header-body-gap, 1rem);
		width: calc(100% + 2 * var(--docs-pad-x, 14px));
	}

	.docs-get-started-text :global(code) {
		font-size: 0.875em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--white8);
		color: var(--white);
	}

	.docs-get-started-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}

	.docs-get-started-link {
		gap: 0.4rem;
		font-weight: 400;
		color: var(--white66);
		text-decoration: none;
	}

	.docs-get-started-link:hover {
		color: var(--white);
	}

	.docs-get-started-primary-link {
		text-decoration: none;
	}

	.docs-get-started-link-icon {
		display: inline-flex;
	}

	.docs-get-started-link-icon--ne {
		transform: rotate(45deg);
	}
</style>
