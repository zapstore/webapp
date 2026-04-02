<script lang="js">
	/**
	 * Placeholder rows for Community activity feed — mirrors CommentCard layout (badge rail, avatar, title, bubble).
	 * Bubble: single shimmer block only (same idea as SocialTabs + BubbleSkeleton — no faux text lines inside).
	 */
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	let { rows = 5 } = $props();

	/** Varying bubble widths/heights — aligned with BubbleSkeleton.svelte ROWS for a similar feel */
	const BUBBLE_ROWS = [
		{ bubbleWidth: 48, bubbleHeight: 52 },
		{ bubbleWidth: 38, bubbleHeight: 40 },
		{ bubbleWidth: 55, bubbleHeight: 58 },
		{ bubbleWidth: 42, bubbleHeight: 44 },
		{ bubbleWidth: 52, bubbleHeight: 48 },
		{ bubbleWidth: 45, bubbleHeight: 42 },
		{ bubbleWidth: 58, bubbleHeight: 54 },
		{ bubbleWidth: 40, bubbleHeight: 46 }
	];
</script>

<div class="activity-feed-skeleton" role="status" aria-busy="true" aria-label="Loading activity">
	<span class="sr-only">Loading activity…</span>
	{#each Array(Math.min(8, Math.max(1, rows))) as _, i (i)}
		{@const br = BUBBLE_ROWS[i % BUBBLE_ROWS.length]}
		<div class="sk-row">
			<div class="sk-left">
				<div class="sk-badge">
					<SkeletonLoader />
				</div>
				<div class="sk-rail">
					<SkeletonLoader />
				</div>
				<div class="sk-avatar">
					<SkeletonLoader />
				</div>
			</div>
			<div class="sk-right">
				<div class="sk-title-line">
					<SkeletonLoader />
				</div>
				<div class="sk-bubble-wrap">
					<div
						class="sk-bubble"
						style="min-width: {br.bubbleWidth}%; height: {br.bubbleHeight}px;"
					>
						<SkeletonLoader />
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.activity-feed-skeleton {
		display: flex;
		flex-direction: column;
		padding: 8px 0 16px;
		width: 100%;
		box-sizing: border-box;
	}

	.sk-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--white11));
	}

	.sk-row:last-child {
		border-bottom: none;
	}

	.sk-left {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 36px;
	}

	/* Matches CommentCard / ZapActivityCard `.emoji-badge` (28×28, 6px radius); stack mini uses 9+2+9 grid */
	.sk-badge {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.sk-rail {
		width: 2px;
		flex: 1;
		min-height: 20px;
		margin: 4px 0;
		border-radius: 1px;
		overflow: hidden;
	}

	.sk-avatar {
		width: 35px;
		height: 35px;
		border-radius: 9999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* Match CommentCard .right-col: 4px gap; bubble sits on bottom next to avatar */
	.sk-right {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1;
		min-height: 0;
		padding-top: 2px;
		align-items: stretch;
	}

	.sk-bubble-wrap {
		margin-top: auto;
		display: flex;
		justify-content: flex-start;
		min-width: 0;
	}

	/* Title row ~28px tall; bar uses rounded-xl (12px) per SkeletonLoader guidelines */
	.sk-title-line {
		height: 14px;
		max-width: 68%;
		border-radius: 12px;
		overflow: hidden;
	}

	/* Match BubbleSkeleton: one shimmer block, message-bubble corners, no inner line placeholders */
	.sk-bubble {
		max-width: 100%;
		width: fit-content;
		border-radius: 12px 12px 12px 3px;
		overflow: hidden;
		flex-shrink: 0;
		opacity: 0.33;
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
