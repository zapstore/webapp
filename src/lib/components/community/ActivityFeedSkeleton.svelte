<script lang="js">
	/**
	 * Placeholder rows for Community activity feed — mirrors CommentCard layout (badge rail, avatar, title, bubble).
	 * Bubble: single shimmer block only (same idea as SocialTabs + BubbleSkeleton — no faux text lines inside).
	 */
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	let { rows = 5 } = $props();

	/**
	 * Per-row variation data.
	 * titleWidth  — % width of the root-label shimmer bar (35–70 range mirrors short to long labels).
	 * bubbleWidth — % min-width of the bubble block (40–72 range).
	 * bubbleHeight — px height of the bubble block. Real bubbles:
	 *   1-line  ≈ 58px  (header ~29px + 1 text line ~22px + 6px bottom padding)
	 *   2-line  ≈ 80px  (+22px per additional line)
	 *   3-line  ≈ 100px
	 * Spread intentionally across this range so the skeleton list looks like a real mixed feed.
	 */
	const ROWS = [
		{ titleWidth: 55, bubbleWidth: 62, bubbleHeight: 58  },
		{ titleWidth: 38, bubbleWidth: 44, bubbleHeight: 80  },
		{ titleWidth: 68, bubbleWidth: 70, bubbleHeight: 100 },
		{ titleWidth: 42, bubbleWidth: 52, bubbleHeight: 58  },
		{ titleWidth: 60, bubbleWidth: 66, bubbleHeight: 80  },
		{ titleWidth: 35, bubbleWidth: 46, bubbleHeight: 58  },
		{ titleWidth: 72, bubbleWidth: 72, bubbleHeight: 100 },
		{ titleWidth: 48, bubbleWidth: 58, bubbleHeight: 80  }
	];
</script>

<div class="activity-feed-skeleton" role="status" aria-busy="true" aria-label="Loading activity">
	<span class="sr-only">Loading activity…</span>
	{#each Array(Math.min(8, Math.max(1, rows))) as _, i (i)}
		{@const r = ROWS[i % ROWS.length]}
		<div class="sk-row">
			<div class="sk-left">
				<div class="sk-badge">
					<SkeletonLoader />
				</div>
				<div class="sk-rail" aria-hidden="true"></div>
				<div class="sk-avatar">
					<SkeletonLoader />
				</div>
			</div>
			<div class="sk-right">
				<div class="sk-title-line" style="width: {r.titleWidth}%">
					<div class="sk-title-bar">
						<SkeletonLoader />
					</div>
				</div>
				<div class="sk-bubble-wrap">
					<div
						class="sk-bubble"
						style="min-width: {r.bubbleWidth}%; height: {r.bubbleHeight}px;"
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
		border-bottom: 1px solid var(--white11);
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

	/* Same 2px line as CommentCard / ZapActivityCard `.line-solid`; no margin so it runs badge → avatar */
	.sk-rail {
		width: 2px;
		flex: 1;
		min-height: 12px;
		align-self: center;
		background: var(--white16);
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

	/* Matches CommentCard .root-label-row — 28px tall container, text centred inside.
	   Width is set inline per-row so each label shimmer has a different length. */
	.sk-title-line {
		height: 28px;
		display: flex;
		align-items: center;
	}

	/* Actual shimmer bar — 14px tall with pill radius, same as before */
	.sk-title-bar {
		height: 14px;
		width: 100%;
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
