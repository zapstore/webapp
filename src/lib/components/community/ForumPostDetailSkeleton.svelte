<script lang="js">
	/**
	 * Loading placeholder for forum post detail — mirrors ForumPostDetail zones without
	 * faux body-text shimmers (SkeletonLoader is for images/titles only per design system).
	 */
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
</script>

<div class="fpd-skeleton" role="status" aria-busy="true" aria-label="Loading post">
	<span class="sr-only">Loading post…</span>

	<div class="sk-header">
		<div class="sk-avatar">
			<SkeletonLoader />
		</div>
		<div class="sk-header-text">
			<div class="sk-name-bar">
				<SkeletonLoader />
			</div>
			<div class="sk-ts-placeholder" aria-hidden="true"></div>
		</div>
	</div>

	<div class="sk-scroll">
		<div class="sk-inner">
			<div class="sk-title-bar">
				<SkeletonLoader />
			</div>
			<div class="sk-body-placeholder" aria-hidden="true"></div>
			<div class="sk-tabs" aria-hidden="true">
				<div class="sk-tab-placeholder sk-tab-placeholder--wide"></div>
				<div class="sk-tab-placeholder"></div>
				<div class="sk-tab-placeholder sk-tab-placeholder--mid"></div>
			</div>
		</div>
	</div>
</div>

<style>
	.fpd-skeleton {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.sk-header {
		flex-shrink: 0;
		height: 64px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		border-bottom: 1px solid var(--shell-border);
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.sk-header {
			padding-left: 20px;
			padding-right: 20px;
		}
	}

	.sk-avatar {
		width: 32px;
		height: 32px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.sk-header-text {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.sk-name-bar {
		width: 108px;
		height: 12px;
		border-radius: 12px;
		overflow: hidden;
	}

	.sk-ts-placeholder {
		width: 64px;
		height: 9px;
		border-radius: 9999px;
		background: var(--white8);
	}

	.sk-scroll {
		--page-content-pad-x: 12px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.sk-scroll {
			--page-content-pad-x: 20px;
		}
	}

	.sk-inner {
		padding: 0 var(--page-content-pad-x) 16px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.sk-title-bar {
		width: 72%;
		height: 28px;
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 12px;
	}

	.sk-body-placeholder {
		width: 100%;
		height: 72px;
		border-radius: 12px;
		background: var(--white8);
		margin-bottom: 20px;
	}

	.sk-tabs {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.sk-tab-placeholder {
		height: 32px;
		width: 70px;
		border-radius: 9999px;
		background: var(--white8);
		flex-shrink: 0;
	}

	.sk-tab-placeholder--wide {
		width: 108px;
		background: var(--white16);
	}

	.sk-tab-placeholder--mid {
		width: 80px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
