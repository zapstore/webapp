<script lang="js">
	/**
	 * Skeleton placeholder rows for the Forum feed — mirrors ForumPostCard layout exactly.
	 *
	 * Heights are derived from the real card:
	 *   name-row   18px  (15px text × 1.2 line-height)
	 *   title-row  25px  (19px text × 1.3 line-height)
	 *   content    22px  (15px text × 1.45 line-height)
	 *   gap         5px  (matching .right-column gap: 5px)
	 *   → total right-col with content = 75px → card = 16+75+16 = 107px ✓
	 *
	 * Label chips match the real Label size="small" (24px, body + right-pointing arrow).
	 * They are solid/non-shimmering — just the characteristic label shape in a muted fill.
	 */
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	let { rows = 6 } = $props();

	/**
	 * titleWidth  — % of right col (varies the visible shimmer bar length).
	 * contentWidth — % of right col.
	 * labels — array of total pixel widths for each solid label chip (body + 12px point).
	 * showReply — render L-shape connector + commenter row.
	 * commenterCount — number of stacked avatar circles (1–3).
	 */
	const ROWS = [
		{ nameWidth: 26, titleWidth: 80, showContent: true,  contentWidth: 64, labels: [],           showReply: true,  commenterCount: 2 },
		{ nameWidth: 20, titleWidth: 66, showContent: false, contentWidth: 0,  labels: [48, 62],     showReply: false, commenterCount: 0 },
		{ nameWidth: 32, titleWidth: 84, showContent: true,  contentWidth: 72, labels: [],           showReply: true,  commenterCount: 3 },
		{ nameWidth: 23, titleWidth: 58, showContent: false, contentWidth: 0,  labels: [54, 40, 48], showReply: true,  commenterCount: 1 },
		{ nameWidth: 28, titleWidth: 72, showContent: true,  contentWidth: 56, labels: [],           showReply: false, commenterCount: 0 },
		{ nameWidth: 22, titleWidth: 90, showContent: false, contentWidth: 0,  labels: [46, 64],     showReply: false, commenterCount: 0 },
	];
</script>

