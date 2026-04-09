<script lang="js">
	/**
	 * Rounded square + question mark for activity / thread roots that never resolved.
	 * Tile matches CommentCard `.emoji-badge`: 28×28, 6px radius.
	 * `embedded` — parent `.emoji-badge` provides the tile; no second box/bg.
	 */
	let { className = '', embedded = false } = $props();
</script>

<div
	class="activity-deleted-root-badge {className}"
	class:activity-deleted-root-badge--embedded={embedded}
	aria-hidden="true"
>
	<span class="activity-missing-root-question">?</span>
</div>

<style>
	.activity-deleted-root-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.activity-deleted-root-badge:not(.activity-deleted-root-badge--embedded) {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: hsl(var(--white8));
	}

	.activity-deleted-root-badge--embedded {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		background: transparent;
	}

	.activity-missing-root-question {
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1;
		color: hsl(var(--white33));
	}
</style>
