<script lang="js">
	/**
	 * Skeleton placeholder rows for the Forum feed — mirrors ForumPostCard layout exactly:
	 * smMd avatar (35px) + vertical connector + right column (name·timestamp / title / preview),
	 * with an optional L-shape reply row (connector corner + commenter avatar stack).
	 */
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	let { rows = 6 } = $props();

	/**
	 * Per-row variation data — drives widths and whether the reply row shows.
	 * nameWidth / titleWidth / contentWidth are percentages of the right column.
	 * titleLines: 1 = single-line title, 2 = add a second shorter title bar.
	 * showReply: render the L-shape commenter row at the bottom.
	 * commenterCount: how many small avatar circles to show in the reply row (1–3).
	 */
	const ROWS = [
		{ nameWidth: 28, titleWidth: 82, titleLines: 1, showContent: true,  contentWidth: 65, showReply: true,  commenterCount: 2 },
		{ nameWidth: 22, titleWidth: 68, titleLines: 2, showContent: false, contentWidth: 0,  showReply: false, commenterCount: 0 },
		{ nameWidth: 34, titleWidth: 74, titleLines: 1, showContent: true,  contentWidth: 80, showReply: true,  commenterCount: 3 },
		{ nameWidth: 26, titleWidth: 58, titleLines: 1, showContent: true,  contentWidth: 70, showReply: false, commenterCount: 0 },
		{ nameWidth: 30, titleWidth: 88, titleLines: 2, showContent: false, contentWidth: 0,  showReply: true,  commenterCount: 1 },
		{ nameWidth: 24, titleWidth: 76, titleLines: 1, showContent: true,  contentWidth: 56, showReply: true,  commenterCount: 2 },
	];
</script>

<div class="forum-feed-skeleton" role="status" aria-busy="true" aria-label="Loading forum posts">
	<span class="sr-only">Loading forum posts…</span>
	{#each Array(Math.min(10, Math.max(1, rows))) as _, i (i)}
		{@const r = ROWS[i % ROWS.length]}
		<div class="sk-card">
			<!-- Top row: left column (avatar + connector) + right column (meta / title / content) -->
			<div class="sk-top-row">
				<div class="sk-left-col">
					<div class="sk-avatar">
						<SkeletonLoader />
					</div>
					{#if r.showReply}
						<div class="sk-v-line"></div>
					{/if}
				</div>
				<div class="sk-right-col">
					<!-- Meta row: name pill + timestamp pill -->
					<div class="sk-meta-row">
						<div class="sk-name" style="width: {r.nameWidth}%">
							<SkeletonLoader />
						</div>
						<div class="sk-timestamp">
							<SkeletonLoader />
						</div>
					</div>
					<!-- Title: one or two lines -->
					<div class="sk-title" style="width: {r.titleWidth}%">
						<SkeletonLoader />
					</div>
					{#if r.titleLines === 2}
						<div class="sk-title sk-title-line2" style="width: {Math.round(r.titleWidth * 0.62)}%">
							<SkeletonLoader />
						</div>
					{/if}
					<!-- Content preview (optional) -->
					{#if r.showContent}
						<div class="sk-content" style="width: {r.contentWidth}%">
							<SkeletonLoader />
						</div>
					{/if}
				</div>
			</div>
			<!-- Reply row: L-shape connector + commenter avatar circles -->
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
							<div class="sk-commenter-avatar" style="margin-left: {j === 0 ? 0 : -6}px; z-index: {3 - j}">
								<SkeletonLoader />
							</div>
						{/each}
						<div class="sk-reply-text">
							<SkeletonLoader />
						</div>
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

	/* Each card mirrors .forum-post-card exactly — same padding + divider */
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

	/* Top row: flex with stretch so left col grows to match right col */
	.sk-top-row {
		display: flex;
		align-items: stretch;
		gap: 0;
	}

	/* Mirrors .left-column — 35px wide, centred children, slight top offset */
	.sk-left-col {
		width: 35px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2px;
	}

	/* Matches smMd ProfilePic (35×35) */
	.sk-avatar {
		width: 35px;
		height: 35px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* Connector line under avatar — same 1.5px style as .connector-vertical-only */
	.sk-v-line {
		width: 1.5px;
		flex: 1;
		min-height: 8px;
		background: var(--white16);
		margin-top: 0;
	}

	/* Right column mirrors .right-column — flex column, gap 5px */
	.sk-right-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 0 0 12px;
	}

	/* Meta row: name + timestamp side by side */
	.sk-meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: 18px;
	}

	.sk-name {
		height: 12px;
		border-radius: 10px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.sk-timestamp {
		width: 32px;
		height: 10px;
		border-radius: 8px;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* Title bar — matches semibold ~19px line height */
	.sk-title {
		height: 18px;
		border-radius: 10px;
		overflow: hidden;
	}

	/* Second title line is shorter and slightly reduced opacity */
	.sk-title-line2 {
		opacity: 0.65;
	}

	/* Content preview bar — single line */
	.sk-content {
		height: 14px;
		border-radius: 8px;
		overflow: hidden;
		opacity: 0.55;
	}

	/* Reply row: mirrors .reply-row — left margin aligns with avatar centre */
	.sk-reply-row {
		display: flex;
		align-items: flex-end;
		margin-left: 17px;
		width: calc(100% - 17px);
		margin-top: 0;
	}

	/* Mirrors .connector-column — 27px wide, vertical + corner */
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

	/* Repliers row: stacked avatar circles + name text bar */
	.sk-repliers {
		display: flex;
		align-items: center;
		padding-top: 4px;
		gap: 0;
		flex: 1;
		min-width: 0;
	}

	/* sm ProfilePic = 28px; matches ProfilePicStack `size="sm"` */
	.sk-commenter-avatar {
		width: 24px;
		height: 24px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
		border: 1.5px solid var(--black);
		box-sizing: border-box;
		position: relative;
	}

	.sk-reply-text {
		height: 11px;
		width: 80px;
		border-radius: 8px;
		overflow: hidden;
		margin-left: 8px;
		opacity: 0.6;
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