<div class="forum-feed-skeleton" role="status" aria-busy="true" aria-label="Loading forum posts">
	<span class="sr-only">Loading forum posts…</span>
	{#each Array(Math.min(10, Math.max(1, rows))) as _, i (i)}
		{@const r = ROWS[i % ROWS.length]}
		<div class="sk-card">
			<div class="sk-top-row">
				<!-- Left column: avatar + optional vertical connector -->
				<div class="sk-left-col">
					<div class="sk-avatar">
						<SkeletonLoader />
					</div>
					{#if r.showReply}
						<div class="sk-v-line"></div>
					{/if}
				</div>

				<!-- Right column: name · title · content · labels -->
				<div class="sk-right-col">
					<!-- Name row — 18px container, 11px shimmer bar (matches 15px text × 1.2 LH) -->
					<div class="sk-name-row">
						<div class="sk-name-bar" style="width: {r.nameWidth}%">
							<SkeletonLoader />
						</div>
					</div>

					<!-- Title — 25px container, 17px shimmer bar (matches 19px text × 1.3 LH) -->
					<div class="sk-title-row">
						<div class="sk-title-bar" style="width: {r.titleWidth}%">
							<SkeletonLoader />
						</div>
					</div>

					<!-- Content preview (optional) — 22px container, 11px bar (15px × 1.45 LH) -->
					{#if r.showContent}
						<div class="sk-content-row">
							<div class="sk-content-bar" style="width: {r.contentWidth}%">
								<SkeletonLoader />
							</div>
						</div>
					{/if}

					<!-- Label chips — solid, no shimmer; match Label size="small" shape (24px, body+point) -->
					{#if r.labels.length > 0}
						<div class="sk-labels-row">
							{#each r.labels as chipWidth (chipWidth)}
								<div class="sk-label-chip">
									<div class="sk-label-body" style="width: {chipWidth - 12}px"></div>
									<div class="sk-label-point"></div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Reply row: L-shape connector + stacked commenter avatars -->
			{#if r.showReply}
				<div class="sk-reply-row">
					<div class="sk-connector-col">
						<div class="sk-connector-v"></div>
						<div class="sk-connector-corner">
							<svg viewBox="0 0 27 16" fill="none" aria-hidden="true">
								<path
									d="M1 0 L1 0 Q1 15 16 15 L27 15"
									stroke="var(--white16)"
									stroke-width="1.5"
									fill="none"
								/>
							</svg>
						</div>
					</div>
					<div class="sk-repliers">
						{#each Array(Math.min(3, r.commenterCount)) as _, j (j)}
							<div class="sk-commenter" style="margin-left: {j === 0 ? 0 : -8}px; z-index: {3 - j};">
								<SkeletonLoader />
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.forum-feed-skeleton {
		display: flex;
		flex-direction: column;
		width: 100%;
		box-sizing: border-box;
	}

	/* Mirrors .forum-post-card exactly */
	.sk-card {
		display: flex;
		flex-direction: column;
		padding: 16px;
		border-bottom: 1.4px solid var(--white11);
		box-sizing: border-box;
	}

	.sk-card:last-child {
		border-bottom: none;
	}

	.sk-top-row {
		display: flex;
		align-items: stretch;
	}

	/* Mirrors .left-column — 35px wide, items centred, 2px top offset */
	.sk-left-col {
		width: 35px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2px;
	}

	/* smMd ProfilePic = 35×35px */
	.sk-avatar {
		width: 35px;
		height: 35px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* Mirrors .connector-vertical-only */
	.sk-v-line {
		width: 1.5px;
		flex: 1;
		min-height: 8px;
		background: var(--white16);
	}

	/* Mirrors .right-column: flex-col, 5px gap, no padding (each child has its own left indent) */
	.sk-right-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding-left: 12px;
	}

	/* ── Name row ──────────────────────────────────────────────────────────────
	   18px tall = 15px text × 1.2 line-height. Bar is intentionally slim (11px)
	   to look like a text shimmer, not a block. */
	.sk-name-row {
		height: 18px;
		display: flex;
		align-items: center;
	}

	.sk-name-bar {
		height: 11px;
		border-radius: 9999px;
		overflow: hidden;
	}

	/* ── Title row ─────────────────────────────────────────────────────────────
	   25px = 19px text × 1.3 line-height. Bar at 17px reads as a bold heading. */
	.sk-title-row {
		height: 25px;
		display: flex;
		align-items: center;
	}

	.sk-title-bar {
		height: 17px;
		border-radius: 8px;
		overflow: hidden;
	}

	/* ── Content row ───────────────────────────────────────────────────────────
	   22px = 15px text × 1.45 line-height. */
	.sk-content-row {
		height: 22px;
		display: flex;
		align-items: center;
	}

	.sk-content-bar {
		height: 11px;
		border-radius: 9999px;
		overflow: hidden;
		opacity: 0.65;
	}

	/* ── Label chips ───────────────────────────────────────────────────────────
	   Match Label size="small": 24px tall, left-rounded body + right-pointing arrow.
	   No shimmer — solid muted fill. margin-top: 4px mirrors .labels-row. */
	.sk-labels-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}

	.sk-label-chip {
		display: inline-flex;
		align-items: stretch;
		height: 24px;
		flex-shrink: 0;
	}

	.sk-label-body {
		height: 24px;
		border-radius: 8px 0 0 8px;
		background: var(--white11);
	}

	/* CSS border-trick arrow — same color as body, pointing right */
	.sk-label-point {
		width: 0;
		height: 0;
		border-top: 12px solid transparent;
		border-bottom: 12px solid transparent;
		border-left: 12px solid var(--white11);
		flex-shrink: 0;
	}

	/* ── Reply row ─────────────────────────────────────────────────────────────
	   Mirrors .reply-row exactly. */
	.sk-reply-row {
		display: flex;
		align-items: flex-end;
		margin-left: 17px;
		width: calc(100% - 17px);
	}

	/* Mirrors .connector-column */
	.sk-connector-col {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 27px;
		flex-shrink: 0;
		padding-bottom: 14px;
	}

	.sk-connector-v {
		width: 1.5px;
		height: 12px;
		background: var(--white16);
	}

	.sk-connector-corner {
		width: 27px;
		height: 16px;
		flex-shrink: 0;
	}

	.sk-connector-corner svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* Commenter avatar circles — sm ProfilePic = 28px, overlapping with -8px margin */
	.sk-repliers {
		display: flex;
		align-items: center;
		padding-top: 4px;
	}

	.sk-commenter {
		width: 28px;
		height: 28px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
		border: 1.5px solid hsl(var(--background));
		box-sizing: border-box;
		position: relative;
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
