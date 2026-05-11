<script lang="js">
/**
 * ForumPostDetailSkeleton — tasteful shimmer placeholder for an opening forum post.
 * Mirrors the three-zone layout of ForumPostDetail:
 *   1. Header bar  (64 px — back chevron, avatar, name/timestamp, catalog label)
 *   2. Content     (padding 16 px — title block, body lines)
 *   3. Tab strip   (three pill buttons)
 */
import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
</script>

<div class="fpd-skeleton" role="status" aria-busy="true" aria-label="Loading post">
	<span class="sr-only">Loading post…</span>

	<!-- ── Header ─────────────────────────────────────────────────────── -->
	<div class="sk-header">
		<!-- Back chevron (static, non-shimmer) -->
		<div class="sk-back" aria-hidden="true">
			<svg viewBox="0 0 10 16" fill="none" width="10" height="16">
				<path d="M8 2 L2 8 L8 14" stroke="var(--white33)" stroke-width="1.8"
					stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</div>

		<!-- Avatar + name / timestamp -->
		<div class="sk-publisher">
			<div class="sk-avatar">
				<SkeletonLoader />
			</div>
			<div class="sk-pub-text">
				<div class="sk-name">
					<SkeletonLoader />
				</div>
				<div class="sk-ts">
					<SkeletonLoader />
				</div>
			</div>
		</div>

		<!-- Catalog label on the right -->
		<div class="sk-catalog">
			<SkeletonLoader />
		</div>
	</div>

	<!-- ── Content ────────────────────────────────────────────────────── -->
	<div class="sk-content">
		<!-- Title -->
		<div class="sk-title">
			<SkeletonLoader />
		</div>

		<!-- Body text lines -->
		<div class="sk-body">
			<div class="sk-line" style="width: 90%"><SkeletonLoader /></div>
			<div class="sk-line" style="width: 76%"><SkeletonLoader /></div>
			<div class="sk-line" style="width: 56%"><SkeletonLoader /></div>
		</div>

		<!-- Tab strip -->
		<div class="sk-tabs">
			<div class="sk-tab sk-tab-active"><SkeletonLoader /></div>
			<div class="sk-tab"><SkeletonLoader /></div>
			<div class="sk-tab"><SkeletonLoader /></div>
		</div>
	</div>
</div>

<style>
	/* ── Root ────────────────────────────────────────────────────────────── */
	.fpd-skeleton {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	/* ── Header (64 px — mirrors .detail-header) ─────────────────────────── */
	.sk-header {
		flex-shrink: 0;
		height: 64px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		border-bottom: 1px solid var(--white11);
		box-sizing: border-box;
	}

	.sk-back {
		width: 28px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.7;
	}

	.sk-publisher {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	.sk-avatar {
		width: 32px;
		height: 32px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.sk-pub-text {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.sk-name {
		width: 108px;
		height: 11px;
		border-radius: 9999px;
		overflow: hidden;
	}

	.sk-ts {
		width: 60px;
		height: 9px;
		border-radius: 9999px;
		overflow: hidden;
		opacity: 0.6;
	}

	.sk-catalog {
		width: 68px;
		height: 20px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
		opacity: 0.5;
	}

	/* ── Content (mirrors .content-inner padding) ────────────────────────── */
	.sk-content {
		padding: 20px 16px 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Title — 1.5 rem / 700 / line-height 1.3 → ~30 px actual render height */
	.sk-title {
		width: 72%;
		height: 28px;
		border-radius: 8px;
		overflow: hidden;
		margin-bottom: 18px;
	}

	/* Body lines — 0.9375 rem / line-height 1.6 → ~15 px per line */
	.sk-body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 28px;
	}

	.sk-line {
		height: 11px;
		border-radius: 9999px;
		overflow: hidden;
		opacity: 0.65;
	}

	/* Tab strip — 3 pills at 32 px (matches .btn-primary-small / .btn-secondary-small) */
	.sk-tabs {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.sk-tab {
		height: 32px;
		border-radius: 9999px;
		overflow: hidden;
		opacity: 0.45;
	}

	/* Widths approximate real tab labels ("Comments" / "Zaps" / "Details") */
	.sk-tab:nth-child(1) { width: 108px; }
	.sk-tab:nth-child(2) { width: 70px; }
	.sk-tab:nth-child(3) { width: 80px; }

	/* First tab slightly brighter — represents the active/selected state */
	.sk-tab-active {
		opacity: 0.7;
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
